import { Bot, Building2, CircleCheck, Database, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../app/auth';
import type { DatasetSummary } from '../../lib/api';
import { useApiResource } from '../../lib/useApi';
import { usePreferences } from '../../app/preferences';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { AGENT_CATALOG } from '../agents/catalog';

/** Estado sin datos: en lugar de métricas inventadas, muestra el camino de incorporación. */
export function EmptyDashboard() {
  const { t } = usePreferences();
  const { session, can } = useAuth();
  const datasets = useApiResource<DatasetSummary[]>(can('data.read') ? '/datasets' : null, session?.active_organization?.id);
  const imported = (datasets.data?.length ?? 0) > 0;
  const steps = [
    { key: 'account', icon: Building2, phase: 2, done: true },
    { key: 'import', icon: Upload, phase: 3, done: imported },
    { key: 'analyze', icon: Bot, phase: 4, done: false },
  ] as const;


  return (
    <div className="rc-onboarding">
      <Card className="rc-onboarding__main" variant="strong">
        <div className="rc-onboarding__intro">
          <h2 className="rc-onboarding__title">{t.dashboard.onboarding.title}</h2>
          <p className="rc-page-lead">{t.dashboard.onboarding.body}</p>
        </div>
        <ol className="rc-steps">
          {steps.map((s, i) => {
            const Icon = s.icon;
            const copy = t.dashboard.onboarding.steps[s.key];
            return (
              <li key={s.key} className="rc-step">
                <span className="rc-step__index rc-tabular" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                <span className="rc-step__icon" aria-hidden="true"><Icon size={18} /></span>
                <div className="rc-step__body">
                  <p className="rc-step__title">{copy.title}</p>
                  <p className="rc-step__text">{copy.body}</p>
                </div>
                {s.done ? (
                  <Badge tone="success"><CircleCheck size={12} aria-hidden="true" />{t.common.completed}</Badge>
                ) : s.key === 'import' ? (
                  <Link to="/data" className="rc-btn rc-btn--glass rc-btn--sm">{t.dashboard.hero.ctaImport}</Link>
                ) : (
                  <Link to="/agents" className="rc-btn rc-btn--glass rc-btn--sm">{t.agents.title}</Link>
                )}
              </li>
            );
          })}
        </ol>
      </Card>


      <Card title={t.dashboard.mvpAgents.title} subtitle={t.dashboard.mvpAgents.body} className="rc-onboarding__agents">
        <ul className="rc-list">
          {AGENT_CATALOG.filter((a) => a.mvp).map((a) => (
            <li key={a.id} className="rc-list__item">
              <span className="rc-agent-avatar" aria-hidden="true"><Database size={16} /></span>
              <div className="rc-list__main">
                <span className="rc-list__title">{t.agents.catalog[a.key].name}</span>
                <span className="rc-list__meta">{t.agents.catalog[a.key].purpose}</span>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
