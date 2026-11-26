"""Herramientas con permisos explícitos.

Un agente solo puede invocar las herramientas listadas en su definición
(`agent_definitions.allowed_tools`). No existe ejecución de código arbitrario:
cada herramienta es una función acotada del servidor.
"""

import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

import pandas as pd
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.agents.providers import ProviderError, ProviderResult, get_provider
from app.models import AgentDefinition, AgentExecution, Approval, Dataset, DatasetRow


class ToolNotAllowed(Exception):
    def __init__(self, agent: str, tool: str) -> None:
        super().__init__(f"Agent {agent} is not allowed to use tool {tool}")
        self.agent = agent
        self.tool = tool


class AgentInputError(Exception):
    """Error esperado de entrada (p. ej. faltan columnas con rol). Se registra como ejecución fallida."""

    def __init__(self, code: str, message: str, **params: Any) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.params = params


@dataclass
class ToolContext:
    db: Session
    organization_id: uuid.UUID
    user_id: uuid.UUID | None
    execution: AgentExecution
    definition: AgentDefinition
    language: str = "es"
    calls: list[str] = field(default_factory=list)

    def call(self, tool: str, **kwargs: Any) -> Any:
        if tool not in self.definition.allowed_tools:
            raise ToolNotAllowed(self.definition.id, tool)
        self.calls.append(tool)
        return TOOLS[tool](self, **kwargs)


def _load_dataset(ctx: ToolContext, dataset_id: str) -> Dataset:
    try:
        ds_uuid = uuid.UUID(str(dataset_id))
    except ValueError as e:
        raise AgentInputError("agent.dataset_not_found", "Conjunto de datos no encontrado.") from e
    ds = ctx.db.execute(
        select(Dataset).where(Dataset.id == ds_uuid, Dataset.organization_id == ctx.organization_id)
    ).scalar_one_or_none()
    if ds is None:
        raise AgentInputError("agent.dataset_not_found", "Conjunto de datos no encontrado.")
    return ds


def read_dataset(ctx: ToolContext, dataset_id: str) -> tuple[Dataset, pd.DataFrame]:
    """Lectura del conjunto de datos (valores ya tipados) como DataFrame; incluye `_row` (fila del archivo)."""
    ds = _load_dataset(ctx, dataset_id)
    rows = ctx.db.execute(
        select(DatasetRow.row_number, DatasetRow.data)
        .where(DatasetRow.dataset_id == ds.id)
        .order_by(DatasetRow.row_number)
    ).all()
    records = [{"_row": r.row_number, **r.data} for r in rows]
    df = pd.DataFrame.from_records(records, columns=["_row", *[c["key"] for c in ds.columns]])
    return ds, df


def dataset_quality(ctx: ToolContext, dataset_id: str) -> dict[str, Any]:
    return _load_dataset(ctx, dataset_id).report


def summarize(ctx: ToolContext, facts: dict[str, Any]) -> ProviderResult:
    return get_provider().summarize(agent=ctx.definition.id, language=ctx.language, facts=facts)


def count_duplicate_rows(db: Session, dataset_id: uuid.UUID) -> int:
    return int(
        db.execute(
            text(
                "SELECT count(*) FROM dataset_rows a WHERE a.dataset_id = :d AND EXISTS (SELECT 1 FROM dataset_rows b "
                "WHERE b.dataset_id = :d AND b.data = a.data AND b.row_number < a.row_number)"
            ),
            {"d": dataset_id},
        ).scalar_one()
    )


def _validate_remove_duplicates(ctx: ToolContext, payload: dict[str, Any]) -> dict[str, Any]:
    ds = _load_dataset(ctx, payload["dataset_id"])
    return {"dataset_id": str(ds.id), "dataset_name": ds.name, "count": count_duplicate_rows(ctx.db, ds.id)}


# Acciones que un agente puede PROPONER. Ninguna se ejecuta sin aprobación humana.
PROPOSABLE_ACTIONS: dict[str, Callable[[ToolContext, dict[str, Any]], dict[str, Any]]] = {
    "dataset.remove_duplicates": _validate_remove_duplicates,
}


def propose_action(ctx: ToolContext, action_type: str, payload: dict[str, Any]) -> Approval:
    if action_type not in PROPOSABLE_ACTIONS:
        raise ToolNotAllowed(ctx.definition.id, f"propose_action:{action_type}")
    clean = PROPOSABLE_ACTIONS[action_type](ctx, payload)
    approval = Approval(
        organization_id=ctx.organization_id,
        execution_id=ctx.execution.id,
        action_type=action_type,
        payload=clean,
        status="pending",
    )
    ctx.db.add(approval)
    ctx.db.flush()
    return approval


TOOLS: dict[str, Callable[..., Any]] = {
    "read_dataset": read_dataset,
    "dataset_quality": dataset_quality,
    "summarize": summarize,
    "propose_action": propose_action,
}

__all__ = ["AgentInputError", "ProviderError", "ToolContext", "ToolNotAllowed", "count_duplicate_rows"]
