"""Asistente IA: conversaciones privadas por usuario dentro de la organización activa."""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app import assistant, audit
from app.api.deps import AuthContext, require_permission
from app.db import get_db
from app.errors import ApiError
from app.models import AssistantMessage

router = APIRouter(prefix="/api/assistant", tags=["assistant"])


class AskIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question: str = Field(min_length=1, max_length=1000)
    conversation_id: UUID | None = None


def _out(m: AssistantMessage) -> dict[str, Any]:
    return {
        "id": str(m.id),
        "conversation_id": str(m.conversation_id),
        "role": m.role,
        "content": m.content,
        "parts": m.meta.get("parts"),
        "meta": {k: v for k, v in m.meta.items() if k != "parts"},
        "created_at": m.created_at.isoformat(),
    }


@router.post("/messages", status_code=201)
def ask(
    body: AskIn, ctx: AuthContext = Depends(require_permission("data.read")), db: Session = Depends(get_db)
) -> dict[str, Any]:
    question = body.question.strip()
    if not question:
        raise ApiError(422, "request.invalid", "Escribe una pregunta.")
    org = ctx.require_org()
    q, a = assistant.ask(
        db,
        org_id=org.id,
        user_id=ctx.user.id,
        conversation_id=body.conversation_id,
        question=question,
        language=ctx.user.preferred_language,
    )
    audit.record(
        db,
        "assistant.ask",
        organization_id=org.id,
        user_id=ctx.user.id,
        target_type="assistant_conversation",
        target_id=q.conversation_id,
        details={"provider": a.meta.get("provider"), "simulated": a.meta.get("simulated")},
    )
    return {"question": _out(q), "answer": _out(a)}


@router.get("/conversations")
def conversations(
    ctx: AuthContext = Depends(require_permission("data.read")), db: Session = Depends(get_db)
) -> list[dict[str, Any]]:
    org = ctx.require_org()
    first = (
        select(
            AssistantMessage.conversation_id,
            func.min(AssistantMessage.created_at).label("started"),
            func.max(AssistantMessage.created_at).label("updated"),
            func.count().label("messages"),
        )
        .where(AssistantMessage.organization_id == org.id, AssistantMessage.user_id == ctx.user.id)
        .group_by(AssistantMessage.conversation_id)
        .order_by(func.max(AssistantMessage.created_at).desc())
        .limit(30)
    )
    out = []
    for row in db.execute(first):
        title = db.execute(
            select(AssistantMessage.content)
            .where(AssistantMessage.conversation_id == row.conversation_id, AssistantMessage.role == "user")
            .order_by(AssistantMessage.created_at)
            .limit(1)
        ).scalar_one()
        out.append(
            {
                "id": str(row.conversation_id),
                "title": title[:80],
                "updated_at": row.updated.isoformat(),
                "messages": int(row.messages),
            }
        )
    return out


@router.get("/conversations/{conversation_id}")
def conversation(
    conversation_id: UUID, ctx: AuthContext = Depends(require_permission("data.read")), db: Session = Depends(get_db)
) -> list[dict[str, Any]]:
    rows = (
        db.execute(
            select(AssistantMessage)
            .where(
                AssistantMessage.conversation_id == conversation_id,
                AssistantMessage.user_id == ctx.user.id,
                AssistantMessage.organization_id == ctx.require_org().id,
            )
            .order_by(AssistantMessage.created_at)
        )
        .scalars()
        .all()
    )
    if not rows:
        raise ApiError(404, "assistant.conversation_not_found", "Conversación no encontrada.")
    return [_out(m) for m in rows]


@router.delete("/conversations/{conversation_id}", status_code=204)
def delete_conversation(
    conversation_id: UUID,
    response: Response,
    ctx: AuthContext = Depends(require_permission("data.read")),
    db: Session = Depends(get_db),
) -> Response:
    res = db.execute(
        delete(AssistantMessage).where(
            AssistantMessage.conversation_id == conversation_id,
            AssistantMessage.user_id == ctx.user.id,
            AssistantMessage.organization_id == ctx.require_org().id,
        )
    )
    if not getattr(res, "rowcount", 0):
        raise ApiError(404, "assistant.conversation_not_found", "Conversación no encontrada.")
    response.status_code = 204
    return response
