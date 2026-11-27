# REQUIEM CONTROL

Plataforma SaaS de inteligencia de negocio y automatización de operaciones con agentes de IA.

> **Estado actual: Fases 1–8 listas en código** — incluye cobros con Stripe (modo de prueba), contenedores de producción y respaldos; ver [DEPLOYMENT.md](DEPLOYMENT.md). Falta contratar hosting y Stripe (con tu autorización). Agentes de inventario, clientes y correo, automatizaciones,
> Funcionan de verdad: registro e inicio de sesión, organizaciones, miembros con roles y permisos,
> límites del plan aplicados en el servidor, auditoría, exportación y eliminación de datos,
> con aislamiento entre organizaciones en la API **y** en PostgreSQL (Row-Level Security).
> Importación de CSV/XLSX con validación segura, vista previa, mapeo de columnas, reporte de calidad e historial.
> Agentes con herramientas acotadas, ciclo de vida, límites del plan y acciones que esperan tu aprobación. El proveedor de IA es
> **simulado por defecto** (sin costo, etiquetado); Claude se activa con `AI_PROVIDER=anthropic` y tu credencial.
> También: hasta 3 imágenes flotantes personalizables por usuario.
> Proveedores de IA: simulado (predeterminado), Claude (incl. Haiku) o Gemini. Google necesita tus credenciales (ver `.env.example`).
> Probarla desde el teléfono sin computadora: ver [CODESPACES.md](CODESPACES.md).
> Proceso de trabajo: `EXECUTION_MODE=worker` + `python -m app.worker`.
> Las cifras de la “vista de demostración” son ficticias y están etiquetadas como tales.

## Documentación

| Documento | Contenido |
|---|---|
| [PROJECT_AUDIT.md](PROJECT_AUDIT.md) | Estado del repositorio y decisiones de stack |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | Fases, riesgos y costos |
| [PROJECT_STATUS.md](PROJECT_STATUS.md) | Qué está implementado, probado, simulado o pendiente |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Estructura, modelo de datos y flujo de peticiones |
| [SECURITY.md](SECURITY.md) | Autenticación, autorización, datos, secretos y salvaguardas |

## Diseño

Estilo espacial/editorial: la Tierra gira al centro del fondo (WebGL2, una vuelta cada 120 s) y muestra las luces
de las ciudades solo en su lado nocturno. Respeta “reducir movimiento”. Texturas de la NASA: `frontend/public/earth/CREDITS.md`.

## Stack

- **Frontend:** React 19 + TypeScript + Vite (`frontend/`)
- **API:** Python 3.12+ · FastAPI · SQLAlchemy 2 · Alembic · Pydantic · Argon2id (`backend/`)
- **Base de datos:** PostgreSQL 16 con Row-Level Security

## Desarrollo local

Requisitos: Node.js ≥ 20, Python ≥ 3.12, PostgreSQL ≥ 16 en `localhost:5432`.

```bash
# 1. Base de datos (roles y bases locales; contraseñas solo de desarrollo)
sudo -u postgres backend/scripts/init_dev_db.sh

# 2. API
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --reload --port 8000     # docs: http://localhost:8000/api/docs

# 3. Frontend (otra terminal)
cd frontend
npm install
npm run dev                                              # http://localhost:5173 (proxy /api → :8000)
```

## Verificación

```bash
cd backend  && .venv/bin/ruff check . && .venv/bin/mypy app && .venv/bin/pytest
cd frontend && npm run check                    # lint + typecheck + unitarias + build
cd frontend && npm run build && npm run e2e     # e2e: levanta API + preview (base requiem_control_e2e migrada)
```

Demostración sin servidor (API simulada en el navegador, para probar en el teléfono): `npm run build:demo` → `frontend/dist-demo/`.

Para la base e2e: `MIGRATION_DATABASE_URL=postgresql+psycopg://requiem_owner:requiem_owner_dev@localhost:5432/requiem_control_e2e .venv/bin/alembic upgrade head`.
