"""Estado técnico del sistema: SOLO para propietario/administrador (permiso org.update).

Aquí se concentran los avisos que son para quien administra la app (proveedor de IA, variables
que faltan, entorno), para que no aparezcan en las pantallas del usuario final.
"""

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app import billing
from app.agents.providers import provider_status
from app.api.deps import AuthContext, require_permission
from app.config import get_settings
from app.db import get_db
from app.integrations import google

router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/status")
def system_status(
    ctx: AuthContext = Depends(require_permission("org.update")), db: Session = Depends(get_db)
) -> dict[str, Any]:
    s = get_settings()
    try:
        db.execute(text("SELECT 1"))
        database = "ok"
    except Exception:
        database = "unavailable"
    ai = provider_status()
    org = ctx.require_org()
    return {
        "environment": s.environment,
        "database": database,
        "ai": {
            "provider": ai.provider,
            "model": ai.model,
            "simulated": ai.simulated,
            "configured": ai.configured,
            "requested": s.ai_provider,
            "note": ai.note,
        },
        "google": {
            "missing": google.missing_configuration(),
            "plan_allows": google.plan_allows(db, org.id),
            "dev_override": s.allow_integrations_on_free,
        },
        "billing": {"missing": billing.missing_configuration(), "test_mode": billing.test_mode()},
        "worker": s.execution_mode,
        "security": {"cookie_secure": s.cookie_secure},
    }
