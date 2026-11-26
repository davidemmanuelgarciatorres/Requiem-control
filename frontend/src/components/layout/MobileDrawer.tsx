import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { usePreferences } from '../../app/preferences';
import { Brand } from './Brand';
import { NavList } from './NavList';
import { OrgSwitcher } from './OrgSwitcher';

/** Cajón de navegación para móvil: modal, cierra con Escape o al tocar fuera. */
export function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = usePreferences();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      <div className="rc-drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <div id="mobile-drawer" className="rc-drawer rc-glass rc-glass--strong" role="dialog" aria-modal="true" aria-label={t.nav.label}>
        <div className="rc-drawer__head">
          <Brand />
          <button ref={closeRef} type="button" className="rc-icon-btn" onClick={onClose} aria-label={t.nav.closeMenu}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <OrgSwitcher className="rc-org-btn rc-org-btn--block" />
        <nav aria-label={t.nav.label}>
          <NavList idPrefix="drawer" onNavigate={onClose} />
        </nav>
      </div>
    </>
  );
}
