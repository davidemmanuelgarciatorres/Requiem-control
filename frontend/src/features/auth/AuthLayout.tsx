import type { ReactNode } from 'react';
import { LANGUAGES, usePreferences } from '../../app/preferences';
import { AmbientBackground } from '../../components/layout/AmbientBackground';
import { Brand } from '../../components/layout/Brand';

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  const { lang, setLang, t } = usePreferences();
  return (
    <>
      <AmbientBackground />
      <div className="rc-auth rc-auth--split">
        <section className="rc-auth__intro" aria-hidden="true">
          <p className="rc-auth__title">{t.auth.heroTitle}<br /><em>{t.auth.heroAccent}</em></p>
          <span className="rc-auth__rule" />
          <p className="rc-auth__body">{t.auth.heroBody}</p>
        </section>
        <main className="rc-auth__card rc-glass rc-glass--strong" id="main">
          <div className="rc-auth__head">
            <Brand />
            <div className="rc-segmented" role="group" aria-label={t.settings.language}>
              {LANGUAGES.map((l) => (
                <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)} lang={l} style={{ minHeight: 28, padding: '0 10px', fontSize: '0.75rem' }}>
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <h1 className="rc-page-title">{title}</h1>
          <p className="rc-page-lead">{subtitle}</p>
          {children}
          <p className="rc-auth__footer">{footer}</p>
        </main>
      </div>
    </>
  );
}
