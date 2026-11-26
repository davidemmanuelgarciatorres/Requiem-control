"""Configuración por variables de entorno (ver .env.example en la raíz)."""

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: Literal["development", "test", "production"] = "development"

    # La API se conecta con un rol SIN privilegios de propietario ni BYPASSRLS,
    # de modo que la Row-Level Security de PostgreSQL siempre aplica.
    database_url: str = "postgresql+psycopg://requiem_app:requiem_app_dev@localhost:5432/requiem_control"
    # Las migraciones usan el rol propietario de las tablas.
    migration_database_url: str = "postgresql+psycopg://requiem_owner:requiem_owner_dev@localhost:5432/requiem_control"

    session_cookie_name: str = "rc_session"
    csrf_header_name: str = "X-CSRF-Token"
    allowed_origins: list[str] = ["http://localhost:5173", "http://localhost:4173"]
    max_json_body_bytes: int = 1_000_000
    session_ttl_hours: int = Field(default=24 * 7, ge=1, le=24 * 30)
    # En producción las cookies deben ser Secure (solo HTTPS).
    cookie_secure: bool = False

    login_rate_limit: int = Field(default=5, ge=1)
    login_rate_window_seconds: int = Field(default=60, ge=1)

    password_min_length: int = Field(default=10, ge=8)

    # Ingesta de datos (Fase 3)
    max_upload_bytes: int = Field(default=10 * 1024 * 1024, ge=1024)
    max_uncompressed_bytes: int = Field(default=100 * 1024 * 1024, ge=1024)  # XLSX descomprimido (anti zip-bomb)
    max_import_rows: int = Field(default=100_000, ge=1)
    max_import_columns: int = Field(default=200, ge=1)

    # Proveedor de IA (Fase 4). "mock" por defecto: no consume créditos. Para usar Claude:
    # AI_PROVIDER=anthropic y una credencial del SDK (ANTHROPIC_API_KEY o `ant auth login`).
    ai_provider: Literal["mock", "anthropic", "gemini"] = "mock"
    anthropic_model: str = "claude-opus-5-5"
    anthropic_effort: Literal["low", "medium", "high"] = "medium"
    ai_timeout_seconds: float = Field(default=90.0, gt=0)
    ai_max_retries: int = Field(default=2, ge=0, le=5)
    # Precios por millón de tokens (USD) para estimar el costo. Si se dejan vacíos se usan los precios
    # publicados del modelo elegido (tabla en app/agents/providers.py).
    anthropic_input_usd_per_mtok: float | None = None
    anthropic_output_usd_per_mtok: float | None = None
    # Gemini (Google AI Studio). La clave va SOLO en el servidor: GEMINI_API_KEY (nunca en Git ni en el frontend).
    gemini_api_key: SecretStr | None = None
    gemini_model: str = "gemini-2.5-flash"
    gemini_api_base: str = "https://generativelanguage.googleapis.com/v1beta"
    # Capa gratuita: costo 0. Si se usa la capa de pago, configura los precios del modelo elegido.
    gemini_input_usd_per_mtok: float = 0.0
    gemini_output_usd_per_mtok: float = 0.0


@lru_cache
def get_settings() -> Settings:
    return Settings()
