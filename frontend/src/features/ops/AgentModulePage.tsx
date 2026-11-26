import { ArrowRight, Bot, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../app/auth';
import { usePreferences } from '../../app/preferences';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States';
import type { AgentsInfo, DatasetSummary, Execution } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useApiResource } from '../../lib/useApi';
import { AgentCard, STATUS_TONE } from '../agents/AgentsPage';
import { aiErrorMessage } from '../agents/aiText';
import { PageHeader } from '../modules/PageHeader';

type ModuleKey = 'inventory' | 'customers' | 'email';

/** Módulo operativo de la Fase 7: el agente correspondiente, cómo preparar los datos y su historial. */
export function AgentModulePage({ agentId, moduleKey, children }: { agentId: string; moduleKey: ModuleKey; children?: React.ReactNode }) {
  const { t, lang } = usePreferences();
  const { session, can } = useAuth();
  const orgKey = session?.active_organization?.id ?? '';
  const m = t.modules[moduleKey];
  const help = t.ops[moduleKey];
  const agents = useApiResource<AgentsInfo>('/agents', orgKey);
  const datasets = useApiResource<DatasetSummary[]>(can('data.read') ? '/datasets' : null, orgKey);
  const runs = useApiResource<Execution[]>(can('data.read') ? '/agents/executions?limit=50' : null, orgKey);
  const agent = agents.data?.agents.find((a) => a.id === agentId);
  const mine = (runs.data ?? []).filter((r) => r.agent_id === agentId).slice(0, 10);

  return (
    <>
      <PageHeader eyebrow={t.nav.sectionIntelligence} title={m.title} lead={m.description} />
      <div className="rc-grid rc-grid--2">
        <div>
          {agents.loading && <Skeleton height={220} />}
          {agents.error != null && <Card><ErrorState title={aiErrorMessage(t, lang, agents.error)} onRetry={agents.reload} /></Card>}
          {agent && <AgentCard agent={agent} datasets={datasets.data ?? []} onChanged={() => { agents.reload(); runs.reload(); }} />}
        </div>
        <Card title={help.howTitle}>
          <ul className="rc-checklist">
            {help.how.map((h) => <li key={h}><Info size={14} aria-hidden="true" />{h}</li>)}
          </ul>
          {children}
        </Card>
        <Card title={t.ai.historyTitle} className="rc-span-2">
          {runs.data && mine.length === 0 && <EmptyState icon={<Bot size={20} />} title={t.ai.historyEmpty} />}
          {mine.length > 0 && (
            <ul className="rc-list">
              {mine.map((r) => (
                <li key={r.id} className="rc-list__item">
                  <div className="rc-list__main">
                    <span className="rc-list__title">{r.output?.dataset?.name ?? m.title}</span>
                    <span className="rc-list__meta">{formatDate(new Date(r.created_at), lang, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                  </div>
                  <Badge tone={STATUS_TONE[r.status]} dot>{t.ai.status[r.status]}</Badge>
                  <Link className="rc-btn rc-btn--glass rc-btn--sm" to={`/agents/runs/${r.id}`}>{t.ai.open} <ArrowRight size={13} aria-hidden="true" /></Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
