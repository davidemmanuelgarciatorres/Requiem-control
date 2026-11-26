"""Contratos de la API (Pydantic). Toda entrada se valida aquí."""

from datetime import datetime
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
    usage: dict[str, int]
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
