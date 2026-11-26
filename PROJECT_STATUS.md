# PROJECT_STATUS — REQUIEM CONTROL

Última actualización: 2026-11-26 · Fase actual: **2 (autenticación y base de datos) — completa, pendiente de revisión**

## ✅ Implementado y probado

### Fase 2 — Autenticación, base de datos y multi-organización
| Funcionalidad | Cómo se verificó |
|---|---|
| Esquema PostgreSQL con migración Alembic (`users`, `organizations`, `organization_members`, `roles`, `permissions`, `role_permissions`, `plans`, `subscriptions`, `user_sessions`, `audit_logs`, `usage_records`) | Las pruebas ejecutan `downgrade base` + `upgrade head` en cada corrida. |
| **Row-Level Security** en todas las tablas de organización; la API usa un rol sin superusuario ni `BYPASSRLS` | pytest directo en SQL: sin contexto no se ve ninguna fila; con contexto de la org A no se ve ni se puede escribir nada de la B; el rol no puede saltarse RLS; auditoría solo de anexado. |
| Registro (crea usuario + organización + propietario + plan gratuito, de forma atómica) | pytest + unitaria + e2e por UI. |
| Contraseñas con **Argon2id**, longitud mínima 10, no igual al correo | pytest (hash `$argon2id$`, sin texto plano). |
| Inicio de sesión con mensaje genérico, rotación de token, límite de intentos (5/min) | pytest (respuesta idéntica para correo inexistente y contraseña errónea; 6.º intento → 429). |
| Sesiones en cookie `HttpOnly` + `SameSite=Lax`; token guardado solo como SHA-256; expiración; cierre de sesión invalida en servidor | pytest + e2e (inspección de cookie real). |
| CSRF: token ligado a la sesión obligatorio en todo POST/PATCH/DELETE; verificación de `Origin`; solo `application/json` | pytest + e2e. |
| Organizaciones: crear varias, cambiar la activa, renombrar, exportar (JSON), eliminar con confirmación | pytest + e2e (crear y cambiar por UI). |
| Miembros: listar, agregar (usuarios registrados), cambiar rol, quitar; protección del último propietario; nadie gestiona a alguien de rango superior | pytest + unitarias + e2e. |
| Roles del sistema `owner/admin/member/viewer` con 14 permisos; validación en servidor en cada endpoint | pytest (lector no puede gestionar ni ver auditoría). |
| Planes configurables en BD (gratis: 2 agentes, 3 miembros…; Premium: MXN $400/mes) y **límites aplicados en el servidor** | pytest (4.º miembro en plan gratuito → 402; regla “máx. 2 agentes” lista para la Fase 4). |
| Registro de auditoría (incl. intentos fallidos, que persisten aunque la petición falle) | pytest. |
| Errores de API con forma estable, sin trazas ni SQL; cabeceras de seguridad | pytest. |
| Frontend: inicio de sesión, registro, rutas protegidas, estado “API no disponible” con reintento, selector de organización (también en móvil), perfil con cierre de sesión, Configuración con cuenta/organización/miembros/plan/auditoría/datos, estado del sistema en vivo (`/api/health`) | 38 unitarias (API simulada) + e2e contra API real. |

### Fase 1 — Fundamento visual (sigue vigente)
Fondo ambiental de **120 s exactos** (verificado con la Web Animations API en Chromium), movimiento reducido, shell responsivo, búsqueda de módulos, idiomas es/en, panel con onboarding y demo etiquetada, estados de carga/vacío/error, sin desbordamiento horizontal en escritorio y móvil.

## 🟡 Implementado pero no probado automáticamente
- Navegadores distintos de Chromium (Safari/iOS, Firefox).
- Respaldo de vidrio sin `backdrop-filter`.
- Auditoría automática de contraste/accesibilidad (axe/Lighthouse) no ejecutada.
- Despliegue real con HTTPS (`COOKIE_SECURE=true`) y detrás de un proxy (IP real del cliente).

## 🟠 Simulado (etiquetado en la interfaz)
- Cifras de `/?view=demo` (ficticias, `demoData.ts`).
- Botones de agentes, aprobaciones e integraciones: deshabilitados con la fase en que llegan.
- Uso en el plan (`active_agents`, `monthly_executions`, `storage_mb`) se reporta como 0 porque esas funciones aún no existen.

## ⏳ Pendiente
- Invitaciones por correo (requiere un proveedor de email; hoy solo se agregan usuarios ya registrados).
- Recuperación de contraseña y verificación de correo (requieren envío de email).
- 2FA y gestión de sesiones activas.
- Limitador de intentos compartido entre réplicas (hoy en memoria por proceso).
- Fases 3–8: importación CSV/XLSX, agentes de IA, reportes, integraciones, agentes avanzados, facturación.
- CI (GitHub Actions) — propuesto, no activado sin autorización.

## Resultados de la última ejecución
```
backend:  ruff check .          → sin problemas
          mypy app (strict)     → sin errores (19 archivos)
          pytest                → 30 aprobadas (PostgreSQL 16 real)
frontend: npm run lint          → 0 problemas
          npm run typecheck     → 0 errores
          npm run test          → 6 archivos, 38 aprobadas
          npm run build         → OK
          npm run e2e           → 39 aprobadas, 1 omitida a propósito (skip-link solo en escritorio)
                                   (API FastAPI + PostgreSQL reales; escritorio 1440×900 y Pixel 7)
```
