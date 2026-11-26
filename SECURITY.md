# SECURITY — REQUIEM CONTROL

## 1. Controles implementados (Fases 1–3) — todos con pruebas automatizadas

| Área | Control |
|---|---|
| Contraseñas | Argon2id (argon2-cffi, parámetros OWASP), re-hash automático si cambian los parámetros, mínimo 10 caracteres, no igual al correo. Nunca se registran ni se devuelven. |
| Enumeración de cuentas | Inicio de sesión con respuesta idéntica para correo inexistente y contraseña errónea; se verifica contra un hash ficticio para igualar tiempos. (El registro sí informa “correo ya usado”: compromiso habitual, documentado.) |
| Fuerza bruta | 5 intentos por minuto por IP+correo en login y por IP en registro → 429. **Limitación:** en memoria por proceso. |
| Sesiones | Token aleatorio de 256 bits en cookie `HttpOnly`, `SameSite=Lax`, `Secure` en producción (`COOKIE_SECURE=true`); en BD solo `sha256(token)`; token nuevo en cada inicio de sesión (anti-fijación); expiración (7 días por defecto); cierre de sesión borra la sesión en el servidor; limpieza de sesiones caducadas. |
| CSRF | Token por sesión exigido en todo POST/PATCH/DELETE autenticado (comparación en tiempo constante), guardado solo en memoria del frontend; además: verificación de `Origin`, solo `application/json`, cookies `SameSite=Lax`. |
| Autorización | Roles `owner > admin > member > viewer` y 14 permisos en BD; `require_permission` en cada endpoint; nadie puede gestionar a un miembro de rango superior; la organización conserva al menos un propietario; el rol de propietario no se asigna al agregar. |
| Aislamiento multi-tenant | (1) La organización activa sale de la sesión y de una membresía verificada, nunca de un parámetro del cliente; las rutas usan `/current`. (2) **PostgreSQL RLS** en todas las tablas con `organization_id`, contexto por transacción, y la API conecta con `requiem_app` (sin superusuario ni `BYPASSRLS`); las migraciones usan otro rol (`requiem_owner`). (3) Pedir una organización ajena o inexistente da la misma respuesta. |
| Límites del plan | Leídos de la tabla `plans` y aplicados en el servidor (p. ej. máximo de miembros → 402; regla de 2 agentes activos lista para la Fase 4). Nunca se confía en una bandera del frontend. |
| Validación | Pydantic con `extra="forbid"` (campos desconocidos → 422), longitudes máximas, correo validado; SQL siempre parametrizado (SQLAlchemy); tamaño máximo de cuerpo JSON. |
| Errores | Forma estable `{"error": {code, message}}`; errores 500 genéricos con detalle solo en el log del servidor; sin trazas ni SQL al cliente. |
| Cabeceras | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, `Cache-Control: no-store` en `/api`. Documentación OpenAPI desactivada en producción. |
| Auditoría | `audit_logs` de solo anexado (la API no tiene UPDATE/DELETE): registro, login, fallos de login (persisten aunque la petición falle), cambio de organización, cambios de miembros, edición, exportación y eliminación. Sin contraseñas ni tokens. |
| Archivos subidos | Formato por contenido (firma y estructura), nunca por nombre/MIME; sin macros (`.xlsm`, `vbaProject.bin`), sin libros cifrados ni `.xls`; anti zip-bomb (tamaño descomprimido y razón de compresión); XLSX en modo solo-valores (no se evalúan fórmulas ni vínculos externos); CSV debe ser texto; límites de 10 MB / 100,000 filas / 200 columnas y de almacenamiento del plan; el archivo se guarda en la base de datos bajo RLS; los rechazos se auditan. |
| Datos personales | Exportación JSON de la organización (`org.export`) y eliminación completa con confirmación por identificador (`org.delete`, borrado en cascada). |
| Secretos | Ninguno en el repositorio. `.env` ignorado por Git. Contraseñas de `init_dev_db.sh` son solo para desarrollo local y se pueden sobrescribir por variables. |
| Frontend | React escapa todo; sin `dangerouslySetInnerHTML` ni `eval`; sin CDNs de terceros; `localStorage` solo para preferencias de interfaz; redirección tras login solo a rutas internas (sin redirección abierta). |

### Riesgos conocidos / pendientes
- Limitador de intentos en memoria → moverlo a PostgreSQL/Redis antes de ejecutar varias réplicas.
- Detrás de un proxy, configurar `uvicorn --proxy-headers --forwarded-allow-ips=…` para registrar la IP real.
- Sin verificación de correo, recuperación de contraseña ni 2FA (requieren proveedor de email).
- Producción debe servir frontend y `/api` desde el mismo dominio con HTTPS y `COOKIE_SECURE=true`.

## 2. Controles planificados por fase

### Cuentas (cuando haya proveedor de email)
- Verificación de correo y recuperación de contraseña con tokens de un solo uso y caducidad corta; 2FA (TOTP).

### Toda tabla nueva de datos de negocio (Fases 3+)
- `organization_id NOT NULL` + RLS con la misma política que las tablas actuales + prueba de aislamiento.

### Archivos subidos — pendiente
- Al exportar conjuntos a CSV (Fase 5), neutralizar inyección de fórmulas (`=`, `+`, `-`, `@`).
- Antivirus/escaneo de contenido si se aceptan más formatos en el futuro.

### Agentes de IA (Fase 4)
- Herramientas con permisos explícitos por agente; un agente de solo lectura no puede escribir.
- Sin ejecución de código arbitrario.
- Acciones consecuentes (enviar correo, modificar registros) → flujo de **aprobación humana** con **clave de
  idempotencia** para impedir ejecuciones duplicadas; todo queda en `audit_logs`.
- Contenido de archivos/correos tratado como datos, nunca como instrucciones (mitigación de *prompt injection*).
- Claves de proveedores solo en el servidor; sin clave → proveedor mock claramente identificado.

### Integraciones (Fase 6)
- OAuth oficial con alcances mínimos; tokens cifrados en reposo; secretos de cliente solo en el servidor.
- Nunca simular una conexión exitosa.

### Secretos y operación
- Variables de entorno o gestor de secretos del proveedor de hosting; nada en Git.
- Logs estructurados sin datos sensibles; registro de auditoría de acciones importantes.
- Exportación y eliminación de datos de la organización (Fase 2/8); respaldos (Fase 8).

## 3. Reporte de vulnerabilidades

Mientras no exista un canal formal, reporta problemas de seguridad de forma privada al propietario del repositorio
(no mediante issues públicos).
