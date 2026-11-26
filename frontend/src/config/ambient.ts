/**
 * Configuración del fondo ambiental animado.
 *
 * REQUISITO DE PRODUCTO: un ciclo completo de color dura EXACTAMENTE 120 segundos
 * y regresa a su estado original al terminar:
 *
 *   azul espacial profundo → turquesa → verde azulado (teal) → violeta profundo → azul espacial profundo
 *
 * Esta constante es la única fuente de verdad. `AmbientBackground` la inyecta
 * como la variable CSS `--ambient-cycle`, que consumen todas las animaciones de
 * `styles/ambient.css`. Para ajustar la duración en el futuro, cambia solo este valor.
 */
export const AMBIENT_CYCLE_SECONDS = 120;

/** Duración en milisegundos (útil para pruebas con la Web Animations API). */
export const AMBIENT_CYCLE_MS = AMBIENT_CYCLE_SECONDS * 1000;

export type AmbientStop = {
  id: 'space' | 'turquoise' | 'teal' | 'violet';
  /** Momento del ciclo (0–1) en que este color domina por completo. */
  at: number;
  /** Color de acento del estrato (debe coincidir con tokens.css). */
  hex: string;
};

/**
 * Secuencia documentada. El último paso (at = 1) vuelve al azul espacial,
 * por lo que la animación se repite sin saltos.
 */
export const AMBIENT_SEQUENCE: readonly AmbientStop[] = [
  { id: 'space', at: 0, hex: '#1d3f8f' },
  { id: 'turquoise', at: 0.25, hex: '#1aa6b3' },
  { id: 'teal', at: 0.5, hex: '#138f7f' },
  { id: 'violet', at: 0.75, hex: '#5b2fa6' },
  { id: 'space', at: 1, hex: '#1d3f8f' },
] as const;
