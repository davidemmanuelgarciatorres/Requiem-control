import { ArrowLeft, Clock, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import { findNavItem, type ModuleId, type NavId } from '../../app/navigation';
import { usePreferences } from '../../app/preferences';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { interpolate } from '../../lib/format';
import { PageHeader } from './PageHeader';

/** Plantilla honesta para módulos planificados: explica qué hará y cuándo, sin simular funcionalidad. */
export function ModulePage({ navId, moduleId }: { navId: NavId; moduleId: ModuleId }) {
  const { t } = usePreferences();
  const item = findNavItem(navId);
  const copy = t.modules[moduleId];
  const Icon = item.icon;
  const phase = item.phase ?? 0;

  return (
    <>
      <PageHeader
        eyebrow={<span className="rc-inline-icon"><Icon size={14} aria-hidden="true" /> {t.nav[navId]}</span>}
        title={copy.title}
        lead={copy.description}
        aside={<Badge tone="outline"><Clock size={12} aria-hidden="true" />{interpolate(t.modules.plannedPhase, { n: phase })}</Badge>}
      />
      <div className="rc-grid rc-grid--2">
        <Card title={t.modules.capabilitiesTitle}>
          <ul className="rc-checklist">
            {copy.capabilities.map((c) => (
              <li key={c}><Clock size={14} aria-hidden="true" />{c}</li>
            ))}
          </ul>
        </Card>
        <Card title={t.modules.statusTitle}>
          <div className="rc-notice" role="note">
            <Info size={18} aria-hidden="true" />
            <p>{t.modules.notOperational}</p>
          </div>
          <Link to="/" className="rc-btn rc-btn--ghost rc-btn--sm" style={{ justifySelf: 'start' }}>
            <ArrowLeft size={14} aria-hidden="true" />{t.common.back}
          </Link>
        </Card>
      </div>
    </>
  );
}
