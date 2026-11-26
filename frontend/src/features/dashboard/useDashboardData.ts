import { useCallback, useEffect, useState } from 'react';
import type { Language } from '../../app/preferences';
import { buildDemoDashboard, type DemoDashboard } from './demoData';

export type DashboardState =
  | { status: 'empty' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: DemoDashboard };

export type DashboardLoader = (lang: Language) => Promise<DemoDashboard>;

/** Cargador de demostración: simula latencia para ejercitar el estado de carga. */
export const loadDemoDashboard: DashboardLoader = (lang) =>
  new Promise((resolve) => setTimeout(() => resolve(buildDemoDashboard(lang)), 450));

/**
 * Fase 1: no hay API ni datos reales, así que el estado por defecto es `empty`
 * (onboarding). Solo con `demo = true` se cargan datos ficticios etiquetados.
 * En la Fase 2+ este hook consultará la API de la organización activa.
 */
export function useDashboardData(demo: boolean, lang: Language, loader: DashboardLoader = loadDemoDashboard) {
  const [attempt, setAttempt] = useState(0);
  const requestKey = `${lang}:${attempt}`;
  // Resultado de la última petición, asociado a su clave; el estado visible se deriva.
  const [result, setResult] = useState<{ key: string; outcome: { status: 'ready'; data: DemoDashboard } | { status: 'error' } } | null>(null);

  useEffect(() => {
    if (!demo) return;
    let cancelled = false;
    loader(lang)
      .then((data) => !cancelled && setResult({ key: requestKey, outcome: { status: 'ready', data } }))
      .catch(() => !cancelled && setResult({ key: requestKey, outcome: { status: 'error' } }));
    return () => {
      cancelled = true;
    };
  }, [demo, lang, loader, requestKey]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  let state: DashboardState;
  if (!demo) state = { status: 'empty' };
  else if (!result || result.key !== requestKey) state = { status: 'loading' };
  else state = result.outcome;
  return { state, retry };
}
