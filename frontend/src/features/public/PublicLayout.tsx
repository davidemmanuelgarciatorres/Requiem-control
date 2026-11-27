import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LANGUAGES, usePreferences } from '../../app/preferences';
import { AmbientBackground } from '../../components/layout/AmbientBackground';
import { Brand } from '../../components/layout/Brand';

/** Marco de las páginas públicas (inicio, privacidad, términos). */
export function PublicLayout({ children }: { children: ReactNode }) {
  const { t, lang, setLang } = usePreferences();
  const l = t.landing;
  return (
    <>
      <a className="rc-skip-link" href="#main">{t.common.skipToContent}</a>
      <AmbientBackground />
      <div className="rc-public">
        <header className="rc-public__bar">
          <Link to="/" className="rc-public__brand"><Brand /></Link>
          <nav className="rc-public__nav" aria-label={l.navLabel}>
            <div className="rc-segmented" role="group" aria-label={t.settings.language}>
              {LANGUAGES.map((x) => (
                <button key={x} type="button" aria-pressed={lang === x} onClick={() => setLang(x)} lang={x} style={{ minHeight: 28, padding: '0 10px', fontSize: '0.75rem' }}>
                  {x.toUpperCase()}
                </button>
              ))}
            </div>
            <Link className="rc-btn rc-btn--ghost rc-btn--sm" to="/login">{t.auth.signIn}</Link>
            <Link className="rc-btn rc-btn--primary rc-btn--sm" to="/register">{l.ctaStart}</Link>
          </nav>
        </header>
        <main id="main" className="rc-public__main" tabIndex={-1}>{children}</main>
        <footer className="rc-public__footer">
          <span>© {new Date().getFullYear()} REQUIEM CONTROL</span>
          <Link className="rc-link" to="/privacy">{l.privacy}</Link>
          <Link className="rc-link" to="/terms">{l.terms}</Link>
        </footer>
      </div>
    </>
  );
}
