"""Pruebas contra PostgreSQL real (base de datos de prueba aislada).

Variables: TEST_DATABASE_URL (rol de aplicación) y TEST_MIGRATION_DATABASE_URL (rol propietario).
"""

import os

APP_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://requiem_app:requiem_app_dev@localhost:5432/requiem_control_test"
)
OWNER_URL = os.environ.get(
    "TEST_MIGRATION_DATABASE_URL",
    "postgresql+psycopg://requiem_owner:requiem_owner_dev@localhost:5432/requiem_control_test",
)
os.environ["DATABASE_URL"] = APP_URL
os.environ["MIGRATION_DATABASE_URL"] = OWNER_URL
os.environ["ENVIRONMENT"] = "test"

from collections.abc import Iterator  # noqa: E402
from typing import Any  # noqa: E402

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402

from app import mailer  # noqa: E402
from app.api import auth as auth_api  # noqa: E402
from app.main import create_app  # noqa: E402

PASSWORD = "correct-horse-battery"


@pytest.fixture(scope="session")
def owner_engine():
    cfg = Config("alembic.ini")
    cfg.attributes["url"] = OWNER_URL
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    engine = create_engine(OWNER_URL)
    yield engine
    engine.dispose()


@pytest.fixture(autouse=True)
def clean_db(owner_engine) -> Iterator[None]:
    with owner_engine.begin() as conn:
        # DELETE (no TRUNCATE CASCADE) para conservar los roles del sistema y los planes sembrados.
        for table in (
            "rate_limit_hits",
            "invitations",
            "auth_tokens",
            "audit_logs",
            "usage_records",
            "user_sessions",
            "subscriptions",
            "organization_members",
            "organizations",
            "users",
        ):
            conn.execute(text(f"DELETE FROM {table}"))
    auth_api.login_limiter.reset()
    auth_api.register_limiter.reset()
    mailer.outbox.clear()
    yield


@pytest.fixture(scope="session")
def app():
    return create_app()


class ApiClient:
    """Cliente de prueba que guarda la cookie de sesión y envía el token CSRF."""

    def __init__(self, app: Any) -> None:
        self.http = TestClient(app, base_url="http://testserver")
        self.csrf: str | None = None
        self.session: dict[str, Any] | None = None

    def _remember(self, r):
        if r.status_code in (200, 201) and isinstance(r.json(), dict) and "csrf_token" in r.json():
            self.session = r.json()
            self.csrf = self.session["csrf_token"]
        return r

    def register(self, email: str, org: str = "Org", password: str = PASSWORD, name: str = "Test User"):
        return self._remember(
            self.http.post(
                "/api/auth/register",
                json={"email": email, "password": password, "full_name": name, "organization_name": org},
            )
        )

    def login(self, email: str, password: str = PASSWORD):
        return self._remember(self.http.post("/api/auth/login", json={"email": email, "password": password}))

    def upload(self, filename: str, content: bytes, csrf: bool = True, **data):
        headers = {"X-CSRF-Token": self.csrf} if csrf and self.csrf else {}
        return self.http.post("/api/datasets/uploads", files={"file": (filename, content)}, data=data, headers=headers)

    def get(self, url: str, **kw):
        return self.http.get(url, **kw)

    def send(self, method: str, url: str, json: Any = None, csrf: bool = True, **kw):
        headers = kw.pop("headers", {})
        if csrf and self.csrf:
            headers["X-CSRF-Token"] = self.csrf
        return self._remember(self.http.request(method, url, json=json, headers=headers, **kw))


@pytest.fixture
def client(app) -> ApiClient:
    return ApiClient(app)


@pytest.fixture
def make_client(app):
    return lambda: ApiClient(app)
