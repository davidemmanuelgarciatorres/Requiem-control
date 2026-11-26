import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

// jsdom no implementa scrollTo; el shell lo usa al cambiar de ruta.
window.scrollTo = (() => undefined) as typeof window.scrollTo;
