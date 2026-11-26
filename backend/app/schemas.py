"""Contratos de la API (Pydantic). Toda entrada se valida aquí."""

from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

Language = Literal["es", "en"]
RoleCode = Literal["owner", "admin", "member", "viewer"]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class RegisterIn(Strict):
    email: EmailStr = Field(max_length=254)
    password: str = Field(min_length=1, max_length=128)
    full_name: str = Field(min_length=1, max_length=120)
    organization_name: str = Field(min_length=1, max_length=120)
    preferred_language: Language = "es"


class LoginIn(Strict):
    email: EmailStr = Field(max_length=254)
    password: str = Field(min_length=1, max_length=128)


class SwitchOrgIn(Strict):
    organization_id: UUID


class UpdateMeIn(Strict):
    full_name: str | None = Field(default=None, min_length=1, max_length=120)
    preferred_language: Language | None = None


class OrganizationCreateIn(Strict):
    name: str = Field(min_length=1, max_length=120)
    country: str = Field(default="MX", pattern=r"^[A-Z]{2}$")
    currency: str = Field(default="MXN", pattern=r"^[A-Z]{3}$")


class OrganizationUpdateIn(Strict):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    country: str | None = Field(default=None, pattern=r"^[A-Z]{2}$")
    currency: str | None = Field(default=None, pattern=r"^[A-Z]{3}$")


class OrganizationDeleteIn(Strict):
    confirm_slug: str


class MemberAddIn(Strict):
    email: EmailStr
    role: RoleCode = "member"

    @field_validator("role")
    @classmethod
    def no_owner_invite(cls, v: str) -> str:
        # La propiedad se otorga cambiando el rol de un miembro existente, nunca al agregar.
        if v == "owner":
            raise ValueError("owner role cannot be assigned when adding a member")
        return v


class MemberUpdateIn(Strict):
    role: RoleCode


class UserOut(BaseModel):
    id: UUID
    email: str
    full_name: str
    preferred_language: Language


class OrganizationOut(BaseModel):
    id: UUID
    name: str
    slug: str
    country: str
    currency: str
    created_at: datetime


class MembershipOut(BaseModel):
    organization: OrganizationOut
    role: RoleCode


class SessionOut(BaseModel):
    user: UserOut
    active_organization: OrganizationOut | None
    role: RoleCode | None
    permissions: list[str]
    memberships: list[MembershipOut]
    csrf_token: str


class MemberOut(BaseModel):
    id: UUID
    user_id: UUID
    email: str
    full_name: str
    role: RoleCode
    created_at: datetime


class PlanOut(BaseModel):
    code: str
    name: str
    price_cents: int
    currency: str
    interval: str
    max_active_agents: int
    max_monthly_executions: int
    max_storage_mb: int
    max_members: int
    features: dict[str, Any]


class SubscriptionOut(BaseModel):
    status: str
    plan: PlanOut
    usage: dict[str, float]
    billing_enabled: bool


class AuditLogOut(BaseModel):
    id: int
    action: str
    user_id: UUID | None
    target_type: str | None
    target_id: str | None
    details: dict[str, Any]
    created_at: datetime


class HealthOut(BaseModel):
    status: Literal["ok", "degraded"]
    database: Literal["ok", "unavailable"]
    version: str


# --- Ingesta de datos (Fase 3) ----------------------------------------------
ColumnTypeIn = Literal["integer", "number", "date", "boolean", "text"]
RoleIn = Literal["none", "date", "amount", "category", "customer", "product", "quantity", "identifier"]


class ColumnMappingIn(Strict):
    key: str = Field(pattern=r"^c\d{1,3}$")
    name: str = Field(min_length=1, max_length=80)
    type: ColumnTypeIn
    role: RoleIn = "none"
    include: bool = True


class ConfirmImportIn(Strict):
    name: str = Field(min_length=1, max_length=120)
    columns: list[ColumnMappingIn] = Field(min_length=1, max_length=500)


class UploadSummaryOut(BaseModel):
    id: UUID
    filename: str
    format: str
    size_bytes: int
    status: str
    created_at: datetime


class UploadPreviewOut(UploadSummaryOut):
    options: dict[str, Any]
    sheets: list[str]
    row_count: int
    preview_rows: list[list[str]]
    report: dict[str, Any]
    duplicate_of: dict[str, Any] | None


class DatasetSummaryOut(BaseModel):
    id: UUID
    name: str
    row_count: int
    column_count: int
    completeness: float
    issue_count: int
    source_filename: str | None
    created_at: datetime


class DatasetOut(DatasetSummaryOut):
    columns: list[dict[str, Any]]
    report: dict[str, Any]


class DatasetRowsOut(BaseModel):
    total: int
    offset: int
    limit: int
    rows: list[dict[str, Any]]


# --- Agentes (Fase 4) ---------------------------------------------------------
class ActivationIn(Strict):
    active: bool


class RunAgentIn(Strict):
    dataset_id: UUID
    idempotency_key: str | None = Field(default=None, min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_\-]+$")


class DecisionIn(Strict):
    decision: Literal["approve", "reject"]


class AgentOut(BaseModel):
    id: str
    version: str
    status: str
    read_only: bool
    requires_approval: bool
    allowed_tools: list[str]
    required_permissions: list[str]
    timeout_seconds: int
    phase: int
    active: bool


class AgentsOut(BaseModel):
    agents: list[AgentOut]
    active_count: int
    active_limit: int
    monthly_executions: int
    monthly_limit: int


class ProviderOut(BaseModel):
    provider: str
    model: str
    simulated: bool
    configured: bool
    note: str | None


class ApprovalOut(BaseModel):
    id: UUID
    execution_id: UUID
    action_type: str
    payload: dict[str, Any]
    status: str
    requested_at: datetime
    decided_at: datetime | None
    result: dict[str, Any] | None


class ExecutionOut(BaseModel):
    id: UUID
    agent_id: str
    agent_version: str
    status: str
    input: dict[str, Any]
    output: dict[str, Any] | None
    error: dict[str, Any] | None
    usage: dict[str, Any]
    created_at: datetime
    queued_at: datetime | None
    started_at: datetime | None
    completed_at: datetime | None
    approvals: list[ApprovalOut] = []


# --- Imágenes flotantes ------------------------------------------------------
class FloaterPreferences(Strict):
    enabled: bool = True
    size: int = Field(default=64, ge=32, le=120)  # px en pantalla
    speed: Literal["slow", "normal", "fast"] = "normal"
    effect_shape: Literal["splash", "stars", "hearts", "ring", "sparks"] = "splash"
    effect_color: str = Field(default="#ff6a1a", pattern=r"^#[0-9a-fA-F]{6}$")
    layer: Literal["front", "back"] = "front"


class FloaterOut(BaseModel):
    id: UUID
    position: int
    width: int
    height: int
    created_at: datetime


class FloatersOut(BaseModel):
    preferences: FloaterPreferences
    images: list[FloaterOut]
    max_images: int


# --- Reportes (Fase 5) ---------------------------------------------------------
class ReportCreateIn(Strict):
    execution_id: UUID
    title: str | None = Field(default=None, min_length=1, max_length=160)


class ReportSummaryOut(BaseModel):
    id: UUID
    title: str
    agent_id: str
    dataset_id: UUID | None
    period_from: date | None
    period_to: date | None
    created_at: datetime


class ReportOut(ReportSummaryOut):
    content: dict[str, Any]
    comparison: dict[str, Any] | None
