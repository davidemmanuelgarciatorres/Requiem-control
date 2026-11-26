"""Acceso a base de datos y contexto de inquilino (tenant).

Cada petición corre en UNA transacción. Antes de consultar datos se fijan,
con alcance de transacción (`set_config(..., true)`), el usuario y la
organización activa. Las políticas RLS de PostgreSQL leen esos valores, de
modo que aunque una consulta olvide filtrar por organización, la base de
datos no devuelve filas de otra organización.
"""

from collections.abc import Iterator
from functools import lru_cache
from uuid import UUID

from sqlalchemy import Engine, create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings


@lru_cache
def get_engine() -> Engine:
    return create_engine(get_settings().database_url, pool_pre_ping=True, future=True)


@lru_cache
def _session_factory() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """Dependencia de FastAPI: una sesión/transacción por petición."""
    db = _session_factory()()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def set_tenant_context(db: Session, *, user_id: UUID | None, org_id: UUID | None) -> None:
    """Fija el contexto RLS para la transacción actual."""
    db.execute(
        text("SELECT set_config('app.current_user_id', :u, true), set_config('app.current_org_id', :o, true)"),
        {"u": str(user_id) if user_id else "", "o": str(org_id) if org_id else ""},
    )
