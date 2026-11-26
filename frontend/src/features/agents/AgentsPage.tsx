import { useState } from 'react';
import { ArrowRight, Bot, Info, Lock, Play, ShieldCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/auth';
import { usePreferences } from '../../app/preferences';
import { Badge, type Tone } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States';
import { api, type AgentInfo, type AgentsInfo, type DatasetSummary, type Execution, type ExecutionStatus, type ProviderInfo } from '../../lib/api';
import { IS_DEMO } from '../../lib/env';
import { formatDate, interpolate } from '../../lib/format';
import { useApiResource } from '../../lib/useApi';
import { PageHeader } from '../modules/PageHeader';
import { AgentsCatalogStatic } from './AgentsCatalogStatic';
import { aiErrorMessage } from './aiText';

const CATALOG_KEY: Record<string, 'dataAnalyst' | 'financialAnalyst' | 'inventoryAnalyst' | 'customerOps' | 'emailOps' | 'automation'> = {
  'data-analyst': 'dataAnalyst', 'financial-analyst': 'financialAnalyst', 'inventory-analyst': 'inventoryAnalyst',
  'customer-ops': 'customerOps', 'email-ops': 'emailOps', automation: 'automation',
};

export const STATUS_TONE: Record<ExecutionStatus, Tone> = {
  created: 'outline', queued: 'outline', running: 'info', awaiting_approval: 'warning', completed: 'success', failed: 'danger', cancelled: 'neutral',
};

export function agentName(t: ReturnType<typeof usePreferences>['t'], id: string): string {
  const key = CATALOG_KEY[id];
  return key ? t.agents.catalog[key].name : id;
}

export function AgentsPage() {
  // La demostración sin servidor no ejecuta agentes: muestra el catálogo informativo.
  if (IS_DEMO) return <AgentsCatalogStatic />;
  return <AgentsLive />;
}

function AgentsLive() {
  const { t, lang } = usePreferences();
  const { session, can } = useAuth();
  const orgKey = session?.active_organization?.id ?? '';
  const agents = useApiResource<AgentsInfo>('/agents', orgKey);
  const provider = useApiResource<ProviderInfo>('/agents/provider');
  const datasets = useApiResource<DatasetSummary[]>(can('data.read') ? '/datasets' : null, orgKey);
  const runs = useApiResource<Execution[]>(can('data.read') ? '/agents/executions?limit=10' : null, orgKey);

  return (
    <>
      <PageHeader eyebrow={t.nav.sectionOperate} title={t.agents.title} lead={t.ai.lead} />
      {provider.data && (
        <p className={`rc-notice${provider.data.simulated ? ' rc-notice--warning' : ''}`} role="note" style={{ marginBottom: 'var(--rc-space-5)' }}>
          <Info size={18} aria-hidden="true" />
          <span>{provider.data.simulated ? t.ai.providerMock : interpolate(t.ai.providerReal, { model: provider.data.model })}{provider.data.note ? ` ${provider.data.note}` : ''}</span>
        </p>
      )}
      {agents.loading && <Skeleton height={200} />}
      {agents.error != null && <Card><ErrorState title={aiErrorMessage(t, lang, agents.error)} onRetry={agents.reload} /></Card>}
      {agents.data && (
        <>
          <div className="rc-row" style={{ marginBottom: 'var(--rc-space-4)' }}>
            <Badge tone="outline">{interpolate(t.ai.activeCount, { n: agents.data.active_count, limit: agents.data.active_limit })}</Badge>
            <Badge tone="outline">{interpolate(t.ai.runsCount, { n: agents.data.monthly_executions, limit: agents.data.monthly_limit })}</Badge>
          </div>
          <ul className="rc-grid rc-grid--3">
            {agents.data.agents.map((a) => (
              <li key={a.id}>
                <AgentCard agent={a} datasets={datasets.data ?? []} onChanged={() => { agents.reload(); runs.reload(); }} />
              </li>
            ))}
          </ul>
        </>
      )}
      <Card title={t.ai.historyTitle} className="rc-agent-history">
        {runs.data?.length === 0 && <EmptyState icon={<Bot size={20} />} title={t.ai.historyEmpty} />}
        {runs.data && runs.data.length > 0 && (
          <ul className="rc-list" aria-label={t.ai.historyTitle}>
            {runs.data.map((r) => (
              <li key={r.id} className="rc-list__item">
                <div className="rc-list__main">
                  <span className="rc-list__title">{agentName(t, r.agent_id)}{r.output?.dataset ? ` · ${r.output.dataset.name}` : ''}</span>
                  <span className="rc-list__meta">{formatDate(new Date(r.created_at), lang, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                </div>
                <Badge tone={STATUS_TONE[r.status]} dot>{t.ai.status[r.status]}</Badge>
                <Link className="rc-btn rc-btn--glass rc-btn--sm" to={`/agents/runs/${r.id}`}>{t.ai.open} <ArrowRight size={13} aria-hidden="true" /></Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function AgentCard({ agent, datasets, onChanged }: { agent: AgentInfo; datasets: DatasetSummary[]; onChanged: () => void }) {
  const { t, lang } = usePreferences();
  const { can } = useAuth();
  const navigate = useNavigate();
  const key = CATALOG_KEY[agent.id];
  const [datasetId, setDatasetId] = useState('');
  const [busy, setBusy] = useState<'toggle' | 'run' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const available = agent.status === 'available';
  const selectedDataset = datasetId || datasets[0]?.id || '';

  const toggle = async () => {
    setBusy('toggle');
    setError(null);
    try {
      await api(`/agents/${agent.id}/activation`, { method: 'PUT', body: { active: !agent.active } });
      onChanged();
    } catch (e) {
      setError(aiErrorMessage(t, lang, e));
    } finally {
      setBusy(null);
    }
  };

  const run = async () => {
    setBusy('run');
    setError(null);
    try {
      const idempotency_key = `ui-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const ex = await api<Execution>(`/agents/${agent.id}/executions`, { method: 'POST', body: { dataset_id: selectedDataset, idempotency_key } });
      navigate(`/agents/runs/${ex.id}`);
    } catch (e) {
      setError(aiErrorMessage(t, lang, e));
      setBusy(null);
    }
  };

  return (
    <Card
      as="article"
      aria-label={key ? t.agents.catalog[key].name : agent.id}
      className="rc-agent-card"
      title={<span className="rc-inline-icon"><span className="rc-agent-avatar" aria-hidden="true"><Bot size={16} /></span>{key ? t.agents.catalog[key].name : agent.id}</span>}
      actions={available
        ? <Badge tone={agent.active ? 'success' : 'outline'} dot={agent.active}>{agent.active ? t.ai.active : t.ai.inactive}</Badge>
        : <Badge tone="outline">{t.common.upcoming}</Badge>}
    >
      {key && <p className="rc-page-lead" style={{ fontSize: 'var(--rc-fs-sm)' }}>{t.agents.catalog[key].purpose}</p>}
      <div className="rc-agent-card__meta">
        {agent.read_only && <Badge tone="info"><Lock size={12} aria-hidden="true" />{t.agents.readOnly}</Badge>}
        {agent.requires_approval && <Badge tone="warning">{t.agents.requiresApproval}</Badge>}
      </div>
      {available ? (
        <>
          <div>
            <h3 className="rc-subheading">{t.ai.tools}</h3>
            <ul className="rc-checklist">
              {agent.allowed_tools.map((tool) => (
                <li key={tool}><ShieldCheck size={14} aria-hidden="true" />{(t.ai.toolNames as Record<string, string>)[tool] ?? tool}</li>
              ))}
            </ul>
          </div>
          {agent.active && (
            datasets.length === 0 ? <p className="rc-list__meta">{t.ai.noDatasets} <Link className="rc-link" to="/data">{t.data.title}</Link></p> : (
              <div className="rc-field">
                <label className="rc-field__label" htmlFor={`ds-${agent.id}`}>{t.ai.chooseDataset}</label>
                <select id={`ds-${agent.id}`} className="rc-select" value={selectedDataset} onChange={(e) => setDatasetId(e.target.value)} style={{ minHeight: 40 }}>
                  {datasets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
            )
          )}
          <div className="rc-agent-card__foot">
            <span className="rc-list__meta">{t.agents.version} {agent.version} · {interpolate(t.ai.timeout, { s: agent.timeout_seconds })}</span>
            <div className="rc-row">
              {can('agents.manage') && (
                <Button size="sm" variant="glass" loading={busy === 'toggle'} onClick={() => void toggle()}>
                  {agent.active ? t.ai.deactivate : t.ai.activate}
                </Button>
              )}
              {agent.active && can('agents.run') && (
                <Button size="sm" variant="primary" icon={<Play size={13} />} loading={busy === 'run'} disabled={!selectedDataset} onClick={() => void run()}>
                  {t.ai.run}
                </Button>
              )}
            </div>
          </div>
        </>
      ) : (
        <p className="rc-list__meta">{interpolate(t.ai.planned, { n: agent.phase })}</p>
      )}
      {error && <p className="rc-form__error" role="alert">{error}</p>}
    </Card>
  );
}
