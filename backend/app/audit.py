"""Registro de auditoría. Nunca se guardan contraseñas, tokens ni datos de negocio."""

from typing import Any
from uuid import UUID

from sqlalchemy import insert
from sqlalchemy.orm import Session

from app.models import AuditLog


def record(
    db: Session,
    action: str,
    *,
    organization_id: UUID | None = None,
    user_id: UUID | None = None,
    target_type: str | None = None,
    target_id: str | UUID | None = None,
    details: dict[str, Any] | None = None,
    ip: str | None = None,
) -> None:
    # INSERT sin RETURNING: la política RLS de SELECT no permite leer eventos sin
    # organización (p. ej. intentos fallidos), pero sí registrarlos.
    db.execute(
        insert(AuditLog).values(
            organization_id=organization_id,
            user_id=user_id,
            action=action,
            target_type=target_type,
            target_id=str(target_id) if target_id else None,
            details=details or {},
            ip=ip,
        )
    )


def record_and_commit(db: Session, action: str, **kwargs: Any) -> None:
    """Registra y confirma de inmediato: para eventos que deben persistir aunque la petición falle."""
    record(db, action, **kwargs)
    db.commit()
