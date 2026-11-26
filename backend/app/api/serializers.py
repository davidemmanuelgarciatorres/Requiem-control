from typing import cast

from app.models import Organization, OrganizationMember, User
from app.schemas import Language, MemberOut, OrganizationOut, RoleCode, UserOut


def user_out(u: User) -> UserOut:
    return UserOut(id=u.id, email=u.email, full_name=u.full_name,
                   preferred_language=cast(Language, u.preferred_language))


def org_out(o: Organization) -> OrganizationOut:
    return OrganizationOut(id=o.id, name=o.name, slug=o.slug, country=o.country, currency=o.currency,
                           created_at=o.created_at)


def member_out(m: OrganizationMember) -> MemberOut:
    return MemberOut(id=m.id, user_id=m.user_id, email=m.user.email, full_name=m.user.full_name,
                     role=cast(RoleCode, m.role.code), created_at=m.created_at)
