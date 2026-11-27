import { NavLink } from 'react-router-dom';
import { NAV_SECTIONS } from '../../app/navigation';
import { usePreferences } from '../../app/preferences';

/** Lista de navegación compartida por la barra lateral y el cajón móvil. */
export function NavList({ onNavigate, idPrefix }: { onNavigate?: () => void; idPrefix: string }) {
  const { t } = usePreferences();
  return (
    <div className="rc-nav">
      {NAV_SECTIONS.map((section) => (
        <div key={section.id} className="rc-nav__section" role="group" aria-labelledby={`${idPrefix}-${section.id}`}>
          <p id={`${idPrefix}-${section.id}`} className="rc-nav__heading">{t.nav[section.id]}</p>
          <ul>
            {section.items.map((item) => {
              const Icon = item.icon;
              const label = t.nav[item.id];
              return (
                <li key={item.id}>
                  <NavLink to={item.path} end={item.path === '/'} className="rc-nav__link" title={label} onClick={onNavigate}>
                    <Icon size={18} aria-hidden="true" />
                    <span className="rc-nav__label">{label}</span>
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
