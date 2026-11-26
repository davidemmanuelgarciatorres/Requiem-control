import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

type PopoverProps = {
  /** Renderiza el disparador; recibe las props ARIA que debe aplicar. */
  trigger: (props: { 'aria-expanded': boolean; 'aria-controls': string; onClick: () => void }) => ReactNode;
  title: string;
  align?: 'start' | 'end';
  /** Contenido; como función recibe `close` para cerrar el panel tras una acción. */
  children: ReactNode | ((close: () => void) => ReactNode);
};

/** Panel flotante ligero: se cierra con Escape, clic exterior o al perder el foco. */
export function Popover({ trigger, title, align = 'end', children }: PopoverProps) {
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

  return (
    <div className="rc-popover-anchor" ref={ref}>
      {trigger({ 'aria-expanded': open, 'aria-controls': id, onClick: () => setOpen((o) => !o) })}
      {open && (
        <div id={id} role="dialog" aria-label={title} className={`rc-popover rc-glass rc-glass--strong${align === 'start' ? ' rc-popover--start' : ''}`}>
          <p className="rc-popover__title">{title}</p>
          <div className="rc-popover__body">{typeof children === 'function' ? children(() => setOpen(false)) : children}</div>
        </div>
      )}
    </div>
  );
}
