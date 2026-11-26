import { AMBIENT_CYCLE_SECONDS } from '../../config/ambient';
import { EarthGlobe } from '../earth/EarthGlobe';

/**
 * Fondo ambiental: campo estelar estático + la Tierra girando al centro
 * (una rotación cada 120 s) + viñeta para mantener la legibilidad del contenido.
 */
export function AmbientBackground() {
  return (
    <div className="rc-ambient" aria-hidden="true" data-testid="ambient" data-cycle-seconds={AMBIENT_CYCLE_SECONDS}>
      <div className="rc-ambient__stars" />
      <div className="rc-ambient__stars rc-ambient__stars--far" />
      <EarthGlobe />
      <div className="rc-ambient__veil" />
    </div>
  );
}
