# PROJECT_STATUS — REQUIEM CONTROL

Última actualización: 2026-11-26 · Fase actual: **1 (fundamento visual) — completa, pendiente de revisión**

## ✅ Implementado y probado

| Funcionalidad | Cómo se verificó |
|---|---|
| Fondo ambiental animado, ciclo **exacto de 120 s** (azul espacial → turquesa → teal → violeta → azul espacial) | Unitaria: constante = 120, variable CSS inyectada, fotogramas de cada estrato. E2E (Chromium real): las 5 animaciones duran 120 000 ms e iteran infinito; opacidades en t = 0/30/60/90/105/120 s; el estado en 120 s es idéntico al de 0 s. |
| Movimiento reducido (preferencia del SO y preferencia en la app) | E2E con `reducedMotion: 'reduce'` → 0 animaciones ambientales; E2E desde Configuración; unitaria del atributo `data-motion`. |
| Shell responsivo: barra lateral (≥1200 px), riel de iconos (768–1199 px), cajón móvil (<768 px) | E2E: sin desbordamiento horizontal en 7 rutas × escritorio (1440×900) y móvil (Pixel 7); navegación por cajón en móvil y por barra lateral en escritorio. Capturas revisadas también a 900 px y 390 px. |
| Cajón móvil accesible (foco inicial, Escape, cierre al navegar) | Unitaria. |
| Búsqueda de módulos (combobox con teclado) | Unitaria (filtrar, Enter navega, sin resultados). |
| Cambio de idioma es/en (persistido, actualiza `<html lang>`) | Unitaria; paridad de claves es/en verificada. |
| Panel: estado vacío/onboarding por defecto (sin métricas inventadas) | Unitaria: 0 insignias DEMO, onboarding y estado del sistema visibles. |
| Panel: vista de demostración con aviso y insignia DEMO en cada panel | Unitaria y E2E (≥9 insignias, sin errores de consola). |
| Estados de carga (esqueleto), error (con reintento funcional) y vacío | Unitaria (cargador que falla y luego funciona). |
| KPIs de demo derivados de las series (no escritos a mano) | Unitaria. |
| Páginas honestas: módulos planificados, agentes (activación deshabilitada), integraciones (todas “No conectado”), configuración, sistema de diseño, 404 | Unitarias; todas las rutas renderizan. |
| Enlace “Saltar al contenido” | E2E (escritorio). |
| Lint, typecheck estricto, build de producción | `npm run check` sin errores ni advertencias. |

## 🟡 Implementado pero no probado automáticamente
- Respaldo de vidrio sin `backdrop-filter` (`@supports not (...)`): implementado en `tokens.css`, no probado en un navegador sin soporte.
- Navegadores distintos de Chromium (Safari/iOS, Firefox): no se ejecutaron pruebas; solo Chromium está disponible en el entorno.
- Tooltip con teclado (flechas) en la gráfica de ingresos: implementado, sin prueba automatizada.
- Contraste de color: elegido para cumplir AA en texto principal y secundario; no se ejecutó una auditoría automática (axe/Lighthouse).

## 🟠 Simulado (etiquetado como tal en la interfaz)
- **Todas las cifras de `/?view=demo`** (ingresos, gastos, margen, calidad de datos, agentes, eventos, aprobaciones, recomendaciones, mapa de actividad). Fuente: `frontend/src/features/dashboard/demoData.ts`. Latencia de carga simulada (450 ms).
- Botones “Ver análisis”, “Revisar”, “Activar”, “Conectar”: **deshabilitados** con explicación de la fase en que llegan.

## ⏳ Pendiente
- Backend, API, base de datos, migraciones (Fase 2).
- Autenticación, organizaciones, roles, permisos, aislamiento multi-tenant (Fase 2).
- Subida y procesamiento de CSV/XLSX (Fase 3).
- Proveedores de IA, agentes, ejecuciones, aprobaciones, límites de plan (Fase 4).
- Reportes reales y exportación (Fase 5) · Integraciones OAuth (Fase 6) · Agentes avanzados (Fase 7) · Facturación y producción (Fase 8).
- CI (GitHub Actions) — propuesto, no activado sin autorización.

## Resultados de la última ejecución
```
npm run lint        → 0 problemas
npm run typecheck   → 0 errores
npm run test        → 5 archivos, 26 pruebas, 26 aprobadas
npm run build       → OK (JS 342 kB / 108 kB gzip; CSS 36 kB / 8 kB gzip)
npm run e2e         → 27 aprobadas, 1 omitida a propósito (skip-link solo en escritorio)
```
