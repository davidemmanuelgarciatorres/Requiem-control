# PROJECT_STATUS — REQUIEM CONTROL

Última actualización: 2026-11-26 · Fase actual: **5 (reportes e inteligencia) — completa, pendiente de revisión**

## ✅ Implementado y probado

### Fase 5 — Reportes e inteligencia
| Funcionalidad | Cómo se verificó |
|---|---|
| Generar reporte desde un análisis completado (instantánea; idempotente; no cambia si luego se borra el conjunto) | pytest + unitaria + e2e. |
| Solo ejecuciones completadas (fallidas → 409 explicado) | pytest. |
| Comparación con el reporte anterior del mismo agente (cifras exactas de la diferencia) | pytest + unitaria. |
| Exportación CSV de reportes y conjuntos con BOM UTF-8 y **celdas `= + - @` tab/CR neutralizadas** | pytest (fórmulas `=HYPERLINK`, `@SUM`, título malicioso) + e2e (descarga real). |
| Imprimir / Guardar como PDF: la hoja de impresión oculta fondo, barras y botones | e2e con `emulateMedia('print')` en escritorio y móvil. |
| Eliminar reporte requiere `data.write` (lector → 403); exportaciones y creación auditadas | pytest. |
| Aislamiento: reportes y exportaciones de otra organización → 404; RLS sin contexto no ve filas | pytest. |
| Panel con datos reales (último análisis, recomendaciones sin duplicados, actividad, reportes); sin datos → incorporación | pytest + 2 unitarias + e2e. |

### Imágenes flotantes (petición del propietario)
| Funcionalidad | Cómo se verificó |
|---|---|
| Máximo 3 por usuario, elegidas de galería/archivos; recorte previo; reducción automática a 256 px | pytest (4.ª → 409) + unitarias + e2e. |
| Servidor re-codifica con Pillow, elimina EXIF/ubicación, rechaza no-imágenes y archivos > 2 MB; RLS por usuario | pytest (6). |
| Tamaño ajustable con límite; color y forma del efecto de choque configurables; rebote en pared pequeño; movimiento reducido respetado | unitarias de física/efectos + e2e. |

### Fase 4 — Agentes de IA
| Funcionalidad | Cómo se verificó |
|---|---|
| Catálogo y activación por organización; **plan gratuito: máximo 2 agentes activos** y 100 ejecuciones/mes, aplicados en el servidor | pytest (límites reducidos a 1 para probar el rechazo 402). |
| Ciclo de vida explícito con marcas de tiempo; **ejecuciones fallidas registradas** con código y sin trazas internas | pytest + e2e (dataset sin roles → falla explicada). |
| **Un agente no puede usar herramientas fuera de sus permisos** (incluso si su código lo intenta) | pytest (agente de solo lectura que intenta proponer cambios → falla `agent.tool_not_allowed`, sin aprobación creada). |
| **Solicitudes duplicadas no ejecutan dos veces**: clave de idempotencia en ejecuciones; decisión de aprobación atómica | pytest (segunda aprobación → 409, filas borradas una sola vez, un solo evento de auditoría). |
| Analista de datos: recomendaciones explicables a partir de la calidad; propone eliminar duplicados (requiere aprobación) | pytest + e2e (nada cambia hasta aprobar; luego 17 → 16 filas). |
| Analista financiero: total, movimientos, ticket promedio, mediana, serie mensual, cambio entre meses, concentración, movimientos inusuales con fila de origen, limitaciones (incl. mes incompleto y cambio influido por atípicos) | pytest con cifras exactas + e2e. |
| **Proveedor simulado claramente identificado** (insignia, aviso y uso “mock”, costo 0); **sin credenciales la app no falla** y usa el simulado | pytest + unitarias + e2e. |
| Adaptador de Claude (SDK `anthropic`, `claude-opus-5-5`, esfuerzo medio, respaldo del servidor ante rechazos, manejo de errores, costo estimado) | pytest con transporte HTTP simulado: forma exacta de la petición, cálculo de costo, rechazo y límite → errores controlados. **No se hizo ninguna llamada real.** |
| Si el proveedor falla, el análisis se entrega igual sin resumen | pytest. |
| Aislamiento: ejecuciones y aprobaciones de otra organización → 404; un agente no lee datasets ajenos; RLS | pytest. |
| Interfaz: agentes en vivo, ejecutar con clave de idempotencia, seguimiento del ciclo de vida, resultados, aprobar/rechazar, aprobaciones pendientes en la barra superior | 6 unitarias + 3 e2e × escritorio y móvil. |

### Diseño móvil (corregido a partir de capturas del propietario)
- Paneles de la barra superior: en el teléfono bajan desde arriba a todo lo ancho con rastro de gotas verde neón; nunca quedan cortados. E2E a 360 px.
- Barra superior a 360 px: todos los botones dentro de la píldora. E2E a 360 px.


### Fase 3 — Importación de CSV/XLSX
| Funcionalidad | Cómo se verificó |
|---|---|
| Validación por **contenido** (no por nombre ni MIME): CSV de texto, paquete XLSX real; extensión coherente | pytest: PDF, XLSX falso, binario, ZIP que no es libro, .xls/cifrado, archivo truncado → rechazados con código claro. E2E: XLSX disfrazado rechazado en la UI. |
| Sin macros ni fórmulas: `.xlsm` y libros con `vbaProject.bin` (aunque se renombren) rechazados; XLSX leído en modo solo-valores | pytest (libro con macro renombrado a .xlsx; fórmula sin valor guardado → celda vacía). |
| Anti zip-bomb, límites de tamaño, filas y columnas, y de almacenamiento del plan | pytest (bomba 20 MB → rechazada; límites de filas/columnas; plan sin espacio → 402). |
| Lectura: separador (`,` `;` tab `\|`) y codificación (UTF-8, BOM, Windows-1252) detectados; encabezados duplicados/vacíos normalizados; filas vacías omitidas | pytest. |
| Tipos con formatos de México: `$1,234.50`, `1.234,50`, `(1,000.00)`, `15%`, `dd/mm/aaaa`; montos con centavos = número | pytest (incluye un error real encontrado al revisar capturas y corregido). |
| Hallazgos explicables: faltantes, duplicados, tipos inconsistentes, atípicos, columnas vacías, filas con celdas de más — con filas de evidencia, por qué importa y qué hacer | pytest (filas exactas) + unitarias + e2e. |
| Mapeo de columnas (renombrar, tipo, rol, excluir) validado en servidor; conversión con conteo de fallos por columna; trazabilidad a la fila del archivo | pytest + e2e. |
| Historial, archivos pendientes, descartar, eliminar (libera almacenamiento), aviso de archivo duplicado | pytest + unitarias. |
| Permisos `data.read`/`data.write`, CSRF en la subida multipart, auditoría (incl. rechazos), **aislamiento por organización** en API y RLS | pytest. |
| Interfaz: arrastrar/elegir archivo, revisión, mapeo, reporte, filas paginadas; móvil sin desbordamiento | 6 unitarias nuevas + 2 e2e × escritorio y móvil. |


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

### Dirección visual “espacio” (actualizada a petición del propietario)
| Funcionalidad | Cómo se verificó |
|---|---|
| Fondo: **la Tierra girando al centro** (WebGL2), una vuelta cada **120 s exactos**, todos los continentes pasan por la vista | Unitarias (periodicidad, las 36 franjas de longitud pasan por el centro). E2E en Chromium con reloj controlado: el fotograma a t y t+120 s es idéntico píxel a píxel; a t+30 s es distinto. |
| **Luces de ciudad solo de noche**: el lado iluminado no las muestra; el nocturno sí | Unitaria (`nightFactor`: 0 de día, 1 de noche, transición gradual). E2E: análisis de píxeles del lienzo (lado de día brillante; lado de noche oscuro con >40 puntos de luz cálida). Revisión visual de capturas. |
| Movimiento reducido (SO y preferencia en la app) → fotograma fijo | E2E: dos fotogramas a 30 s de distancia son idénticos. |
| Respaldo sin WebGL | Unitaria (jsdom sin WebGL → `data-status="fallback"`). |
| Rediseño estilo misión espacial / editorial: negro espacial, vidrio translúcido, acción principal blanca, acento menta, tono cálido solar; barra lateral y superior flotantes; portada “CONTROLA. ANALIZA. DECIDE.” con estado del sistema en vivo e indicadores **reales** (organizaciones, miembros/límite, agentes activos/límite); acceso con titular editorial | Unitarias + e2e de navegación y sin desbordamiento horizontal en 7 rutas × escritorio y móvil; capturas revisadas. |

### Fase 1 — Fundamento visual (sigue vigente)
Shell responsivo, búsqueda de módulos, idiomas es/en, panel con onboarding y demo etiquetada, estados de carga/vacío/error. El ciclo de color de 120 s original se sustituyó por la rotación terrestre de 120 s.

## 🟡 Implementado pero no probado automáticamente
- Navegadores distintos de Chromium (Safari/iOS, Firefox).
- Respaldo de vidrio sin `backdrop-filter`.
- Rendimiento del globo en GPUs móviles reales (solo se probó con el renderizador por software de Chromium).
- Auditoría automática de contraste/accesibilidad (axe/Lighthouse) no ejecutada.
- Despliegue real con HTTPS (`COOKIE_SECURE=true`) y detrás de un proxy (IP real del cliente).

## 🟠 Simulado (etiquetado en la interfaz)
- **Resúmenes de los agentes**: plantilla del proveedor simulado (los cálculos sí son reales). Etiquetados “Simulado · sin IA real”.
- **Demostración sin servidor** (`npm run build:demo`, publicada para el teléfono): API simulada en el navegador con aviso permanente; no hay importación de archivos en esa versión.
- Cifras de `/?view=demo` (ficticias, `demoData.ts`).
- Botones de agentes, aprobaciones e integraciones: deshabilitados con la fase en que llegan.
- Uso en el plan (`active_agents`, `monthly_executions`, `storage_mb`) se reporta como 0 porque esas funciones aún no existen.

## ⏳ Pendiente
- Invitaciones por correo (requiere un proveedor de email; hoy solo se agregan usuarios ya registrados).
- Recuperación de contraseña y verificación de correo (requieren envío de email).
- 2FA y gestión de sesiones activas.
- Limitador de intentos compartido entre réplicas (hoy en memoria por proceso).
- Ingesta: worker en segundo plano para archivos grandes, selector de hoja en la UI, importación en la demo sin servidor.
- Agentes: worker separado, asistente conversacional, proveedor de IA real (requiere tu credencial y autorización de gasto).
- Fases 6–8: integraciones, agentes avanzados, facturación. Reportes programados/por correo y PDF de servidor.
- CI (GitHub Actions) — propuesto, no activado sin autorización.

## Resultados de la última ejecución
```
backend:  ruff check .          → sin problemas
          mypy app (strict)     → sin errores (38 archivos)
          pytest                → 98 aprobadas (PostgreSQL 16 real)
frontend: npm run lint          → 0 problemas
          npm run typecheck     → 0 errores
          npm run test          → 11 archivos, 65 aprobadas
          npm run build         → OK (la API simulada de la demo no se incluye)
          npm run e2e           → 67 aprobadas, 1 omitida a propósito (skip-link solo en escritorio)
                                   (API FastAPI + PostgreSQL reales; escritorio 1440×900 y Pixel 7)
```
