import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

// jsdom no implementa scrollTo; el shell lo usa al cambiar de ruta.
window.scrollTo = (() => undefined) as typeof window.scrollTo;

afterEach(() => {
  vi.unstubAllGlobals();
});

// jsdom no implementa WebGL: el globo usa su respaldo estático en las pruebas unitarias.
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
