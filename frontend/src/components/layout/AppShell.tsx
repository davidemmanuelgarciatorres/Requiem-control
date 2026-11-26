import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { usePreferences } from '../../app/preferences';
import { FloatersProvider } from '../../features/floaters/FloatersContext';
import { FloatersLayer } from '../../features/floaters/FloatersLayer';
import { AmbientBackground } from './AmbientBackground';
import { DemoBanner } from './DemoBanner';
import { MobileDrawer } from './MobileDrawer';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function AppShell() {
  const { t } = usePreferences();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  // Al cambiar de ruta, lleva el scroll arriba (navegación tipo SPA).
  useEffect(() => {
    window.scrollTo?.({ top: 0 });
  }, [location.pathname]);

  return (
    <FloatersProvider>
      <a className="rc-skip-link" href="#main">{t.common.skipToContent}</a>
      <AmbientBackground />
      <div className="rc-shell">
        <Sidebar />
        <div className="rc-main-col">
          <DemoBanner />
          <TopBar onOpenMenu={() => setMenuOpen(true)} menuOpen={menuOpen} />
          <main id="main" className="rc-main" tabIndex={-1}>
            <Outlet />
          </main>
        </div>
      </div>
      <MobileDrawer open={menuOpen} onClose={closeMenu} />
      <FloatersLayer />
    </FloatersProvider>
  );
}
