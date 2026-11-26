# ARCHITECTURE — REQUIEM CONTROL

## 1. Visión lógica (objetivo)

```
                 ┌──────────────────────────────┐
  Navegador ───▶ │ Frontend SPA (React + TS)    │  estático (CDN)        ← EXISTE (Fase 1)
                 └──────────────┬───────────────┘
                                │ HTTPS / JSON (cookie de sesión, CSRF)
                 ┌──────────────▼───────────────┐
                 │ Backend Python (FastAPI)     │  monolito modular      ← Fase 2+
                 │  ├─ api/ auth, orgs, planes  │
                 │  ├─ ingestion/ CSV, XLSX     │  ← Fase 3
                 │  ├─ agents/ orquestación     │  ← Fase 4
                 │  ├─ providers/ IA (+ mock)   │
                 │  ├─ reporting/               │  ← Fase 5
                 │  └─ integrations/ OAuth      │  ← Fase 6
                 └───────┬──────────────┬───────┘
                         │              │ cola de trabajos (tabla PG → worker)
                 ┌───────▼──────┐ ┌─────▼────────────────┐
                 │ PostgreSQL   │ │ Worker(s) Python     │  análisis y agentes largos
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
├─ .env.example          plantilla sin valores (la Fase 1 no usa variables)
└─ frontend/
   ├─ index.html, vite.config.ts, playwright.config.ts, eslint.config.js, tsconfig*.json
   ├─ e2e/               pruebas Playwright (ciclo ambiental, responsivo, navegación)
   └─ src/
      ├─ main.tsx, App.tsx, AppRoutes.tsx
      ├─ app/            navigation.ts (secciones, estado y fase de cada módulo) · preferences.tsx (idioma, movimiento)
      ├─ config/         ambient.ts  ← AMBIENT_CYCLE_SECONDS = 120 (fuente única)
      ├─ i18n/           es.ts (fuente, tipada) · en.ts (misma forma, verificada por TS)
      ├─ lib/            format.ts (Intl: moneda, %, fechas) · storage.ts (localStorage seguro)
      ├─ components/
      │  ├─ layout/      AppShell, Sidebar, MobileDrawer, TopBar, GlobalSearch, AmbientBackground, NavList, Brand
      │  ├─ ui/          Card, Button, Badge/DemoBadge, Popover, ProgressRing, States (Skeleton/Empty/Error)
      │  └─ charts/      AreaChart, Sparkline, Gauge, Heatmap (SVG, accesibles)
      ├─ features/
      │  ├─ dashboard/   DashboardPage, EmptyDashboard, DemoDashboardView, DashboardSkeleton, useDashboardData, demoData
      │  ├─ agents/      catalog.ts (vista previa de especificaciones), AgentsPage
      │  ├─ modules/     ModulePage (plantilla para módulos planificados), PageHeader, NotFoundPage
      │  ├─ integrations/, settings/, design-system/
      ├─ styles/         tokens.css · base.css · ambient.css · components.css · layout.css · dashboard.css · pages.css
      └─ test/           setup y utilidades de render
```

Estructura prevista para fases siguientes (se creará cuando se implemente, no antes):
`backend/` (FastAPI: `api/`, `agents/`, `providers/`, `analysis/`, `data_processing/`, `orchestration/`,
`permissions/`, `reporting/`, `validation/`), `database/` (migraciones Alembic), `shared/` (contratos OpenAPI →
tipos TS generados).

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

## 5. Contratos futuros (borrador)

- Agente: `id, name, version, purpose, input_schema, output_schema, allowed_tools[], data_scope,
  required_permissions[], limits {max_rows, max_tokens}, timeout_s, retry_policy, approval_required`.
- Ejecución: `id, organization_id, user_id, agent_id, input_refs, status, started_at, completed_at, output,
  error, usage, approvals[]`, con transición de estados validada en el servidor.
- Proveedor de IA: `complete(request) -> response` con validación, timeout, reintentos acotados, uso y costo;
  `MockProvider` siempre marca sus respuestas como simuladas.
