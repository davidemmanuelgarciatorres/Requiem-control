# SECURITY — REQUIEM CONTROL

## 1. Superficie actual (Fase 1)

La aplicación es **solo un frontend estático**. No hay backend, base de datos, autenticación, carga de archivos,
claves ni llamadas a servicios externos.

| Aspecto | Estado en Fase 1 |
|---|---|
| Secretos | Ninguno. `.env` y `.env.*` están en `.gitignore`; `.env.example` no contiene valores. |
| Datos de negocio | Ninguno. Los datos de demo son ficticios y viven en el código fuente. |
| Almacenamiento del navegador | Solo preferencias de interfaz (`rc.lang`, `rc.motion`) en `localStorage`, con `try/catch`. Nunca datos de negocio ni tokens. |
| XSS | React escapa todo el contenido; no se usa `dangerouslySetInnerHTML` ni `eval`. |
| Dependencias de terceros en tiempo de ejecución | Ninguna CDN: fuentes e iconos se empaquetan localmente. `npm audit`: 0 vulnerabilidades al instalar. |
| Simulación | Toda funcionalidad no implementada aparece deshabilitada o marcada como “Demo”/“Fase N”. Ninguna integración se muestra como conectada. |

## 2. Controles planificados por fase

### Autenticación y sesiones (Fase 2)
- Contraseñas con **Argon2id**; política de longitud mínima; bloqueo progresivo/límite de intentos.
- Sesión en cookie `HttpOnly; Secure; SameSite=Lax`, rotación al iniciar sesión, expiración e invalidación en servidor.
- **CSRF**: token sincronizado o doble cookie para peticiones que cambian estado.
- Verificación de correo y recuperación de contraseña con tokens de un solo uso y caducidad corta.

### Autorización y multi-tenant (Fase 2)
- Todo registro propiedad de una organización lleva `organization_id NOT NULL` con clave foránea.
- El servidor resuelve la organización activa desde la sesión y la membresía — **nunca** desde un parámetro del cliente sin verificar.
- Doble barrera: filtrado en la capa de repositorio + **PostgreSQL Row-Level Security** (`SET app.current_org`).
- Roles y permisos verificados en cada endpoint; límites de plan (p. ej. 2 agentes en plan gratuito) aplicados **en el servidor**.
- Pruebas obligatorias: la organización A no puede leer, listar, modificar ni inferir datos de la B.

### Validación de API
- Pydantic en cada entrada/salida; consultas parametrizadas (SQLAlchemy) — sin SQL concatenado.
- Limitación de tasa por usuario/IP/organización; tamaños máximos de cuerpo.
- Errores al usuario sin trazas internas ni fragmentos de datasets; detalle solo en logs del servidor.

### Archivos subidos (Fase 3)
- Límite de tamaño y de filas/columnas; verificación por *magic bytes*, no por nombre ni MIME del cliente.
- XLSX: protección contra bombas zip (límite de tamaño descomprimido), OpenPyXL `read_only=True, data_only=True`;
  **nunca** se ejecutan macros (`.xlsm` rechazado por defecto) ni se evalúan fórmulas.
- CSV: neutralizar inyección de fórmulas (`=`, `+`, `-`, `@`) al re-exportar.
- Almacenamiento temporal fuera del directorio web, nombres aleatorios, borrado tras procesar, propiedad por organización.

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
