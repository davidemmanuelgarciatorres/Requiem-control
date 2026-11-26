# PROJECT_AUDIT — REQUIEM CONTROL

Fecha de auditoría: 2026-11-26 · Rama: `claude/requiem-control-spec-f0630a`

## 1. Estado encontrado del repositorio

| Aspecto | Hallazgo |
|---|---|
| Commits | **Ninguno.** El repositorio estaba recién inicializado (`No commits yet`). |
| Ramas remotas | Ninguna (`git ls-remote origin` vacío). |
| Archivos | Ninguno (ni README, ni código, ni configuración). |
| Framework / lenguajes | No existía ninguno. |
| Frontend / backend | No existían. |
| Base de datos / migraciones | No existían. |
| Autenticación / APIs | No existían. |
| Sistema de diseño / componentes | No existían. |
| Dependencias | Ninguna declarada. |
| Despliegue / CI | Sin configuración. |
| Variables de entorno / secretos | Ninguno (no había secretos expuestos). |
| Integraciones | Ninguna. |
| Deuda técnica | Ninguna heredada. |
| Debilidades de seguridad | Ninguna heredada (no había superficie de ataque). |

**Conclusión:** proyecto *greenfield*. No había código que preservar, así que no se eliminó ni reescribió nada.
No se encontró ningún bloqueador para la Fase 1.

## 2. Herramientas disponibles en el entorno de desarrollo

Node.js 22, npm 10, Python 3.13 (con pandas, numpy, pydantic, openpyxl, pytest), cliente PostgreSQL 16,
Chromium + Playwright. Esto confirma que el stack preferido (Python + TypeScript + PostgreSQL) es viable localmente
y sin costo.

## 3. Decisión de stack

El stack preferido por la especificación **encaja** con un proyecto nuevo. Decisiones:

| Capa | Elección | Por qué | Costo |
|---|---|---|---|
| Frontend | **React 19 + TypeScript (estricto) + Vite 8** | SPA de panel muy interactiva; ecosistema maduro; build estático que se aloja gratis. Vite es rápido y simple. | Gratis (MIT). |
| Enrutamiento | **react-router-dom 7** | Estándar de facto para SPA; soporta rutas anidadas del shell. | Gratis. |
| Iconos | **lucide-react** | Consistentes, accesibles, *tree-shaken* (solo se empaquetan los usados). Evita dibujar ~40 iconos a mano. | Gratis (ISC). |
| Tipografía | **Inter Variable autoalojada** (`@fontsource-variable/inter`) | Legible, moderna; autoalojada para no depender de CDNs de terceros ni filtrar visitas. | Gratis (OFL). |
| Gráficas | **SVG propio** (sin librería) | Las gráficas de la Fase 1 son simples; una librería (≈100 kB) no se justifica todavía. Se reevaluará en la Fase 5. | — |
| i18n | **Diccionarios tipados propios** (es/en) | Dos idiomas, sin pluralización compleja: no justifica i18next. TypeScript garantiza que ambos diccionarios tienen las mismas claves. | — |
| Estilos | **CSS plano con tokens** (variables CSS) | Sin runtime ni dependencia extra; los tokens permiten ajustar el sistema de diseño en un solo lugar. | — |
| Pruebas | **Vitest + Testing Library** (unitarias) y **Playwright** (e2e) | Integración nativa con Vite; Playwright ya estaba instalado en el entorno. | Gratis. |
| Calidad | **ESLint 10 + typescript-eslint + react-hooks** | Lint estricto. | Gratis. |
| Servicio de IA y datos (Fase 3–4) | **Python + FastAPI + Pydantic + Pandas + OpenPyXL** | Según la especificación; el ecosistema de datos de Python es el adecuado. | Gratis. |
| Base de datos (Fase 2) | **PostgreSQL** (+ migraciones, RLS para multi-tenant) | Modelado relacional, restricciones, JSONB donde sea legítimo, Row-Level Security. | Gratis en local; ver costos. |

**Sin cambios arquitectónicos respecto a la especificación.** Una decisión abierta para la Fase 2 (ver
IMPLEMENTATION_PLAN.md): si la API de aplicación (auth, organizaciones, planes) vive en el mismo servicio FastAPI
que la IA (monolito modular, recomendado) o en un servicio Node separado. Se recomienda **un solo backend Python
modular** para no duplicar lógica ni operar dos runtimes.

No se introdujeron Java, C++, Go ni Rust.

## 4. Análisis de las referencias visuales

> Nota: las imágenes adjuntas llegaron en un orden distinto al descrito en la especificación. Se interpretaron por
> su contenido, no por su posición.

| Imagen adjunta | Rol asignado | Qué se tomó |
|---|---|---|
| Fotografía espacial (pilares nebulosos sobre azul profundo con estrellas) | **Fondo ambiental** | Atmósfera azul profunda, profundidad, iluminación suave; campo estelar estático muy tenue; transición hacia turquesa/teal/violeta. |
| Composición “ICE / LEND” (panel de vidrio esmerilado sobre paisaje) | **Composición cinematográfica** | Tipografía grande y delgada con espaciado amplio (marca de agua “REQUIEM CONTROL” en el héroe), capas translúcidas, numeración editorial `01 / 02 / 03` en el onboarding, jerarquía limpia. |
| Panel oscuro “Pulse” con acento lima | **Estructura de dashboard** | Barra lateral con ítem activo lima, tarjeta KPI destacada en lima con anillo de progreso y anillos concéntricos, tarjetas de agentes con estado, eventos recientes, mapa de calor de actividad, sparklines. |

No se incrustó ninguna captura en la aplicación; todo el diseño es original y se construyó con tokens propios.

### Cambio de dirección visual (solicitado por el propietario)
Nuevas referencias: fotografía de la Tierra con el sol en el limbo, portada editorial “Imagining beyond reality”
(tipografía ligera, acento cálido) y panel “NOVA” de misiones espaciales (titulares en mayúsculas ligeras, botón
blanco, acento verde pálido, estado “NOMINAL”, columna de indicadores, vidrio oscuro). Se adoptó: fondo con la
Tierra girando al centro y luces de ciudad en el lado nocturno; acento menta en lugar de lima; acción principal
blanca; tono cálido solar para acentos editoriales; paneles flotantes. Las texturas son imágenes de la NASA (ver
`frontend/public/earth/CREDITS.md`).

## 5. Riesgos identificados

1. **Costo de IA en producción**: la suscripción de Claude Code **no** cubre el uso de la API desde la aplicación.
   Cualquier proveedor real requerirá una clave y presupuesto propios (Fase 4, con autorización).
2. **Multi-tenant**: el aislamiento entre organizaciones es el requisito de seguridad más crítico; debe probarse
   desde la Fase 2 (incluido RLS).
3. **Archivos subidos**: XLSX/CSV son vector de ataque (bombas zip, fórmulas, macros); ver SECURITY.md.
4. **Alcance**: la especificación es muy amplia; se mantiene el desarrollo por fases para no acumular módulos a medias.
