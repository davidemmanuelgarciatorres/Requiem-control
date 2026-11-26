"""Errores de API con forma estable: {"error": {"code", "message"}}.

Los mensajes nunca incluyen trazas, SQL ni datos de negocio.
"""

from typing import Any


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, extra: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.extra = extra or {}


def unauthorized(message: str = "Autenticación requerida.") -> ApiError:
    return ApiError(401, "auth.required", message)


def forbidden(code: str = "auth.forbidden", message: str = "No tienes permiso para esta acción.") -> ApiError:
    return ApiError(403, code, message)


def not_found(what: str = "resource") -> ApiError:
    return ApiError(404, f"{what}.not_found", "No encontrado.")


def conflict(code: str, message: str) -> ApiError:
    return ApiError(409, code, message)
