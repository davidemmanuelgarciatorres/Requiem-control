"""Configuración por variables de entorno (ver .env.example en la raíz)."""

from functools import lru_cache
from typing import Literal

from pydantic import Field
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


@lru_cache
def get_settings() -> Settings:
    return Settings()
