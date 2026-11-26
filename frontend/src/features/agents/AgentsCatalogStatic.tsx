import { Bot, Lock, ShieldCheck } from 'lucide-react';
import { usePreferences } from '../../app/preferences';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { interpolate } from '../../lib/format';
import { PageHeader } from '../modules/PageHeader';
import { AGENT_CATALOG } from './catalog';

export function AgentsCatalogStatic() {
  const { t } = usePreferences();
  return (
    <>
      <PageHeader eyebrow={t.nav.sectionOperate} title={t.agents.title} lead={t.agents.description} />
      <p className="rc-notice" role="note" style={{ marginBottom: 'var(--rc-space-5)' }}>
        <ShieldCheck size={18} aria-hidden="true" />
        <span>{t.agents.freePlanNote}</span>
      </p>
      <ul className="rc-grid rc-grid--3">
        {AGENT_CATALOG.map((a) => {
          const copy = t.agents.catalog[a.key];
          return (
            <li key={a.id}>
              <Card
                as="article"
                title={<span className="rc-inline-icon"><span className="rc-agent-avatar" aria-hidden="true"><Bot size={16} /></span>{copy.name}</span>}
                actions={a.mvp ? <Badge tone="accent">{t.agents.priority}</Badge> : <Badge tone="outline">{t.common.upcoming}</Badge>}
                className="rc-agent-card"
              >
                <p className="rc-page-lead" style={{ fontSize: 'var(--rc-fs-sm)' }}>{copy.purpose}</p>
                <div className="rc-agent-card__meta">
                  {a.readOnly && <Badge tone="info"><Lock size={12} aria-hidden="true" />{t.agents.readOnly}</Badge>}
                  {a.requiresApproval && <Badge tone="warning">{t.agents.requiresApproval}</Badge>}
                </div>
                <div>
                  <h3 className="rc-subheading">{t.agents.permissions}</h3>
                  <ul className="rc-checklist">
                    {a.permissions.map((p) => <li key={p}><ShieldCheck size={14} aria-hidden="true" />{t.agents.perms[p]}</li>)}
                  </ul>
                </div>
                <div className="rc-agent-card__foot">
                  <span className="rc-list__meta">{interpolate(t.agents.phaseLabel, { n: a.phase })} · {t.agents.version} {a.version}</span>
                  <Button size="sm" variant="glass" disabled title={t.agents.activateDisabled}>{t.agents.activate}</Button>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </>
  );
}
