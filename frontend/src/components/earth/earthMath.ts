import { AMBIENT_CYCLE_MS } from '../../config/ambient';

const TAU = Math.PI * 2;

/**
 * Ángulo de rotación (radianes, 0–2π) en el instante `ms` (reloj de pared).
 * Periódico con periodo exacto AMBIENT_CYCLE_MS: rotationAt(t) === rotationAt(t + 120 000).
 * Usar el reloj de pared hace que el globo esté en la misma posición en todas las pestañas.
 */
export function rotationAt(ms: number, periodMs = AMBIENT_CYCLE_MS): number {
  const phase = (((ms % periodMs) + periodMs) % periodMs) / periodMs;
  return phase * TAU;
}

/** Longitud (grados, −180…180) que queda en el centro de la vista con una rotación dada. */
export function centerLongitude(rotation: number): number {
  const deg = (-rotation * 180) / Math.PI;
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

/**
 * Factor de noche (0 = pleno día, 1 = noche cerrada) según el coseno del ángulo
 * con el sol. Debe coincidir con `nightFactor` del shader.
 */
export function nightFactor(cosSun: number): number {
  return smoothstep(0.08, -0.22, cosSun);
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
