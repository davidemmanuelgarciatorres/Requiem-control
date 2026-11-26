import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { usePreferences } from '../../app/preferences';

type PopoverProps = {
  /** Renderiza el disparador; recibe las props ARIA que debe aplicar. */
  trigger: (props: { 'aria-expanded': boolean; 'aria-controls': string; onClick: () => void }) => ReactNode;
  title: string;
  align?: 'start' | 'end';
  /** Contenido; como función recibe `close` para cerrar el panel tras una acción. */
  children: ReactNode | ((close: () => void) => ReactNode);
};

/**
 * Gotas de pintura verde neón que escurren del borde inferior del panel al abrirlo.
 * Posición (%), ancho y largo (px) y retraso (ms) fijos: el efecto es siempre el mismo.
 */
const DRIPS: [number, number, number, number][] = [
  [8, 6, 22, 40], [19, 9, 38, 0], [31, 5, 16, 120], [46, 11, 46, 60], [58, 6, 24, 180], [71, 8, 34, 30], [84, 5, 18, 140], [93, 7, 28, 90],
];

/**
 * Panel flotante: se cierra con Escape, con el botón de cerrar o tocando fuera.
 * En escritorio se despliega bajo su botón; en el teléfono baja desde arriba a lo
 * ancho de la pantalla (para que nunca quede cortado) dejando un rastro de gotas.
 */
export function Popover({ trigger, title, align = 'end', children }: PopoverProps) {
  const { t } = usePreferences();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div className="rc-popover-anchor" ref={ref}>
      {trigger({ 'aria-expanded': open, 'aria-controls': id, onClick: () => setOpen((o) => !o) })}
      {open && (
        <div id={id} role="dialog" aria-label={title} className={`rc-popover${align === 'start' ? ' rc-popover--start' : ''}`}>
          <div className="rc-popover__panel rc-glass rc-glass--strong">
            <div className="rc-popover__head">
              <p className="rc-popover__title">{title}</p>
              <button type="button" className="rc-popover__close" onClick={close} aria-label={t.common.close}>
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="rc-popover__body">{typeof children === 'function' ? children(close) : children}</div>
          </div>
          <span className="rc-drips" aria-hidden="true">
            {DRIPS.map(([x, w, h, delay]) => (
              <i key={x} style={{ '--x': `${x}%`, '--w': `${w}px`, '--h': `${h}px`, '--delay': `${delay}ms` } as CSSProperties} />
            ))}
          </span>
        </div>
      )}
    </div>
  );
}
