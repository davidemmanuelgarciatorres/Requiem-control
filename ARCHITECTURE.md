# ARCHITECTURE — REQUIEM CONTROL

## 1. Visión lógica (objetivo)

```
                 ┌──────────────────────────────┐
  Navegador ───▶ │ Frontend SPA (React + TS)    │  estático (CDN)        ← EXISTE
                 └──────────────┬───────────────┘
                                │ HTTPS / JSON (cookie de sesión, CSRF)
                 ┌──────────────▼───────────────┐
                 │ Backend Python (FastAPI)     │  monolito modular      ← EXISTE (Fase 2)
                 │  ├─ api/ auth, orgs, planes  │  ← EXISTE
                 │  ├─ ingestion/ CSV, XLSX     │  ← EXISTE (Fase 3)
                 │  ├─ agents/ orquestación     │  ← EXISTE (Fase 4)
                 │  ├─ providers IA (mock+Claude)│  ← EXISTE (Fase 4)
                 │  ├─ reporting/               │  ← Fase 5
                 │  └─ integrations/ OAuth      │  ← Fase 6
                 └───────┬──────────────┬───────┘
                         │              │ cola de trabajos (tabla PG → worker)
                 ┌───────▼──────┐ ┌─────▼────────────────┐
                 │ PostgreSQL   │ │ Worker(s) Python     │  análisis y agentes largos (Fase 3+)
                 │ (+ RLS)      │ │ (mismo código base)  │
                 └──────────────┘ └──────────────────────┘
```

Principios: el frontend **nunca** ve credenciales de base de datos ni claves de IA; el backend valida cada
operación, permiso, organización y límite de plan; los procesos pesados salen de la petición síncrona hacia
workers; la separación en servicios solo ocurre cuando la demanda real lo justifique.

## 2. Estructura del repositorio (actual)

```
/
├─ README.md, PROJECT_AUDIT.md, IMPLEMENTATION_PLAN.md, PROJECT_STATUS.md, ARCHITECTURE.md, SECURITY.md
├─ .env.example          plantilla de variables (sin secretos)
├─ backend/
│  ├─ pyproject.toml, requirements*.txt, alembic.ini
│  ├─ app/
│  │  ├─ main.py           FastAPI: middleware de seguridad, manejo de errores, /api/health
│  │  ├─ config.py         configuración por variables de entorno (pydantic-settings)
│  │  ├─ db.py             motor, sesión por petición, set_tenant_context() para RLS
│  │  ├─ models.py         modelo SQLAlchemy 2 tipado
│  │  ├─ schemas.py        contratos Pydantic (entrada estricta: extra="forbid")
│  │  ├─ services.py       sesiones, organizaciones, membresías
│  │  ├─ entitlements.py   límites del plan (servidor)
│  │  ├─ audit.py          registro de auditoría
│  │  ├─ errors.py         errores {"error": {code, message}}
│  │  ├─ security/         passwords (Argon2id), tokens (SHA-256), rate_limit
│  │  ├─ agents/           providers.py, tools.py, data_analyst.py, financial_analyst.py, runner.py, approvals.py
│  │  ├─ ingestion/        validation.py (seguridad), parsing.py (CSV/XLSX), analysis.py (tipos y calidad), service.py
│  │  └─ api/              deps (auth, CSRF, permisos), auth.py, organizations.py, datasets.py, agents.py, serializers.py
│  ├─ migrations/versions/0001_identity_tenancy.py   DDL + políticas RLS + semillas
│  ├─ migrations/versions/0002_data_ingestion.py     archivos, conjuntos y filas (RLS)
│  ├─ migrations/versions/0003_agents.py             agentes, ejecuciones, aprobaciones (RLS)
│  ├─ scripts/init_dev_db.sh                          roles y bases locales
│  └─ tests/               pytest contra PostgreSQL real (API, permisos, aislamiento, RLS)
└─ frontend/
   ├─ index.html, vite.config.ts, playwright.config.ts, eslint.config.js, tsconfig*.json
   ├─ e2e/               pruebas Playwright (ciclo ambiental, responsivo, navegación)
   └─ src/
      ├─ main.tsx, App.tsx, AppRoutes.tsx
      ├─ app/            navigation.ts · preferences.tsx (idioma, movimiento) · auth.tsx (sesión, organización activa)
      ├─ config/         ambient.ts  ← AMBIENT_CYCLE_SECONDS = 120 (fuente única)
      ├─ i18n/           es.ts (fuente, tipada) · en.ts (misma forma, verificada por TS)
      ├─ lib/            api.ts (cliente HTTP + CSRF) · useApi.ts · format.ts (Intl) · storage.ts
      ├─ components/
      │  ├─ layout/      AppShell, Sidebar, MobileDrawer, TopBar, GlobalSearch, AmbientBackground, NavList, Brand
      │  ├─ ui/          Card, Button, Badge/DemoBadge, Popover, ProgressRing, States (Skeleton/Empty/Error)
      │  └─ charts/      AreaChart, Sparkline, Gauge, Heatmap (SVG, accesibles)
      ├─ features/
      │  ├─ dashboard/   DashboardPage, EmptyDashboard, DemoDashboardView, DashboardSkeleton, useDashboardData, demoData
      │  ├─ agents/      catalog.ts (vista previa de especificaciones), AgentsPage
      │  ├─ modules/     ModulePage (plantilla para módulos planificados), PageHeader, NotFoundPage
      │  ├─ auth/        LoginPage, RegisterPage, RequireAuth, errores traducidos
      │  ├─ settings/    preferencias + cuenta, organización, miembros, plan, auditoría, datos
      │  ├─ integrations/, design-system/
      ├─ styles/         tokens.css · base.css · ambient.css · components.css · layout.css · dashboard.css · pages.css
      └─ test/           setup y utilidades de render
```

Módulos previstos en `backend/app/` para fases siguientes (se crearán al implementarlas): `agents/`, `providers/`, `orchestration/`, `reporting/`, `integrations/`.

## 3. Frontend — decisiones clave

- **Rutas** (`react-router-dom`): `AppShell` es el layout; cada ítem de `NAV_SECTIONS` declara `status`
  (`live`/`planned`) y `phase`. Los módulos planificados usan `ModulePage`, que explica qué hará el módulo y cuándo,
  sin simular funcionalidad.
- **Datos del panel**: `useDashboardData(demo, lang, loader)` devuelve `empty | loading | error | ready`. En la
  Fase 1 el estado por defecto es `empty`; solo `?view=demo` carga datos ficticios. En la Fase 2 el `loader`
  se sustituirá por una llamada a la API de la organización activa, sin cambiar los componentes.
- **i18n**: `t` es el diccionario tipado (`t.dashboard.kpi.revenue`); no hay cadenas sueltas en componentes.
- **Diseño**: tokens en `tokens.css`; clases con prefijo `rc-`. Vidrio en tres intensidades (`rc-glass`,
  `--strong`, `--subtle`) con respaldo opaco si no hay `backdrop-filter`.
- **Responsivo**: móvil primero; puntos de corte 640 / 768 / 1024 / 1200 px.

## 4. Fondo ambiental: la Tierra girando (120 s por vuelta)

`config/ambient.ts` (`AMBIENT_CYCLE_SECONDS = 120`, inclinación axial, dirección del sol, fps máximos) →
`components/earth/EarthGlobe.tsx` (WebGL2) + `earthShader.ts` + `earthMath.ts`.

- **Sin dependencias**: un único triángulo a pantalla completa; el fragment shader calcula por píxel la intersección
  con la esfera, deshace la inclinación (23.44°) y la rotación diaria, muestrea texturas equirectangulares sin
  costura (`textureGrad`), ilumina con un sol fijo (arriba a la derecha), y compone nubes, brillo especular del
  océano, atmósfera (Fresnel + halo) y **luces de ciudad solo en el lado nocturno** (`nightFactor`, con crepúsculo
  gradual). Evitamos three.js (~170 kB) porque no se necesita una escena 3D completa.
- **Rotación**: fase = `(Date.now() mod 120 000) / 120 000`. Hacia el este (los continentes entran por la izquierda,
  de noche, y amanecen al cruzar el terminador). Todas las longitudes pasan por el centro en cada ciclo.
- **Rendimiento**: máximo 30 fps, `devicePixelRatio` limitado a 1.5, pausa con la pestaña oculta, texturas WebP
  (~380 kB en total, en `public/earth/`, cargadas después del primer render).
- **Movimiento reducido** (SO o Configuración): un único fotograma fijo, sin bucle.
- **Respaldo**: sin WebGL2 o si fallan las texturas, un disco estático en CSS; la app sigue funcionando.
- Capas CSS estáticas: estrellas, destello solar alineado con `SUN_DIRECTION`, viñeta para la legibilidad.

## 5. Backend (Fase 2)

### Flujo de una petición autenticada
1. Middleware: verifica `Origin` (si existe) contra `ALLOWED_ORIGINS`, exige `application/json` y tamaño máximo en
   métodos que cambian estado; añade cabeceras de seguridad.
2. `get_auth`: lee la cookie `rc_session`, busca `sha256(token)` en `user_sessions`, comprueba expiración y usuario
   activo, y en POST/PATCH/DELETE compara `X-CSRF-Token` con el token de la sesión (tiempo constante).
3. `set_tenant_context`: `set_config('app.current_user_id' / 'app.current_org_id', …, true)` con alcance de transacción.
4. Se carga la membresía en la organización activa → rol → permisos. `require_permission("…")` protege cada endpoint.
5. Una transacción por petición: commit al final o rollback ante error.

### Modelo de datos
```
users ─┬─< organization_members >─┬─ organizations ─┬─ subscriptions ── plans
       │            │             │                 ├─< audit_logs
       │            └── roles ──< role_permissions >── permissions
       └─< user_sessions (active_organization_id)   ├─< usage_records
                                                     ├─< uploaded_files ─< datasets ─< dataset_rows
                                                     ├─< agent_executions ─< approvals
                                                     └─< reports (instantánea JSONB de una ejecución)
users ─< user_floaters (RLS por usuario)
organizations ─< assistant_messages (RLS por organización Y usuario)
organizations ─< integrations (tokens cifrados) · oauth_states (state de un solo uso, RLS por usuario)
```
Todas las tablas con `organization_id` tienen RLS. Políticas clave: `organizations` visibles si son la activa o si el
usuario es miembro; `organization_members` visibles si son de la org activa o del propio usuario (para listar sus
organizaciones); escritura solo en la org activa; `audit_logs` de solo anexado (sin UPDATE/DELETE para la API).

### Endpoints
| Método y ruta | Permiso |
|---|---|
| `GET /api/health` · `GET /api/plans` | público |
| `POST /api/auth/register` · `POST /api/auth/login` | público (límite de intentos) |
| `GET/PATCH /api/auth/me` · `POST /api/auth/logout` · `POST /api/auth/switch-organization` | sesión |
| `GET/POST /api/organizations` | sesión |
| `GET /api/organizations/current` · `PATCH` · `DELETE` | `org.read` · `org.update` · `org.delete` |
| `GET/POST /api/organizations/current/members` · `PATCH/DELETE …/{id}` | `members.read` · `members.manage` |
| `GET /api/organizations/current/subscription` | `billing.read` |
| `GET /api/organizations/current/audit-logs` · `GET …/export` | `audit.read` · `org.export` |

| `POST /api/datasets/uploads` (multipart) · `GET …/uploads` · `GET/DELETE …/uploads/{id}` | `data.write` · `data.read` |
| `POST /api/datasets/uploads/{id}/confirm` | `data.write` |
| `GET /api/datasets` · `GET …/{id}` · `GET …/{id}/rows` · `DELETE …/{id}` | `data.read` · `data.write` |

| `GET /api/agents` · `GET /api/agents/provider` · `PUT /api/agents/{id}/activation` | `org.read` · `agents.manage` |
| `POST /api/agents/{id}/executions` (202) · `GET …/executions[/{id}]` · `POST …/executions/{id}/cancel` | `agents.run` · `data.read` |
| `GET /api/approvals` · `POST /api/approvals/{id}/decision` | `data.read` · `approvals.decide` |

| `POST /api/reports` · `GET /api/reports[/{id}]` · `GET …/{id}/export.csv` · `DELETE …/{id}` | `data.read` · `data.write` (borrar) |
| `GET /api/datasets/{id}/export.csv` · `GET /api/dashboard/summary` | `data.read` |
| `GET /api/finance/overview?dataset_id&period_a&period_b` | `data.read` |
| `POST /api/assistant/messages` · `GET /api/assistant/conversations[/{id}]` · `DELETE …/{id}` | `data.read` (solo conversaciones propias) |
| `GET /api/integrations` | `org.read` |
| `POST /api/integrations/google/connect` · `POST …/disconnect` · `GET …/callback` | `integrations.manage` |
| `GET …/google/sheets[/{id}]` · `POST …/google/sheets/import` · `GET …/google/drive/recent` · `GET …/google/gmail/recent` | `data.read` · `data.write` (importar) |
| `GET/POST /api/me/floaters` (multipart) · `GET …/{id}/image` · `DELETE …/{id}` · `PATCH /api/me/preferences` | sesión (solo datos propios) |

Documentación interactiva (solo fuera de producción): `/api/docs`.

### Agentes (Fase 4)
`POST …/executions` valida (agente activo, límite mensual, idempotencia), crea la ejecución (`created → queued`),
**confirma la transacción** y encola `runner.run_execution` como tarea en segundo plano de la API. La tarea abre su
propia sesión con el contexto RLS de la organización, marca `running`, ejecuta el agente con un `ToolContext` que solo
permite las herramientas de su definición, pide al proveedor un resumen a partir de **hechos agregados** (nunca filas),
y termina en `completed`, `awaiting_approval` (si propuso acciones) o `failed` (con código). Las aprobaciones se
deciden con un `UPDATE … WHERE status = 'pending'` atómico y el servidor ejecuta la acción una sola vez.

### Reportes (Fase 5)
`app/reports.py` copia el resultado de una ejecución completada a `reports.content` (instantánea: no cambia si los
datos cambian después), calcula la comparación con el reporte anterior del mismo agente al leerlo y arma las filas
CSV; `app/exports.py` neutraliza fórmulas y añade BOM UTF-8. El PDF se obtiene con la impresión del navegador y una
hoja `@media print` (sin servicio externo). `GET /api/dashboard/summary` agrega datos reales para el panel.

### Integraciones (Fase 6)
`app/integrations/google.py`: `start` crea el `state` (hash) y el verificador PKCE cifrado y devuelve la URL de Google;
`finish` (callback, mismo dominio para que viaje la cookie `SameSite=Lax`) valida el `state`, intercambia el código con
el verificador, comprueba los permisos concedidos y guarda los tokens cifrados. `_call` renueva el token si caduca y ante
un 401; los errores se guardan en `last_error` (confirmados aunque la petición falle). La importación de Sheets genera un
CSV y usa `ingestion.create_upload`, así hereda todas las validaciones.

### Asistente (Fase 4)
`app/assistant.py`: `build_context` resume datos, finanzas, reportes, agentes y aprobaciones (agregados); con el proveedor
simulado responde `rule_based_answer`; con uno real se usa `provider.complete()` (Claude o Gemini) y `parse_tagged`
separa las partes etiquetadas.

### Ingesta (Fase 3)
`validation.detect` (firma de bytes, paquete OOXML, macros, cifrado, zip-bomb, codificación) → `parsing.parse`
(todo como texto; XLSX solo valores) → `analysis.analyze` (inferencia de tipos, hallazgos con filas de evidencia,
estadísticas por columna) → vista previa. Al confirmar se vuelve a leer el archivo **guardado** (no se confía en lo
que reenvía el cliente), se aplica el mapeo, se convierten los valores y se insertan las filas en lotes de 1,000.
Cada fila guarda el número de fila del archivo original para trazar cualquier cifra a su origen.

### Frontend ↔ API
Mismo origen: Vite (dev y preview) reenvía `/api` a FastAPI, así la cookie es de primera parte y no hace falta CORS.
En producción, el CDN/proxy debe enrutar `/api` al backend del mismo dominio. `AuthProvider` carga `/api/auth/me`
al iniciar (`loading → authenticated | anonymous | unreachable`) y guarda el token CSRF solo en memoria.

## 6. Contratos futuros (borrador)

- Agente: `id, name, version, purpose, input_schema, output_schema, allowed_tools[], data_scope,
  required_permissions[], limits {max_rows, max_tokens}, timeout_s, retry_policy, approval_required`.
- Ejecución: `id, organization_id, user_id, agent_id, input_refs, status, started_at, completed_at, output,
  error, usage, approvals[]`, con transición de estados validada en el servidor.
- Proveedor de IA: `complete(request) -> response` con validación, timeout, reintentos acotados, uso y costo;
  `MockProvider` siempre marca sus respuestas como simuladas.
