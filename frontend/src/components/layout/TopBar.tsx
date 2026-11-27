import { Bell, CircleUser, LogOut, Menu } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/auth';
import { Button } from '../ui/Button';
import { ApprovalsMenu } from './ApprovalsMenu';
import { OrgSwitcher } from './OrgSwitcher';
import { LANGUAGES, usePreferences } from '../../app/preferences';
import { Popover } from '../ui/Popover';
import { GlobalSearch } from './GlobalSearch';
import { LogoMark } from './LogoMark';

export function TopBar({ onOpenMenu, menuOpen }: { onOpenMenu: () => void; menuOpen: boolean }) {
  const { t, lang, setLang } = usePreferences();
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <header className="rc-topbar rc-glass rc-glass--strong">
      <button
        type="button"
        className="rc-icon-btn rc-topbar__menu"
        onClick={onOpenMenu}
        aria-label={t.nav.openMenu}
        aria-expanded={menuOpen}
        aria-controls="mobile-drawer"
      >
        <Menu size={18} aria-hidden="true" />
      </button>
      <span className="rc-topbar__brand">
        <LogoMark size={30} />
        <span>REQUIEM</span>
      </span>

      <OrgSwitcher />

      <GlobalSearch />
      <span className="rc-topbar__spacer" />

      <div className="rc-topbar__group">
        <div className="rc-segmented rc-topbar__lang" role="group" aria-label={t.settings.language}>
          {LANGUAGES.map((l) => (
            <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)} lang={l} style={{ minHeight: 28, padding: '0 10px', fontSize: '0.75rem' }}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>

        <ApprovalsMenu />

        <Popover
          title={t.topbar.notifications}
          trigger={(p) => (
            <button type="button" className="rc-icon-btn" aria-label={`${t.topbar.notifications}: 0`} {...p}>
              <Bell size={18} aria-hidden="true" />
            </button>
          )}
        >
          <p>{t.topbar.notificationsEmpty}</p>
          <p className="rc-popover__hint">{t.topbar.notificationsHint}</p>
        </Popover>

        <Popover
          title={t.topbar.profile}
          trigger={(p) => (
            <button type="button" className="rc-avatar-btn" aria-label={t.topbar.profile} {...p}>
              <CircleUser size={20} aria-hidden="true" />
            </button>
          )}
        >
          <p className="rc-popover__hint">{t.auth.signedInAs}</p>
          <p><strong>{session?.user.full_name}</strong><br />{session?.user.email}</p>
          {session?.role && <p className="rc-popover__hint">{t.org.roles[session.role]} · {session.active_organization?.name}</p>}
          <Button variant="glass" size="sm" icon={<LogOut size={14} />} onClick={() => void logout().then(() => navigate('/login'))}>
            {t.auth.logout}
          </Button>
        </Popover>
      </div>
    </header>
  );
}
