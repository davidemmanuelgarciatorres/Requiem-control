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
    </aside>
  );
}
