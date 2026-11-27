"""Punto de entrada de la API: `uvicorn app.main:app`."""

import logging
from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import DataError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import __doc__ as _doc
from app.api import (
    agents,
    assistant,
    auth,
    automations,
    billing,
    datasets,
    finance,
    integrations,
    me,
    organizations,
    reports,
    system,
)
from app.config import get_settings
from app.db import get_engine
from app.errors import ApiError
from app.schemas import HealthOut

VERSION = "0.2.0"
log = logging.getLogger("requiem")

UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}


def _error(status: int, code: str, message: str, extra: dict[str, object] | None = None) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": message, **(extra or {})}}, status_code=status)


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="REQUIEM CONTROL API",
        version=VERSION,
        description=_doc,
        # La documentación interactiva solo fuera de producción.
        docs_url=None if settings.environment == "production" else "/api/docs",
        redoc_url=None,
        openapi_url=None if settings.environment == "production" else "/api/openapi.json",
    )

    def _same_origin(request: Request, origin: str) -> bool:
        """Detrás de un proxy de confianza (p. ej. GitHub Codespaces), acepta el Origin que coincide con el
        dominio público que el proxy declara. Desactivado por defecto: solo con TRUST_FORWARDED_HOST=true."""
        if not settings.trust_forwarded_host:
            return False
        raw = f"{request.headers.get('x-forwarded-host') or ''},{request.headers.get('host') or ''}"
        hosts = {h.strip() for h in raw.split(",") if h.strip() and h.strip().endswith(settings.trusted_proxy_suffix)}
        return any(origin == f"https://{h}" for h in hosts)

    @app.middleware("http")
    async def guard(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        # Caracteres de control nulos en la dirección: nunca son legítimos (PostgreSQL tampoco los acepta).
        if "\x00" in request.url.path or "%00" in request.url.query.lower() or "%00" in str(request.url.path).lower():
            return _error(400, "request.invalid", "Datos inválidos.")
        if request.method in UNSAFE and request.url.path.startswith("/api/"):
            # 1) Origen: si el navegador envía Origin, debe ser uno permitido (defensa CSRF adicional).
            origin = request.headers.get("origin")
            if origin and origin not in settings.allowed_origins and not _same_origin(request, origin):
                logging.getLogger("requiem.security").warning(
                    "Origen rechazado: origin=%s host=%s forwarded_host=%s",
                    origin,
                    request.headers.get("host"),
                    request.headers.get("x-forwarded-host"),
                )
                return _error(403, "request.origin_forbidden", "Origen no permitido.")
            # 2) Solo JSON: los formularios HTML de otros sitios no pueden enviar application/json sin CORS.
            length = int(request.headers.get("content-length") or 0)
            ctype = request.headers.get("content-type", "")
            # Solo la subida de archivos acepta multipart; todo lo demás, solo JSON.
            is_upload = request.method == "POST" and request.url.path in ("/api/datasets/uploads", "/api/me/floaters")
            if is_upload:
                if not ctype.startswith("multipart/form-data"):
                    return _error(415, "request.unsupported_media_type", "Se requiere multipart/form-data.")
                if length > settings.max_upload_bytes + 64 * 1024:
                    return _error(413, "upload.too_large", "El archivo supera el tamaño máximo.")
            else:
                if length and not ctype.startswith("application/json"):
                    return _error(415, "request.unsupported_media_type", "Se requiere application/json.")
                if length > settings.max_json_body_bytes:
                    return _error(413, "request.too_large", "La petición es demasiado grande.")
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "same-origin"
        if request.url.path.startswith("/api/") and "cache-control" not in response.headers:
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.exception_handler(ApiError)
    async def api_error(_: Request, exc: ApiError) -> JSONResponse:
        return _error(exc.status, exc.code, exc.message, exc.extra)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        fields = [{"field": ".".join(str(p) for p in e["loc"][1:]), "type": e["type"]} for e in exc.errors()]
        return _error(422, "request.invalid", "Datos inválidos.", {"fields": fields})

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return _error(exc.status_code, "http.error", str(exc.detail))

    @app.exception_handler(DataError)
    async def data_error(request: Request, exc: DataError) -> JSONResponse:
        # Datos que PostgreSQL no acepta (p. ej. caracteres nulos): es una entrada inválida, no un fallo del servidor.
        logging.getLogger("requiem.api").info("Dato inválido rechazado por la base de datos en %s", request.url.path)
        return _error(422, "request.invalid", "Datos inválidos.")

    @app.exception_handler(Exception)
    async def unhandled(request: Request, exc: Exception) -> JSONResponse:
        # Detalle solo en el log del servidor; el cliente recibe un mensaje genérico.
        log.exception("Unhandled error on %s %s", request.method, request.url.path)
        return _error(500, "server.error", "Ocurrió un error inesperado.")

    @app.get("/api/health", response_model=HealthOut, tags=["health"])
    def health() -> HealthOut:
        try:
            with get_engine().connect() as conn:
                conn.execute(text("SELECT 1"))
            return HealthOut(status="ok", database="ok", version=VERSION)
        except Exception:
            log.warning("Database health check failed", exc_info=True)
            return HealthOut(status="degraded", database="unavailable", version=VERSION)

    app.include_router(auth.router)
    app.include_router(organizations.router)
    app.include_router(organizations.plans_router)
    app.include_router(datasets.router)
    app.include_router(agents.router)
    app.include_router(agents.approvals_router)
    app.include_router(me.router)
    app.include_router(reports.router)
    app.include_router(finance.router)
    app.include_router(assistant.router)
    app.include_router(integrations.router)
    app.include_router(system.router)
    app.include_router(automations.router)
    app.include_router(billing.router)
    return app


app = create_app()
