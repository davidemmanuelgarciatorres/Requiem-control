/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// La API (FastAPI) corre aparte; Vite la expone en el mismo origen bajo /api
// para que la cookie de sesión sea de primera parte (SameSite) sin CORS.
const API_TARGET = process.env.API_PROXY_TARGET ?? 'http://localhost:8000';
const proxy = { '/api': { target: API_TARGET, changeOrigin: false } };

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy },
  preview: { port: 4173, proxy },
  build: {
    sourcemap: false,
    target: 'es2022',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
