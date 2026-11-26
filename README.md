# REQUIEM CONTROL

Plataforma SaaS de inteligencia de negocio y automatización de operaciones con agentes de IA.

> **Estado actual: Fase 1 — fundamento visual.** Existe la interfaz web (diseño, navegación, panel, estados).
> No hay backend, base de datos, autenticación, procesamiento de archivos ni agentes de IA todavía.
> Toda cifra visible en la “vista de demostración” es ficticia y está etiquetada como tal.

## Documentación

| Documento | Contenido |
|---|---|
| [PROJECT_AUDIT.md](PROJECT_AUDIT.md) | Estado real del repositorio y decisiones de stack |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | Fases de desarrollo, riesgos y costos |
| [PROJECT_STATUS.md](PROJECT_STATUS.md) | Qué está implementado, probado, simulado o pendiente |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Estructura de la aplicación y comunicación entre servicios |
| [SECURITY.md](SECURITY.md) | Autenticación, autorización, datos, secretos y salvaguardas |

## Desarrollo local (frontend)

Requisitos: Node.js ≥ 20.

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
npm run check        # lint + typecheck + pruebas unitarias + build
npm run build && npm run e2e   # pruebas end-to-end (Playwright, Chromium)
```

Rutas útiles: `/` (onboarding), `/?view=demo` (vista de demostración), `/design-system`.
