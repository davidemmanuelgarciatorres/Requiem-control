/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// La API (FastAPI) corre aparte; Vite la expone en el mismo origen bajo /api
// para que la cookie de sesión sea de primera parte (SameSite) sin CORS.
const API_TARGET = process.env.API_PROXY_TARGET ?? 'http://localhost:8000';
const proxy = { '/api': { target: API_TARGET, changeOrigin: false } };

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  // La demo se publica bajo una ruta desconocida: rutas relativas.
  base: mode === 'demo' ? './' : '/',
  plugins: [react()],
  // Constante de compilación: permite eliminar por completo el código de la demo en producción.
  define: { __DEMO__: JSON.stringify(mode === 'demo') },
  // En GitHub Codespaces la página se abre por un dominio *.app.github.dev (con HTTPS en el puerto 443).
  server: process.env.CODESPACES
    ? { port: 5173, proxy, allowedHosts: ['.app.github.dev'], hmr: { clientPort: 443 } }
    : { port: 5173, proxy },
  preview: { port: 4173, proxy },
  build: {
    outDir: mode === 'demo' ? 'dist-demo' : 'dist',
    sourcemap: false,
    target: 'es2022',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
}));
