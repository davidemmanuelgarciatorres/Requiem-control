"""Integración con Google (Sheets, Drive, Gmail) por OAuth 2.0 oficial.

Seguridad:
- Flujo "authorization code" con PKCE (S256) y `state` aleatorio de un solo uso, ligado a la
  persona y a la organización activas, con caducidad de 10 minutos (se guarda solo su hash).
- Permisos mínimos y de SOLO LECTURA por servicio; el usuario elige qué servicios conectar.
- Tokens cifrados en reposo (Fernet); el secreto del cliente solo existe en el servidor.
- Nunca se marca como conectada sin un intercambio de tokens exitoso con Google.
"""

import base64
import csv
import hashlib
import io
import secrets
import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlencode

import httpx2
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import audit, entitlements
from app.config import get_settings
from app.db import set_tenant_context
from app.errors import ApiError
from app.integrations import crypto
from app.models import Integration, OAuthState, Plan

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"  # noqa: S105 — URL pública, no es un secreto
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
DRIVE_FILES = "https://www.googleapis.com/drive/v3/files"
SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets"
GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me"

BASE_SCOPES = ["openid", "email"]
SERVICE_SCOPES: dict[str, list[str]] = {
    "sheets": [
        "https://www.googleapis.com/auth/spreadsheets.readonly",
        "https://www.googleapis.com/auth/drive.metadata.readonly",  # para listar las hojas
    ],
    "drive": ["https://www.googleapis.com/auth/drive.metadata.readonly"],
    "gmail": ["https://www.googleapis.com/auth/gmail.readonly"],
    # Crear BORRADORES (nunca enviar): lo usa el agente de correo y solo tras aprobación humana.
    "gmail_drafts": ["https://www.googleapis.com/auth/gmail.compose"],
}
SERVICES = tuple(SERVICE_SCOPES)
STATE_TTL = timedelta(minutes=10)
MAX_SHEET_ROWS = 100_000

# Fábrica del cliente HTTP (las pruebas la sustituyen por un transporte simulado).
client_factory: Callable[[], httpx2.Client] = lambda: httpx2.Client(timeout=20.0)  # noqa: E731


def _hash(state: str) -> bytes:
    return hashlib.sha256(state.encode()).digest()


def missing_configuration() -> list[str]:
    s = get_settings()
    missing = []
    if not s.google_oauth_client_id:
        missing.append("GOOGLE_OAUTH_CLIENT_ID")
    if not s.google_oauth_client_secret or not s.google_oauth_client_secret.get_secret_value():
        missing.append("GOOGLE_OAUTH_CLIENT_SECRET")
    if not crypto.available():
        missing.append("INTEGRATIONS_ENCRYPTION_KEY")
    return missing


def plan_allows(db: Session, org_id: uuid.UUID) -> bool:
    if get_settings().allow_integrations_on_free:
        return True
    plan_code = entitlements.for_organization(db, org_id).plan_code
    plan = db.execute(select(Plan).where(Plan.code == plan_code)).scalar_one()
    return bool((plan.features or {}).get("integrations"))


def _require_ready(db: Session, org_id: uuid.UUID) -> None:
    missing = missing_configuration()
    if missing:
        raise ApiError(
            503,
            "integration.not_configured",
            "La integración no está configurada en el servidor.",
            {"missing": missing},
        )
    if not plan_allows(db, org_id):
        raise ApiError(402, "plan.integrations", "Tu plan no incluye integraciones.")


def get(db: Session, org_id: uuid.UUID) -> Integration | None:
    return db.execute(
        select(Integration).where(Integration.organization_id == org_id, Integration.provider == "google")
    ).scalar_one_or_none()


# --- Conexión -------------------------------------------------------------------------------
def start(db: Session, *, org_id: uuid.UUID, user_id: uuid.UUID, services: list[str]) -> str:
    _require_ready(db, org_id)
    chosen = sorted({x for x in services if x in SERVICE_SCOPES})
    if not chosen:
        raise ApiError(422, "integration.no_services", "Elige al menos un servicio.")
    current = get(db, org_id)
    if current and current.status == "connected":
        chosen = sorted(set(chosen) | set(current.services))  # autorización incremental
    state = secrets.token_urlsafe(32)
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    db.add(
        OAuthState(
            state_hash=_hash(state),
            organization_id=org_id,
            user_id=user_id,
            provider="google",
            services=chosen,
            code_verifier_enc=crypto.encrypt(verifier),
            expires_at=datetime.now(UTC) + STATE_TTL,
        )
    )
    s = get_settings()
    scopes = BASE_SCOPES + sorted({sc for svc in chosen for sc in SERVICE_SCOPES[svc]})
    params = {
        "client_id": s.google_oauth_client_id,
        "redirect_uri": s.google_oauth_redirect_uri,
        "response_type": "code",
        "scope": " ".join(scopes),
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "access_type": "offline",
        "include_granted_scopes": "true",
        "prompt": "consent",
    }
    return f"{AUTH_URL}?{urlencode(params)}"


def finish(
    db: Session, *, org_id: uuid.UUID, user_id: uuid.UUID, state: str, code: str | None, error: str | None
) -> Integration:
    """Callback de Google. Devuelve la integración conectada o lanza ApiError con un código estable."""
    row = db.execute(select(OAuthState).where(OAuthState.state_hash == _hash(state))).scalar_one_or_none()
    # RLS ya limita a la persona y organización activas; se verifica también de forma explícita.
    if row is None or row.user_id != user_id or row.organization_id != org_id:
        raise ApiError(400, "integration.invalid_state", "La solicitud de conexión no es válida o es de otra sesión.")
    if row.used_at is not None:
        raise ApiError(400, "integration.state_used", "Esta solicitud de conexión ya se usó.")
    if row.expires_at < datetime.now(UTC):
        raise ApiError(400, "integration.state_expired", "La solicitud de conexión caducó. Inténtalo de nuevo.")
    row.used_at = datetime.now(UTC)
    db.flush()
    if error or not code:
        raise ApiError(
            400, "integration.denied", "La conexión se canceló o Google la rechazó.", {"reason": error or "no_code"}
        )

    s = get_settings()
    secret = s.google_oauth_client_secret.get_secret_value() if s.google_oauth_client_secret else ""
    with client_factory() as http:
        try:
            tok = http.post(
                TOKEN_URL,
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": s.google_oauth_redirect_uri,
                    "client_id": s.google_oauth_client_id,
                    "client_secret": secret,
                    "code_verifier": crypto.decrypt(row.code_verifier_enc),
                },
            )
        except httpx2.HTTPError as e:
            raise ApiError(502, "integration.unreachable", "No se pudo contactar a Google.") from e
        if tok.status_code != 200:
            raise ApiError(
                502,
                "integration.token_exchange_failed",
                "Google no aceptó el código de autorización.",
                {"status": tok.status_code},
            )
        t = tok.json()
        if not t.get("access_token"):
            raise ApiError(502, "integration.token_exchange_failed", "Google no devolvió un token de acceso.")
        email = None
        try:
            info = http.get(USERINFO_URL, headers={"Authorization": f"Bearer {t['access_token']}"})
            if info.status_code == 200:
                email = info.json().get("email")
        except httpx2.HTTPError:
            email = None

    granted = set(str(t.get("scope", "")).split())
    services = [svc for svc in row.services if all(sc in granted for sc in SERVICE_SCOPES[svc])]
    if not services:
        raise ApiError(400, "integration.scopes_not_granted", "No se concedieron los permisos necesarios.")
    integ = get(db, org_id) or Integration(organization_id=org_id, provider="google", status="disconnected")
    prev_refresh = integ.refresh_token_enc
    integ.status = "connected"
    integ.services = services
    integ.scopes = sorted(granted)
    integ.account_email = email
    integ.access_token_enc = crypto.encrypt(t["access_token"])
    integ.refresh_token_enc = crypto.encrypt(t["refresh_token"]) if t.get("refresh_token") else prev_refresh
    integ.token_expires_at = datetime.now(UTC) + timedelta(seconds=int(t.get("expires_in", 3600)))
    integ.connected_by = user_id
    integ.connected_at = datetime.now(UTC)
    integ.last_error = None
    integ.updated_at = datetime.now(UTC)
    db.add(integ)
    db.flush()
    audit.record(
        db,
        "integration.connect",
        organization_id=org_id,
        user_id=user_id,
        target_type="integration",
        target_id=integ.id,
        details={"provider": "google", "services": services},
    )
    return integ


def _fail(db: Session, integ: Integration, code: str, status: int = 502, **params: Any) -> ApiError:
    integ.last_error = {"code": code, "at": datetime.now(UTC).isoformat(), **params}
    if code == "integration.reauth_required":
        integ.status = "error"
    integ.updated_at = datetime.now(UTC)
    # Se confirma aunque la petición termine en error: el estado y el último error deben verse en la pantalla.
    db.commit()
    set_tenant_context(db, user_id=None, org_id=integ.organization_id)
    return ApiError(
        status,
        code,
        "Google respondió con un error."
        if code != "integration.reauth_required"
        else "La conexión con Google caducó o se revocó. Vuelve a conectar.",
        params,
    )


def _refresh(db: Session, integ: Integration, http: httpx2.Client) -> str:
    if not integ.refresh_token_enc:
        raise _fail(db, integ, "integration.reauth_required", 409)
    s = get_settings()
    secret = s.google_oauth_client_secret.get_secret_value() if s.google_oauth_client_secret else ""
    r = http.post(
        TOKEN_URL,
        data={
            "grant_type": "refresh_token",
            "refresh_token": crypto.decrypt(integ.refresh_token_enc),
            "client_id": s.google_oauth_client_id,
            "client_secret": secret,
        },
    )
    if r.status_code != 200:
        raise _fail(db, integ, "integration.reauth_required", 409)
    t = r.json()
    integ.access_token_enc = crypto.encrypt(t["access_token"])
    integ.token_expires_at = datetime.now(UTC) + timedelta(seconds=int(t.get("expires_in", 3600)))
    db.flush()
    return str(t["access_token"])


def _call(
    db: Session, integ: Integration, http: httpx2.Client, url: str, params: dict[str, Any] | None = None
) -> dict[str, Any]:
    if integ.status != "connected" or not integ.access_token_enc:
        raise ApiError(409, "integration.not_connected", "La integración no está conectada.")
    token = crypto.decrypt(integ.access_token_enc)
    if integ.token_expires_at and integ.token_expires_at - timedelta(seconds=60) < datetime.now(UTC):
        token = _refresh(db, integ, http)
    for attempt in range(2):
        try:
            r = http.get(url, params=params, headers={"Authorization": f"Bearer {token}"})
        except httpx2.HTTPError as e:
            raise _fail(db, integ, "integration.unreachable") from e
        if r.status_code == 401 and attempt == 0:
            token = _refresh(db, integ, http)
            continue
        if r.status_code == 403:
            raise _fail(db, integ, "integration.forbidden", 403)
        if r.status_code == 404:
            raise ApiError(404, "integration.resource_not_found", "No se encontró el recurso en Google.")
        if r.status_code >= 400:
            raise _fail(db, integ, "integration.provider_error", 502, http_status=r.status_code)
        integ.last_sync_at = datetime.now(UTC)
        integ.last_error = None
        return dict(r.json())
    raise _fail(db, integ, "integration.reauth_required", 409)


def _need(integ: Integration | None, service: str) -> Integration:
    if integ is None or integ.status != "connected":
        raise ApiError(409, "integration.not_connected", "La integración no está conectada.")
    if service not in integ.services:
        raise ApiError(409, "integration.service_not_granted", "Ese servicio no está conectado.", {"service": service})
    return integ


def disconnect(db: Session, *, org_id: uuid.UUID, user_id: uuid.UUID) -> None:
    integ = get(db, org_id)
    if integ is None:
        raise ApiError(404, "integration.not_connected", "La integración no está conectada.")
    token_enc = integ.refresh_token_enc or integ.access_token_enc
    revoked = False
    if token_enc and crypto.available():
        try:
            with client_factory() as http:
                revoked = http.post(REVOKE_URL, data={"token": crypto.decrypt(token_enc)}).status_code == 200
        except (httpx2.HTTPError, crypto.CryptoUnavailable):
            revoked = False
    integ.status = "disconnected"
    integ.services = []
    integ.scopes = []
    integ.access_token_enc = None
    integ.refresh_token_enc = None
    integ.token_expires_at = None
    integ.updated_at = datetime.now(UTC)
    db.flush()
    audit.record(
        db,
        "integration.disconnect",
        organization_id=org_id,
        user_id=user_id,
        target_type="integration",
        target_id=integ.id,
        details={"provider": "google", "revoked_at_google": revoked},
    )


# --- Lectura -----------------------------------------------------------------------------------
def list_spreadsheets(db: Session, org_id: uuid.UUID, query: str | None) -> list[dict[str, Any]]:
    integ = _need(get(db, org_id), "sheets")
    q = "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false"
    if query:
        safe = query.replace("\\", "\\\\").replace("'", "\\'")[:100]
        q += f" and name contains '{safe}'"
    with client_factory() as http:
        data = _call(
            db,
            integ,
            http,
            DRIVE_FILES,
            {"q": q, "orderBy": "modifiedTime desc", "pageSize": 25, "fields": "files(id,name,modifiedTime)"},
        )
    return [
        {"id": f["id"], "name": f.get("name", ""), "modified_at": f.get("modifiedTime")} for f in data.get("files", [])
    ]


def sheet_tabs(db: Session, org_id: uuid.UUID, spreadsheet_id: str) -> dict[str, Any]:
    integ = _need(get(db, org_id), "sheets")
    with client_factory() as http:
        meta = _call(
            db, integ, http, f"{SHEETS_API}/{spreadsheet_id}", {"fields": "properties.title,sheets.properties.title"}
        )
    return {
        "title": meta.get("properties", {}).get("title", "Hoja"),
        "tabs": [s["properties"]["title"] for s in meta.get("sheets", [])],
    }


def sheet_as_csv(db: Session, org_id: uuid.UUID, spreadsheet_id: str, tab: str | None) -> tuple[str, bytes]:
    """Lee una pestaña (valores ya calculados, sin fórmulas) y la convierte en CSV para el flujo de importación."""
    integ = _need(get(db, org_id), "sheets")
    with client_factory() as http:
        meta = _call(
            db, integ, http, f"{SHEETS_API}/{spreadsheet_id}", {"fields": "properties.title,sheets.properties.title"}
        )
        tabs = [s["properties"]["title"] for s in meta.get("sheets", [])]
        if not tabs:
            raise ApiError(422, "integration.empty_sheet", "La hoja no tiene pestañas.")
        name: str = tab if tab is not None and tab in tabs else str(tabs[0])
        quoted = "'" + name.replace("'", "''") + "'"
        values = _call(
            db,
            integ,
            http,
            f"{SHEETS_API}/{spreadsheet_id}/values/{quoted}",
            {"valueRenderOption": "FORMATTED_VALUE", "majorDimension": "ROWS"},
        ).get("values", [])
    if not values:
        raise ApiError(422, "integration.empty_sheet", "La pestaña está vacía.")
    if len(values) > MAX_SHEET_ROWS + 1:
        raise ApiError(422, "upload.too_many_rows", "La hoja supera el máximo de filas.", {"limit": MAX_SHEET_ROWS})
    buf = io.StringIO()
    csv.writer(buf, lineterminator="\n").writerows(values)
    title = str(meta.get("properties", {}).get("title", "Hoja"))
    safe_title = (
        "".join(ch if ch.isalnum() or ch in " -_" else "_" for ch in f"{title} - {name}")[:120].strip() or "hoja"
    )
    return f"{safe_title}.csv", buf.getvalue().encode("utf-8")


def drive_recent(db: Session, org_id: uuid.UUID) -> list[dict[str, Any]]:
    integ = _need(get(db, org_id), "drive")
    with client_factory() as http:
        data = _call(
            db,
            integ,
            http,
            DRIVE_FILES,
            {
                "q": "trashed=false",
                "orderBy": "modifiedTime desc",
                "pageSize": 10,
                "fields": "files(id,name,mimeType,modifiedTime)",
            },
        )
    return [
        {
            "id": f["id"],
            "name": f.get("name", ""),
            "mime_type": f.get("mimeType", ""),
            "modified_at": f.get("modifiedTime"),
        }
        for f in data.get("files", [])
    ]


def gmail_recent(db: Session, org_id: uuid.UUID) -> list[dict[str, Any]]:
    """Solo metadatos (remitente, asunto, fecha) de los 10 mensajes más recientes; no se guarda nada."""
    integ = _need(get(db, org_id), "gmail")
    out = []
    with client_factory() as http:
        ids = _call(db, integ, http, f"{GMAIL_API}/messages", {"maxResults": 10, "labelIds": "INBOX"}).get(
            "messages", []
        )
        for m in ids[:10]:
            msg = _call(
                db,
                integ,
                http,
                f"{GMAIL_API}/messages/{m['id']}",
                {"format": "metadata", "metadataHeaders": ["From", "Subject", "Date"]},
            )
            headers = {h["name"].lower(): h["value"] for h in msg.get("payload", {}).get("headers", [])}
            out.append(
                {
                    "id": m["id"],
                    "from": headers.get("from", ""),
                    "subject": headers.get("subject", ""),
                    "date": headers.get("date", ""),
                    "unread": "UNREAD" in msg.get("labelIds", []),
                }
            )
    return out


def _post(db: Session, integ: Integration, http: httpx2.Client, url: str, body: dict[str, Any]) -> dict[str, Any]:
    if integ.status != "connected" or not integ.access_token_enc:
        raise ApiError(409, "integration.not_connected", "La integración no está conectada.")
    token = crypto.decrypt(integ.access_token_enc)
    if integ.token_expires_at and integ.token_expires_at - timedelta(seconds=60) < datetime.now(UTC):
        token = _refresh(db, integ, http)
    for attempt in range(2):
        try:
            r = http.post(url, json=body, headers={"Authorization": f"Bearer {token}"})
        except httpx2.HTTPError as e:
            raise _fail(db, integ, "integration.unreachable") from e
        if r.status_code == 401 and attempt == 0:
            token = _refresh(db, integ, http)
            continue
        if r.status_code == 403:
            raise _fail(db, integ, "integration.forbidden", 403)
        if r.status_code >= 400:
            raise _fail(db, integ, "integration.provider_error", 502, http_status=r.status_code)
        integ.last_sync_at = datetime.now(UTC)
        return dict(r.json())
    raise _fail(db, integ, "integration.reauth_required", 409)


def gmail_for_agent(db: Session, org_id: uuid.UUID, limit: int = 15) -> list[dict[str, Any]]:
    """Metadatos + fragmento corto (snippet) de los correos recientes de la bandeja de entrada, para clasificar.
    No se guardan cuerpos completos."""
    integ = _need(get(db, org_id), "gmail")
    out = []
    with client_factory() as http:
        ids = _call(db, integ, http, f"{GMAIL_API}/messages", {"maxResults": limit, "labelIds": "INBOX"}).get(
            "messages", []
        )
        for m in ids[:limit]:
            msg = _call(
                db,
                integ,
                http,
                f"{GMAIL_API}/messages/{m['id']}",
                {"format": "metadata", "metadataHeaders": ["From", "Subject", "Date", "Message-ID"]},
            )
            h = {x["name"].lower(): x["value"] for x in msg.get("payload", {}).get("headers", [])}
            out.append(
                {
                    "id": m["id"],
                    "thread_id": msg.get("threadId") or m.get("threadId"),
                    "from": h.get("from", ""),
                    "subject": h.get("subject", ""),
                    "date": h.get("date", ""),
                    "message_id": h.get("message-id"),
                    "snippet": str(msg.get("snippet", ""))[:300],
                }
            )
    return out


def create_draft(
    db: Session, org_id: uuid.UUID, *, to: str, subject: str, body: str, thread_id: str | None, in_reply_to: str | None
) -> str:
    """Crea un BORRADOR en Gmail (no lo envía). Devuelve el id del borrador."""
    from email.message import EmailMessage

    integ = _need(get(db, org_id), "gmail_drafts")
    msg = EmailMessage()
    msg["To"] = to
    msg["Subject"] = subject if subject.lower().startswith("re:") else f"Re: {subject}"
    if in_reply_to:
        msg["In-Reply-To"] = in_reply_to
        msg["References"] = in_reply_to
    msg.set_content(body)
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    payload: dict[str, Any] = {"message": {"raw": raw}}
    if thread_id:
        payload["message"]["threadId"] = thread_id
    with client_factory() as http:
        data = _post(db, integ, http, f"{GMAIL_API}/drafts", payload)
    return str(data.get("id", ""))
