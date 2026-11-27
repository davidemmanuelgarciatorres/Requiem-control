"""Rangos (Líder, Colíder, Encargado, Miembro, Observador), nivel de IA y límites mensuales por herramienta.

Revision ID: 0012
Revises: 0011
"""

from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None

MANAGER_PERMS = (
    "agents.manage",
    "agents.run",
    "approvals.decide",
    "audit.read",
    "billing.read",
    "data.read",
    "data.write",
    "members.read",
    "org.read",
)

FREE = {
    "reports": "basic",
    "integrations": False,
    "history_days": 30,
    "ai_tier": "basic",
    "max_assistant_questions": 50,
    "max_imports": 20,
    "max_exports": 30,
    "max_automations": 2,
}
PREMIUM = {
    "reports": "advanced",
    "integrations": True,
    "history_days": 365,
    "ai_tier": "advanced",
    "max_assistant_questions": 1500,
    "max_imports": 500,
    "max_exports": 1000,
    "max_automations": 25,
}


def _json(d: dict[str, object]) -> str:
    import json

    return json.dumps(d).replace("'", "''")


def upgrade() -> None:
    op.execute("UPDATE roles SET name = 'Líder' WHERE code = 'owner' AND organization_id IS NULL")
    op.execute("UPDATE roles SET name = 'Colíder' WHERE code = 'admin' AND organization_id IS NULL")
    op.execute("UPDATE roles SET name = 'Observador' WHERE code = 'viewer' AND organization_id IS NULL")
    op.execute("INSERT INTO roles (code, name, rank) VALUES ('manager', 'Encargado', 65)")
    values = ", ".join(f"('{p}')" for p in MANAGER_PERMS)
    op.execute(
        "INSERT INTO role_permissions (role_id, permission_code) "
        f"SELECT r.id, v.code FROM roles r, (VALUES {values}) AS v(code) "
        "WHERE r.code = 'manager' AND r.organization_id IS NULL"
    )
    op.execute(f"UPDATE plans SET features = '{_json(FREE)}'::jsonb WHERE code = 'free'")
    op.execute(f"UPDATE plans SET features = '{_json(PREMIUM)}'::jsonb WHERE code = 'premium'")


def downgrade() -> None:
    op.execute(
        "UPDATE organization_members SET role_id = (SELECT id FROM roles WHERE code = 'member' "
        "AND organization_id IS NULL) WHERE role_id IN (SELECT id FROM roles WHERE code = 'manager')"
    )
    op.execute("DELETE FROM roles WHERE code = 'manager' AND organization_id IS NULL")
    op.execute("UPDATE roles SET name = 'Propietario' WHERE code = 'owner' AND organization_id IS NULL")
    op.execute("UPDATE roles SET name = 'Administrador' WHERE code = 'admin' AND organization_id IS NULL")
    op.execute("UPDATE roles SET name = 'Lector' WHERE code = 'viewer' AND organization_id IS NULL")
    op.execute(
        "UPDATE plans SET features = features - 'ai_tier' - 'max_assistant_questions' - 'max_imports' "
        "- 'max_exports' - 'max_automations'"
    )
