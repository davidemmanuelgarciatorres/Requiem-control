import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { DICTIONARIES, LANGUAGES, usePreferences, type MotionPreference } from '../../app/preferences';
import { Card } from '../../components/ui/Card';
import { SystemStatus } from './SystemStatus';
import { FloatersSettings } from '../floaters/FloatersSettings';
import { PageHeader } from '../modules/PageHeader';
import { AccountSection, AuditSection, PasswordSection, DataSection, MembersSection, OrganizationSection, PlanSection } from './AccountSections';

export function SettingsPage() {
  const { t, lang, setLang, motion, setMotion } = usePreferences();
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    // La sección se carga de forma asíncrona: se reintenta brevemente hasta encontrarla.
    let tries = 0;
    const id = window.setInterval(() => {
      const el = document.getElementById(hash.slice(1));
      if (el || ++tries > 20) {
        window.clearInterval(id);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [hash]);
  const motions: { id: MotionPreference; label: string }[] = [
    { id: 'system', label: t.settings.motionSystem },
    { id: 'reduced', label: t.settings.motionReduced },
  ];
  return (
    <>
      <PageHeader eyebrow={t.nav.sectionPlatform} title={t.settings.title} lead={t.settings.description} />
      <div className="rc-grid rc-grid--2">
        <AccountSection />
        <PasswordSection />
        <OrganizationSection />
        <MembersSection />
        <PlanSection />
        <AuditSection />
        <Card title={t.settings.language} subtitle={t.settings.languageHint}>
          <div className="rc-segmented" role="group" aria-label={t.settings.language}>
            {LANGUAGES.map((l) => (
              <button key={l} type="button" lang={l} aria-pressed={lang === l} onClick={() => setLang(l)}>{DICTIONARIES[l].meta.languageName}</button>
            ))}
          </div>
        </Card>
        <Card title={t.settings.motion} subtitle={t.settings.motionHint}>
          <div className="rc-segmented" role="group" aria-label={t.settings.motion}>
            {motions.map((m) => (
              <button key={m.id} type="button" aria-pressed={motion === m.id} onClick={() => setMotion(m.id)}>{m.label}</button>
            ))}
          </div>
        </Card>
        <FloatersSettings />
        <DataSection />
        <SystemStatus />
      </div>
    </>
  );
}
