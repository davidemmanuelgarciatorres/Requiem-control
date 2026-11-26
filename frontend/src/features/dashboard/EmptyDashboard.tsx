import { useEffect, useState } from 'react';
import { Bot, Building2, Check, CircleCheck, Database, Upload } from 'lucide-react';
import { api, type Health } from '../../lib/api';
import { IS_DEMO } from '../../lib/env';
import { usePreferences } from '../../app/preferences';
import { Badge, type Tone } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { interpolate } from '../../lib/format';
import { AGENT_CATALOG } from '../agents/catalog';

/**
 * Estado sin datos (por defecto en la Fase 1). En lugar de métricas inventadas,
 * muestra el camino de incorporación y el estado real del sistema.
 */
export function EmptyDashboard() {
  const { t } = usePreferences();
  const [health, setHealth] = useState<Health | 'down' | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    api<Health>('/health', { signal: ctrl.signal }).then(setHealth).catch((e: unknown) => {
      if (!(e instanceof DOMException)) setHealth('down');
    });
    return () => ctrl.abort();
  }, []);
  const apiUp = health !== null && health !== 'down';
  const dbUp = apiUp && health.database === 'ok';
  const steps = [
    { key: 'account', icon: Building2, phase: 2, done: true },
    { key: 'import', icon: Upload, phase: 3, done: false },
    { key: 'analyze', icon: Bot, phase: 4, done: false },
  ] as const;

  const status: { label: string; value: string; tone: Tone }[] = [
    { label: t.dashboard.systemStatus.frontend, value: t.common.operational, tone: 'success' },
    health === null
      ? { label: t.dashboard.systemStatus.api, value: t.dashboard.systemStatus.checking, tone: 'outline' }
      : IS_DEMO
        ? { label: t.dashboard.systemStatus.api, value: t.demo.simulated, tone: 'warning' }
        : { label: t.dashboard.systemStatus.api, value: apiUp ? t.common.operational : t.status.danger, tone: apiUp ? 'success' : 'danger' },
    health === null
      ? { label: t.dashboard.systemStatus.database, value: t.dashboard.systemStatus.checking, tone: 'outline' }
      : IS_DEMO
        ? { label: t.dashboard.systemStatus.database, value: t.demo.simulated, tone: 'warning' }
        : { label: t.dashboard.systemStatus.database, value: dbUp ? t.common.operational : t.status.danger, tone: dbUp ? 'success' : 'danger' },
    IS_DEMO
      ? { label: t.dashboard.systemStatus.authentication, value: t.demo.simulated, tone: 'warning' }
      : { label: t.dashboard.systemStatus.authentication, value: t.common.operational, tone: 'success' },
    { label: t.dashboard.systemStatus.aiProvider, value: `${t.common.notConfigured} · ${interpolate(t.common.phase, { n: 4 })}`, tone: 'outline' },
    { label: t.dashboard.systemStatus.integrations, value: `${t.common.notConnected} · ${interpolate(t.common.phase, { n: 6 })}`, tone: 'outline' },
  ];

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
                {s.done
                  ? <Badge tone="success"><CircleCheck size={12} aria-hidden="true" />{t.common.completed}</Badge>
                  : <Badge tone="outline">{interpolate(t.common.phase, { n: s.phase })}</Badge>}
              </li>
            );
          })}
        </ol>
      </Card>

      <Card title={t.dashboard.systemStatus.title} subtitle={t.dashboard.systemStatus.subtitle} className="rc-onboarding__status">
        <dl className="rc-status-list">
          {status.map((s) => (
            <div key={s.label} className="rc-status-list__row">
              <dt>{s.label}</dt>
              <dd><Badge tone={s.tone} dot={s.tone === 'success' || s.tone === 'danger'}>{s.value}</Badge></dd>
            </div>
          ))}
        </dl>
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
              <Badge tone="accent"><Check size={12} aria-hidden="true" />{t.agents.priority}</Badge>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
