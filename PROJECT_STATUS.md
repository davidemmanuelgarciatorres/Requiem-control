# PROJECT_STATUS — REQUIEM CONTROL

Última actualización: 2026-11-27 · Estado: **código listo para lanzamiento; falta contratar hosting, correo SMTP, Stripe y revisión legal**

## ✅ Implementado y probado

### Cuentas y lanzamiento público
| Funcionalidad | Cómo se verificó |
|---|---|
| Recuperar contraseña por correo: enlace de un solo uso (1 h), solo el hash en la BD, misma respuesta exista o no la cuenta, cierra todas las sesiones | pytest + unitarias + **e2e de punta a punta** (escritorio y Pixel 7). |
| Cambiar contraseña (pide la actual, cierra las demás sesiones) y confirmar correo con reenvío | pytest + unitarias. |
| Invitaciones por correo (7 días) ligadas al correo invitado, cuentan para el límite del plan, se pueden cancelar/reenviar; registro desde la invitación sin crear otra organización | pytest + unitarias + **e2e**. |
| Envío de correo por SMTP; en desarrollo se imprime en consola; sin configurar → «no disponible» (nunca finge que envió) | pytest. **SMTP real no probado (sin proveedor contratado).** |
| Página pública de inicio con precios reales del servidor; aviso de privacidad y términos con datos `LEGAL_*` y marcadores visibles mientras falten | unitarias + e2e con axe (sin violaciones graves) en escritorio y móvil. **Plantillas legales sin revisión de abogado.** |

### Fase 8 — Facturación y producción
| Funcionalidad | Cómo se verificó |
|---|---|
| Stripe Checkout (MXN), portal, webhooks con firma v1 (rechaza firma falsa, ausente o antigua), idempotencia, upgrade/past_due/cancelación | pytest con Stripe simulado. **Sin claves reales: no se probó contra Stripe.** |
| Solo la persona propietaria administra pagos; Premium no puede volver a pagar; sin configuración → mensaje claro | pytest + unitarias. |
| Limitador de intentos compartido (claves en hash) | pytest. |
| La app no arranca en producción con configuración insegura | pytest. |
| Contenedores de producción completos | **Probado con Docker**: compilación, migraciones, página+API por el mismo dominio, CSP/HSTS, CSP sin bloqueos en Chromium real, cookie Secure, origen ajeno 403, roles sin superusuario, API sin root, worker activo. |
| Respaldo y restauración | **Probado**: mismo conteo de filas, versión de migración y RLS en 18 tablas tras restaurar. |

### Revisión general (auditoría)
- Barrido de las 69 rutas: sesión requerida, CSRF requerido, entradas basura nunca dan 500 (**encontró y corrigió** un 500 con caracteres nulos).
- Barrido de aislamiento entre empresas en las 22 rutas con identificador: sin fugas.
- axe-core en todas las pantallas (escritorio y Pixel 7): **corrigió** contraste bajo; sin errores de consola ni desbordes.
- Quitado el rectángulo azul al tocar; gramática singular/plural; encabezados de borradores saneados.

### Fase 7 — Agentes avanzados y automatizaciones
| Funcionalidad | Cómo se verificó |
|---|---|
| Inventario: hallazgos con filas de evidencia, valor, lento movimiento; lista de compra guardada SOLO al aprobar | pytest (cifras exactas) + e2e (nada en Reportes hasta aprobar). |
| Clientes: segmentos RFM con reglas explicables y fecha de referencia del archivo; lista de seguimiento aprobable | pytest. |
| Correo: clasificación; nunca a remitentes automáticos; borrador en Gmail solo tras aprobar, en el mismo hilo; jamás se envía | pytest con Gmail simulado (sin llamadas reales). |
| Automatizaciones: zona horaria, frecuencias, disparo único (SKIP LOCKED + idempotencia), errores registrados, RLS | pytest + e2e (crear, próxima ejecución, pausar). |
| Proceso de trabajo con cola en PostgreSQL; recuperación de ejecuciones interrumpidas | pytest (exclusión entre dos workers; el rol de la app sigue sin saltarse RLS). |
| Avisos técnicos solo para propietario/administrador (Configuración → Estado del sistema) | pytest (403 para miembros) + unitarias + e2e. |

### Fase 6 — Integraciones con Google
| Funcionalidad | Cómo se verificó |
|---|---|
| OAuth con PKCE S256 y `state` aleatorio de un solo uso (10 min, ligado a persona y organización; solo se guarda su hash) | pytest: reutilizar, caducado, de otra cuenta, inventado, cancelado → rechazados con código claro. |
| Permisos mínimos de solo lectura por servicio; se verifica lo concedido; autorización incremental | pytest (sin permisos de escritura en la URL; permisos no concedidos → error). |
| Tokens cifrados en reposo; nunca salen del servidor; jamás “conectado” sin intercambio real | pytest (bytes en BD no contienen el token; intercambio fallido → sigue “No conectado”). |
| Renovación automática del token; reconexión requerida con estado y último error visibles | pytest. |
| Sheets: buscar e importar por el flujo seguro (validación, vista previa, mapeo); Drive y Gmail de solo lectura (metadatos) | pytest + unitarias. |
| Desconectar: revoca en Google y borra tokens; auditoría de conexión, fallos, importación y desconexión | pytest. |
| Permiso `integrations.manage` (propietario/administrador); miembros solo leen; aislamiento entre organizaciones; plan | pytest + unitarias + e2e (sin credenciales: aviso honesto y botón deshabilitado). |
| **Sin credenciales de Google no se pudo probar contra Google real** | Todo se probó con un Google simulado (transporte HTTP). |

### Pendientes de la Fase 4 (completados)
| Funcionalidad | Cómo se verificó |
|---|---|
| Inteligencia financiera con fórmula visible por indicador, flujo acumulado, comparación elegible, categorías, observaciones, inusuales | pytest (cifras exactas, incluye un error real encontrado en e2e y corregido) + unitarias + e2e. |
| Asistente IA con partes etiquetadas (verificado/estimación/sugerencia), historial privado por persona (RLS), límite por hora, respaldo con reglas si falla el proveedor | pytest (incl. que al proveedor real solo van agregados) + unitarias + e2e. |
| Proveedor Gemini (clave en cabecera, nunca en la URL; errores controlados) | pytest con transporte simulado. **No se hizo ninguna llamada real.** |

### Imágenes flotantes (segunda ronda)
- 7 efectos nuevos estilo anime/manga/cómic, botón “Probar efecto”, carga rápida de fotos grandes (reducción única a 1024 px). Unitarias + e2e + revisión visual.

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
- Rendimiento del globo en GPUs móviles reales.
- Envío real por SMTP, Stripe con claves reales, Google con credenciales del propietario y proveedores de IA reales (todos probados con simuladores).
- Despliegue real con HTTPS y dominio propio.

## 🟠 Simulado (etiquetado en la interfaz)
- **Resúmenes de IA** cuando `AI_PROVIDER=mock`: etiquetados “Simulado · sin IA real” (los cálculos sí son reales).
- **Demostración sin servidor** (`npm run build:demo`): API simulada en el navegador con aviso permanente; no envía correos (lo dice) ni importa archivos.

## ⏳ Pendiente (requiere decisiones o contrataciones del propietario)
- Contratar hosting + dominio, proveedor SMTP con dominio verificado y activar Stripe (primero en modo de prueba).
- Completar `LEGAL_*` y revisar con un abogado el aviso de privacidad y los términos.
- Verificación de la app por Google para ofrecer Gmail a usuarios externos.
- Mejoras posteriores: 2FA, gestión de sesiones activas, selector de hoja de Excel, reportes por correo, CI (no activado sin autorización).

## Resultados de la última ejecución
```
backend:  ruff + mypy (strict)  → sin problemas
          pytest                → 166 aprobadas (PostgreSQL 16 real; correo, Google, Stripe e IA simulados)
frontend: lint + typecheck      → 0 problemas
          npm run test          → 104 aprobadas
          npm run e2e           → 101 aprobadas, 1 omitida a propósito (escritorio y Pixel 7, incluye auditoría axe)
docker:   docker-compose.prod.yml probado de punta a punta; respaldo y restauración probados
```
