/**
 * Fondo ambiental: la Tierra girando.
 *
 * Una rotación completa dura EXACTAMENTE `AMBIENT_CYCLE_SECONDS` (120 s): el globo
 * vuelve a su estado original al terminar cada ciclo. El sol está fijo (arriba a la
 * derecha), así que cada continente pasa por el día —sin luces— y por la noche —con
 * las luces de sus ciudades encendidas—.
 *
 * Esta constante es la única fuente de verdad para la duración.
 */
export const AMBIENT_CYCLE_SECONDS = 120;
export const AMBIENT_CYCLE_MS = AMBIENT_CYCLE_SECONDS * 1000;

/** Inclinación del eje terrestre (23.44°) y del polo norte hacia el observador. */
export const EARTH_AXIAL_TILT_RAD = (23.44 * Math.PI) / 180;
export const EARTH_VIEW_PITCH_RAD = (18 * Math.PI) / 180;

/** Dirección hacia el sol en el espacio de la vista (x → derecha, y → arriba, z → observador). */
export const SUN_DIRECTION: readonly [number, number, number] = normalize([0.9, 0.34, 0.16]);

/** Fotogramas por segundo máximos: la rotación es lenta (3°/s), 30 fps es suficiente. */
export const EARTH_MAX_FPS = 30;

function normalize(v: [number, number, number]): [number, number, number] {
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
}
