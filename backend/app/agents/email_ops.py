"""Operaciones de correo (Fase 7): clasifica los correos recientes de Gmail y propone BORRADORES de
respuesta. Nada se envía: cada borrador se crea en Gmail solo si una persona lo aprueba, y la persona
lo revisa y envía desde su correo.

Privacidad: se usan remitente, asunto, fecha y un fragmento corto (snippet); no se guardan cuerpos completos.
"""

import re
from email.utils import parseaddr
from typing import Any

from app.agents.tools import AgentInputError, ToolContext

MAX_DRAFTS = 5
CATEGORIES: dict[str, tuple[str, ...]] = {
    "complaint": (
        "queja",
        "reclamo",
        "molest",
        "devoluci",
        "garant",
        "no funciona",
        "complaint",
        "refund",
        "broken",
        "issue",
    ),
    "order": ("pedido", "orden de compra", "comprar", "quiero ordenar", "order", "purchase"),
    "quote": ("cotizaci", "presupuesto", "precio", "costo de", "quote", "pricing", "price"),
    "invoice": ("factura", "pago", "cobro", "transferencia", "cfdi", "invoice", "payment", "receipt"),
}
NEEDS_REPLY = {"complaint", "order", "quote", "invoice"}
AUTOMATED = re.compile(r"no-?reply|notifications?@|mailer-daemon|newsletter|bounce", re.I)


def classify(subject: str, snippet: str) -> str:
    text = f"{subject} {snippet}".lower()
    for cat, words in CATEGORIES.items():
        if any(w in text for w in words):
            return cat
    return "other"


def run(ctx: ToolContext, params: dict[str, Any]) -> dict[str, Any]:
    messages = ctx.call("read_gmail")
    if messages is None:
        raise AgentInputError("agent.integration_required", "Conecta Gmail en Integraciones para usar este agente.")
    can_draft: bool = ctx.call("gmail_can_draft")
    rows: list[dict[str, Any]] = []
    recommendations: list[dict[str, Any]] = []
    drafted = 0
    for m in messages:
        name, addr = parseaddr(m["from"])
        automated = bool(AUTOMATED.search(addr or m["from"]))
        cat = "automated" if automated else classify(m["subject"], m["snippet"])
        row = {
            "from": name or addr,
            "subject": m["subject"] or "—",
            "date": m["date"],
            "category": cat,
            "approval": None,
        }
        if cat in NEEDS_REPLY and addr and can_draft and drafted < MAX_DRAFTS:
            body = ctx.call(
                "draft_reply", category=cat, sender=name or addr, subject=m["subject"], snippet=m["snippet"]
            )
            approval = ctx.call(
                "propose_action",
                action_type="email.create_draft",
                payload={
                    "to": addr,
                    "subject": m["subject"] or "",
                    "body": body,
                    "category": cat,
                    "thread_id": m.get("thread_id"),
                    "in_reply_to": m.get("message_id"),
                },
            )
            row["approval"] = str(approval.id)
            recommendations.append(
                {
                    "code": "email_reply",
                    "severity": "warning" if cat == "complaint" else "info",
                    "params": {"category": cat, "sender": name or addr, "subject": m["subject"] or "—"},
                    "evidence": {},
                    "approval_id": str(approval.id),
                }
            )
            drafted += 1
        rows.append(row)
    counts: dict[str, int] = {}
    for r in rows:
        counts[r["category"]] = counts.get(r["category"], 0) + 1
    pending = sum(counts.get(c, 0) for c in NEEDS_REPLY)
    if pending and not can_draft:
        recommendations.append(
            {"code": "email_enable_drafts", "severity": "info", "params": {"count": pending}, "evidence": {}}
        )
    metrics = [
        {"key": "emails", "value": len(rows), "format": "number"},
        {"key": "need_reply", "value": pending, "format": "number"},
        {"key": "complaints", "value": counts.get("complaint", 0), "format": "number"},
        {"key": "drafts_proposed", "value": drafted, "format": "number"},
    ]
    es = ctx.language != "en"
    return {
        "dataset": {"id": None, "name": "Gmail", "row_count": len(rows)},
        "period": None,
        "metrics": metrics,
        "breakdown": {
            "dimension": "category",
            "role": "email_category",
            "items": [
                {"label": f"email:{k}", "total": v, "share": round(v / len(rows), 4)}
                for k, v in sorted(counts.items(), key=lambda kv: -kv[1])
            ],
        }
        if rows
        else None,
        "tables": [{"key": "emails", "columns": ["from", "subject", "date", "category"], "rows": rows}] if rows else [],
        "recommendations": recommendations,
        "limitations": [{"code": "email_snippets_only", "params": {}}, {"code": "email_never_sends", "params": {}}],
        "facts": {
            "metrics": {m["key"]: m["value"] for m in metrics},
            "categories": counts,
            "highlights": [
                f"{len(rows)} correos recientes; {pending} parecen requerir respuesta."
                if es
                else f"{len(rows)} recent emails; {pending} seem to need a reply."
            ],
        },
    }
