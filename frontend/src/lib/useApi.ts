import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

export type Resource<T> = { data: T | null; error: unknown; loading: boolean; reload: () => void };

/** Carga un recurso GET de la API; `key` adicional fuerza la recarga (p. ej. al cambiar de organización). */
export function useApiResource<T>(path: string | null, key = ''): Resource<T> {
  const [result, setResult] = useState<{ id: string; data: T | null; error: unknown } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const id = `${path}|${key}|${attempt}`;

  useEffect(() => {
    if (!path) return;
    const ctrl = new AbortController();
    api<T>(path, { signal: ctrl.signal })
      .then((data) => setResult({ id, data, error: null }))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setResult({ id, data: null, error });
      });
    return () => ctrl.abort();
  }, [path, id]);

  const reload = useCallback(() => setAttempt((a) => a + 1), []);
  const current = result?.id === id ? result : null;
  return { data: current?.data ?? null, error: current?.error ?? null, loading: !!path && !current, reload };
}
