# IMPLEMENTATION_PLAN — REQUIEM CONTROL

Desarrollo incremental. **Cada fase requiere revisión y autorización del propietario antes de comenzar.**

| Fase | Nombre | Estado |
|---|---|---|
| 0 | Auditoría | ✅ Completa |
| 1 | Fundamento visual | ✅ Completa |
| 2 | Autenticación y base de datos | ✅ Completa |
| 3 | Ingesta de datos (CSV/XLSX) | ✅ Completa |
| 4 | Primeros agentes de IA | ✅ Completa (pendiente de revisión) |
| 5 | Reportes e inteligencia | ⏸ Siguiente — esperando autorización |
| 6 | Integraciones (Gmail, Sheets, Drive) | Pendiente |
| 7 | Agentes avanzados | Pendiente |
| 8 | Facturación y preparación para producción | Pendiente |

## Fase 0 — Auditoría ✅
Repositorio inspeccionado (vacío), stack decidido, documentación base creada. Ver PROJECT_AUDIT.md.

## Fase 1 — Fundamento visual ✅
Sistema de diseño (tokens), shell responsivo (barra lateral / riel / cajón móvil), barra superior, panel con
estado de onboarding y vista de demostración etiquetada, componentes de vidrio, fondo ambiental de 120 s,
estados de carga/vacío/error, i18n es/en, páginas honestas para módulos planificados, pruebas unitarias y e2e.

## Fase 2 — Autenticación y base de datos ✅
Decisiones tomadas (recomendadas en la Fase 0 y autorizadas por el propietario):
- **Un solo backend Python** (`backend/`): FastAPI + SQLAlchemy 2 + Alembic + Pydantic. Las fases de datos e IA se
  añadirán como módulos del mismo servicio (monolito modular).
- **Autenticación propia** (sin proveedor externo, costo $0): Argon2id, sesiones de servidor en cookie HttpOnly,
  CSRF ligado a la sesión, límite de intentos.
- **Multi-tenant con doble barrera**: organización activa resuelta en el servidor + PostgreSQL RLS con un rol de
  aplicación sin privilegios para saltarla.
- Planes y límites en la base de datos (configurables sin tocar código).

Pendiente dentro del área (requiere proveedor de email, autorización de costo): invitaciones por correo,
verificación de correo, recuperación de contraseña.

## Fase 3 — Ingesta de datos ✅
Flujo: subir → validar por contenido → leer → vista previa con hallazgos explicados → mapeo de columnas (nombre,
tipo, rol, incluir) → confirmar → reporte de calidad + filas paginadas → historial. Tablas `uploaded_files`
(archivo original en `bytea`), `datasets`, `dataset_rows` (JSONB por fila), todas con RLS. Límites: 10 MB por
archivo, 100,000 filas, 200 columnas, almacenamiento del plan (gratis: 50 MB). Procesamiento síncrono dentro de
esos límites.

Pendiente dentro del área: procesamiento en segundo plano para archivos más grandes (worker), elección de hoja en
la interfaz (la API ya acepta `sheet`), exportación de conjuntos a CSV (con neutralización de fórmulas, Fase 5),
importación en la demostración sin servidor.

## Fase 4 — Primeros agentes ✅
- Catálogo en `agent_definitions` (6 agentes; Analista de datos y Analista financiero disponibles, el resto planificado).
- Activación por organización con límite del plan en el servidor (gratis: 2) y límite mensual de ejecuciones (gratis: 100).
- Ciclo de vida `created → queued → running → awaiting_approval → completed | failed | cancelled`, con clave de
  idempotencia, tiempo máximo y registro de fallos.
- Herramientas acotadas por agente (`read_dataset`, `dataset_quality`, `summarize`, `propose_action`); sin código arbitrario.
- Aprobación humana atómica: la acción propuesta (eliminar duplicados) solo se ejecuta una vez y tras aprobarla.
- Proveedor de IA: simulado por defecto; adaptador de Claude (`claude-opus-5-5`, SDK oficial, respaldo ante rechazos)
  listo y probado contra un transporte HTTP simulado, **sin llamadas reales** hasta que el propietario lo autorice.

Pendiente del área: worker separado para ejecuciones largas, asistente conversacional (módulo Asistente IA),
más acciones aprobables (requieren integraciones, Fase 6).

## Fase 5 — Reportes e inteligencia (siguiente recomendada)
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
