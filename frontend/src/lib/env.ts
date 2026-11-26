/**
 * Modo demostración: compilación sin servidor (`npm run build:demo`). La API se
 * simula dentro del navegador (src/lib/demoApi.ts) y los datos viven solo en el
 * dispositivo. Nunca se activa en la compilación normal.
 */
export const IS_DEMO = import.meta.env.VITE_DEMO_MODE === 'true';

/** Ruta pública de un recurso estático, válida con base absoluta o relativa. */
export const assetUrl = (path: string): string => `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
