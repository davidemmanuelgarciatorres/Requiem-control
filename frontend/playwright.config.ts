import { defineConfig, devices } from '@playwright/test';

/**
 * Pruebas end-to-end: build de producción (vite preview, con proxy /api) + API real
 * (FastAPI) sobre una base de datos PostgreSQL dedicada `requiem_control_e2e`.
 * Requisitos: backend/.venv instalado y la base migrada (ver README).
 * Ejecutar: npm run build && npm run e2e
 */
const E2E_DB = process.env.E2E_DATABASE_URL ?? 'postgresql+psycopg://requiem_app:requiem_app_dev@localhost:5432/requiem_control_e2e';
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'off',
    locale: 'es-MX',
  },
  webServer: [
    {
      command: '.venv/bin/uvicorn app.main:app --port 8000',
      cwd: '../backend',
      url: 'http://localhost:8000/api/health',
      reuseExistingServer: false,
      timeout: 60_000,
      // Límite de intentos alto: las pruebas registran muchas cuentas desde la misma IP.
      env: { DATABASE_URL: E2E_DB, ENVIRONMENT: 'test', LOGIN_RATE_LIMIT: '10000' },
    },
    {
      command: 'npm run preview',
      url: 'http://localhost:4173',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
