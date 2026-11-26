import type { CSSProperties } from 'react';
import { AMBIENT_CYCLE_SECONDS } from '../../config/ambient';

/**
 * Fondo ambiental. Inyecta la duración del ciclo (120 s) como variable CSS;
 * toda la animación ocurre en CSS (ver styles/ambient.css). Sin JavaScript por cuadro.
 */
export function AmbientBackground() {
  const style = { '--ambient-cycle': `${AMBIENT_CYCLE_SECONDS}s` } as CSSProperties;
  return (
    <div className="rc-ambient" style={style} aria-hidden="true" data-testid="ambient" data-cycle-seconds={AMBIENT_CYCLE_SECONDS}>
      <div className="rc-ambient__layer rc-ambient__layer--space" data-layer="space" />
      <div className="rc-ambient__layer rc-ambient__layer--turquoise" data-layer="turquoise" />
      <div className="rc-ambient__layer rc-ambient__layer--teal" data-layer="teal" />
      <div className="rc-ambient__layer rc-ambient__layer--violet" data-layer="violet" />
      <div className="rc-ambient__orb rc-ambient__orb--a" />
      <div className="rc-ambient__orb rc-ambient__orb--b" />
      <div className="rc-ambient__stars" />
      <div className="rc-ambient__veil" />
    </div>
  );
}
