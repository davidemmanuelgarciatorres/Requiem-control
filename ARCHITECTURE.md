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
                 │  ├─ ingestion/ CSV, XLSX     │  ← Fase 3
                 │  ├─ agents/ orquestación     │  ← Fase 4
                 │  ├─ providers/ IA (+ mock)   │
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
│  │  └─ api/              deps (auth, CSRF, permisos), auth.py, organizations.py, serializers.py
│  ├─ migrations/versions/0001_identity_tenancy.py   DDL + políticas RLS + semillas
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

Módulos previstos en `backend/app/` para fases siguientes (se crearán al implementarlas): `ingestion/`,
`analysis/`, `agents/`, `providers/`, `orchestration/`, `reporting/`, `integrations/`.

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

## 4. Fondo ambiental (120 s)

`config/ambient.ts` → `AmbientBackground` inyecta `--ambient-cycle: 120s` → `styles/ambient.css`.
Cuatro estratos de pantalla completa (azul base siempre opaco + turquesa, teal y violeta encima) animan solo
`opacity`; dos orbes animan solo `transform`. Ambas propiedades se componen en GPU: no hay repintado por cuadro ni
bucles de JavaScript. Cada estrato superior aparece sobre el anterior ya opaco (fundido real A→B) y los estratos
ocultos se apagan solo mientras están totalmente cubiertos; al 100 % todos valen 0, idéntico al 0 % ⇒ bucle sin saltos.
Una viñeta constante mantiene el contraste durante todo el ciclo. Para cambiar la duración: editar solo
`AMBIENT_CYCLE_SECONDS`.

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
       └─< user_sessions (active_organization_id)   └─< usage_records
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

Documentación interactiva (solo fuera de producción): `/api/docs`.

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
