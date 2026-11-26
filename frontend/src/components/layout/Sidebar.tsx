import { usePreferences } from '../../app/preferences';
import { Brand } from './Brand';
import { NavList } from './NavList';

/** Barra lateral (tableta y escritorio). En móvil se usa MobileDrawer. */
export function Sidebar() {
  const { t } = usePreferences();
  return (
    <aside className="rc-sidebar rc-glass rc-glass--strong">
      <Brand />
      <nav aria-label={t.nav.label}>
        <NavList idPrefix="sidebar" />
      </nav>
      <div className="rc-sidebar__footer">
        <div className="rc-phase-card rc-glass rc-glass--subtle">
          <strong>{t.nav.phaseProgress}</strong>
          <div className="rc-meter" aria-hidden="true"><span style={{ width: `${(2 / 8) * 100}%` }} /></div>
          <span>{t.nav.phaseNote}</span>
        </div>
      </div>
    </aside>
  );
}
