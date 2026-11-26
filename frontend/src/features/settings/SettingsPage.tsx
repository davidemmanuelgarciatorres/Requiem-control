import { Clock } from 'lucide-react';
import { DICTIONARIES, LANGUAGES, usePreferences, type MotionPreference } from '../../app/preferences';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../modules/PageHeader';
import { AccountSection, AuditSection, DataSection, MembersSection, OrganizationSection, PlanSection } from './AccountSections';

export function SettingsPage() {
  const { t, lang, setLang, motion, setMotion } = usePreferences();
  const motions: { id: MotionPreference; label: string }[] = [
    { id: 'system', label: t.settings.motionSystem },
    { id: 'reduced', label: t.settings.motionReduced },
  ];
  return (
    <>
      <PageHeader eyebrow={t.nav.sectionPlatform} title={t.settings.title} lead={t.settings.description} />
      <div className="rc-grid rc-grid--2">
        <AccountSection />
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
        <DataSection />
        <Card title={t.settings.otherTitle} subtitle={t.settings.otherPending} className="rc-span-2">
          <ul className="rc-checklist rc-checklist--cols">
            {t.settings.otherItems.map((i) => <li key={i}><Clock size={14} aria-hidden="true" />{i}</li>)}
          </ul>
        </Card>
      </div>
    </>
  );
}
