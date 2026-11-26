# IMPLEMENTATION_PLAN — REQUIEM CONTROL

Desarrollo incremental. **Cada fase requiere revisión y autorización del propietario antes de comenzar.**

| Fase | Nombre | Estado |
|---|---|---|
| 0 | Auditoría | ✅ Completa |
| 1 | Fundamento visual | ✅ Completa (pendiente de revisión) |
| 2 | Autenticación y base de datos | ⏸ Esperando autorización |
| 3 | Ingesta de datos (CSV/XLSX) | Pendiente |
| 4 | Primeros agentes de IA | Pendiente |
| 5 | Reportes e inteligencia | Pendiente |
| 6 | Integraciones (Gmail, Sheets, Drive) | Pendiente |
| 7 | Agentes avanzados | Pendiente |
| 8 | Facturación y preparación para producción | Pendiente |

## Fase 0 — Auditoría ✅
Repositorio inspeccionado (vacío), stack decidido, documentación base creada. Ver PROJECT_AUDIT.md.

## Fase 1 — Fundamento visual ✅
Sistema de diseño (tokens), shell responsivo (barra lateral / riel / cajón móvil), barra superior, panel con
estado de onboarding y vista de demostración etiquetada, componentes de vidrio, fondo ambiental de 120 s,
estados de carga/vacío/error, i18n es/en, páginas honestas para módulos planificados, pruebas unitarias y e2e.

## Fase 2 — Autenticación y base de datos (siguiente recomendada)
- `backend/` en Python: FastAPI + SQLAlchemy 2 + Alembic (migraciones) + Pydantic; PostgreSQL 16 local (Docker o nativo).
- Esquema: `users`, `organizations`, `organization_members`, `roles`, `permissions`, `plans`, `subscriptions`,
  `audit_logs`, `usage_records` (resto de tablas en sus fases).
- Autenticación: sesiones con cookie `HttpOnly; Secure; SameSite=Lax`, hash Argon2id, protección CSRF, límite de intentos.
  Alternativa a evaluar: proveedor gestionado (p. ej. Supabase Auth) — requiere autorización por costo/dependencia.
- Aislamiento multi-tenant: `organization_id` obligatorio + filtrado en repositorios + **PostgreSQL RLS** como segunda barrera.
- Frontend: pantallas de registro/inicio de sesión, selector de organización real, cliente API tipado.
- Pruebas: usuario de la org A no puede leer/escribir datos de la org B (API y SQL).
- **Decisión pendiente del propietario:** confirmar backend único en Python (recomendado) y método de autenticación.

## Fase 3 — Ingesta de datos
Subida CSV/XLSX con límites de tamaño, validación por *magic bytes* (no por nombre/MIME), OpenPyXL en modo
`read_only`/`data_only` (sin macros ni fórmulas), almacenamiento temporal seguro, vista previa, mapeo de columnas,
detección de duplicados/faltantes, procedencia e historial. Tablas `data_sources`, `uploaded_files`, `datasets`.

## Fase 4 — Primeros agentes
Abstracción de proveedores de IA (interfaz común, timeouts, reintentos, uso/costo), **proveedor mock claramente
identificado** cuando no haya clave, Analista de datos y Analista financiero, ciclo de vida
(`created → queued → running → awaiting_approval → completed | failed | cancelled`), herramientas con permisos,
aprobaciones humanas con idempotencia, límites de plan en el servidor (gratis: 2 agentes). Tablas
`agent_definitions`, `agent_executions`, `approvals`. Cola de trabajos en segundo plano (empezar con tabla en
PostgreSQL + worker; evaluar Redis solo si hace falta).

## Fase 5 — Reportes e inteligencia
Indicadores reales, comparaciones históricas, recomendaciones explicables (qué, evidencia, periodo, por qué,
acción, limitaciones — formato ya prototipado en la demo), exportación CSV/PDF. Reevaluar librería de gráficas.

## Fase 6 — Integraciones
OAuth oficial de Google con permisos mínimos, estado de conexión, última sincronización, errores, reconexión.

## Fase 7 — Agentes avanzados
Inventario, clientes, correo, automatizaciones — todos con aprobación para acciones externas.

## Fase 8 — Facturación y producción
Proveedor de pagos autorizado (sin almacenar tarjetas), planes por mercado/moneda (Premium objetivo MXN $400/mes),
monitoreo, respaldos, revisión de seguridad, pruebas de rendimiento, documentación de despliegue.

## Consideraciones de costo

| Concepto | Desarrollo | Producción (futuro, requiere autorización) |
|---|---|---|
| Frontend estático | $0 (local) | $0 en capas gratuitas (Netlify / Cloudflare Pages / Vercel) |
| API Python | $0 (local) | Capa gratuita o ~US$5–7/mes (Render, Fly.io, Railway) |
| PostgreSQL | $0 (local) | Capa gratuita (Neon, Supabase) con límites; de pago al crecer |
| Proveedor de IA | $0 (mock) | **Pago por uso** — principal costo variable; no incluido en Claude Code |
| Dominio | — | ~US$10–20/año |
| Pagos | — | Comisión por transacción (Stripe / Mercado Pago / Conekta) |

Nada de lo anterior se ha contratado ni activado.
