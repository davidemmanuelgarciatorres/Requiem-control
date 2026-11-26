import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Check, CircleAlert, X } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../app/auth';
import { usePreferences } from '../../app/preferences';
import { AreaChart } from '../../components/charts/AreaChart';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ErrorState, Skeleton } from '../../components/ui/States';
import { api, type AgentOutput, type ApprovalInfo, type Execution, type ExecutionStatus } from '../../lib/api';
import { formatCurrency, formatDate, formatNumber, formatPercent, interpolate } from '../../lib/format';
import { notifyApprovalsChanged } from '../../components/layout/ApprovalsMenu';
import { PageHeader } from '../modules/PageHeader';
import { agentName, STATUS_TONE } from './AgentsPage';
import { aiErrorMessage, approvalText, limitationText, recText } from './aiText';

const LIVE: ExecutionStatus[] = ['created', 'queued', 'running'];
const STEPS: ExecutionStatus[] = ['queued', 'running', 'awaiting_approval', 'completed'];

export function ExecutionPage() {
  const { executionId = '' } = useParams();
  const { t, lang } = usePreferences();
  const [execution, setExecution] = useState<Execution | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    try {
      setExecution(await api<Execution>(`/agents/executions/${executionId}`));
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, [executionId]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const ex = await api<Execution>(`/agents/executions/${executionId}`);
        if (cancelled) return;
        setExecution(ex);
        // Seguimiento del ciclo de vida mientras la ejecución está activa.
        if (LIVE.includes(ex.status)) timer = setTimeout(() => void tick(), 900);
        else notifyApprovalsChanged();
      } catch (e) {
        if (!cancelled) setError(e);
      }
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [executionId]);

  if (!execution) {
    return (
      <>
        <PageHeader eyebrow={t.ai.resultEyebrow} title={t.agents.title} />
        <Card>{error != null ? <ErrorState title={aiErrorMessage(t, lang, error)} onRetry={() => void load()} /> : <Skeleton height={180} />}</Card>
      </>
    );
  }
  return <ExecutionView execution={execution} onChanged={() => void load()} />;
}

function ExecutionView({ execution: ex, onChanged }: { execution: Execution; onChanged: () => void }) {
  const { t, lang } = usePreferences();
  const { can } = useAuth();
  const [busy, setBusy] = useState(false);
  const out = ex.output;
  const cancellable = ['created', 'queued', 'awaiting_approval'].includes(ex.status) && can('agents.run');

  const cancel = async () => {
    setBusy(true);
    try {
      await api(`/agents/executions/${ex.id}/cancel`, { method: 'POST' });
      notifyApprovalsChanged();
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow={<Link to="/agents" className="rc-inline-icon"><ArrowLeft size={14} aria-hidden="true" /> {t.agents.title}</Link>}
        title={`${agentName(t, ex.agent_id)}${out ? ` · ${out.dataset.name}` : ''}`}
        lead={formatDate(new Date(ex.created_at), lang, { dateStyle: 'medium', timeStyle: 'short' })}
        aside={<Badge tone={STATUS_TONE[ex.status]} dot>{t.ai.status[ex.status]}</Badge>}
      />
      <div className="rc-grid rc-grid--2">
        <Card title={t.ai.lifecycle} className="rc-span-2" actions={cancellable && <Button size="sm" variant="ghost" loading={busy} onClick={() => void cancel()}>{t.ai.cancel}</Button>}>
          <Lifecycle status={ex.status} withApproval={ex.approvals.length > 0} />
        </Card>

        {ex.status === 'failed' && ex.error && (
          <Card title={t.ai.failedTitle} className="rc-span-2">
            <p className="rc-notice rc-notice--warning" role="alert"><CircleAlert size={18} aria-hidden="true" /><span>{aiErrorMessage(t, lang, ex.error)}</span></p>
          </Card>
        )}

        {out && <Results out={out} approvals={ex.approvals} onChanged={onChanged} />}

        {ex.usage.provider && (
          <Card title={t.ai.usageTitle} className="rc-span-2">
            <p className="rc-list__meta rc-tabular">
              {interpolate(t.ai.usageLine, {
                provider: ex.usage.simulated ? `${ex.usage.provider} (${t.ai.simulatedBadge})` : String(ex.usage.provider),
                model: ex.usage.model ?? '—',
                tokens: formatNumber((ex.usage.input_tokens ?? 0) + (ex.usage.output_tokens ?? 0), lang),
                cost: formatCurrency(ex.usage.cost_usd ?? 0, lang, 'USD'),
              })}
            </p>
          </Card>
        )}
      </div>
    </>
  );
}

function Lifecycle({ status, withApproval }: { status: ExecutionStatus; withApproval: boolean }) {
  const { t } = usePreferences();
  // El paso de aprobación solo existe si el agente propuso alguna acción.
  const steps = withApproval || status === 'awaiting_approval' ? STEPS : STEPS.filter((s) => s !== 'awaiting_approval');
  const terminalBad = status === 'failed' || status === 'cancelled';
  const reached = terminalBad ? -1 : steps.indexOf(status === 'created' ? 'queued' : status);
  return (
    <ol className="rc-steps-line" aria-label={t.ai.lifecycle}>
      {steps.map((s, i) => (
        <li key={s} className={i < reached || status === 'completed' ? 'is-done' : i === reached ? 'is-current' : ''} aria-current={i === reached || undefined}>
          <span className="rc-steps-line__dot" aria-hidden="true" />
          {t.ai.status[s]}
        </li>
      ))}
      {terminalBad && <li className="is-error" aria-current="step"><span className="rc-steps-line__dot" aria-hidden="true" />{t.ai.status[status]}</li>}
    </ol>
  );
}

function Results({ out, approvals, onChanged }: { out: AgentOutput; approvals: ApprovalInfo[]; onChanged: () => void }) {
  const { t, lang } = usePreferences();
  const fmt = (m: AgentOutput['metrics'][number]) =>
    m.format === 'currency' ? formatCurrency(m.value, lang) : m.format === 'percent' ? formatPercent(m.value, lang, 1, m.key === 'change') : formatNumber(m.value, lang);

  return (
    <>
      <Card title={t.ai.summaryTitle} className="rc-span-2"
        actions={out.summary && <Badge tone={out.summary.simulated ? 'warning' : 'accent'}>{out.summary.simulated ? t.ai.simulatedBadge : interpolate(t.ai.realBadge, { model: out.summary.model })}</Badge>}>
        {out.summary ? <p className="rc-summary">{out.summary.text}</p> : <p className="rc-list__meta">{interpolate(t.ai.summaryUnavailable, { code: out.summary_error ?? '—' })}</p>}
        {out.period && <p className="rc-list__meta">{interpolate(t.ai.periodLabel, { from: out.period.from, to: out.period.to })}</p>}
        {out.columns_used && <p className="rc-list__meta">{interpolate(t.ai.columnsUsed, { amount: out.columns_used.amount, date: out.columns_used.date })}</p>}
      </Card>

      <Card title={t.ai.metricsTitle} className="rc-span-2">
        <dl className="rc-limits">
          {out.metrics.map((m) => (
            <div key={m.key}><dt>{(t.ai.metrics as Record<string, string>)[m.key] ?? m.key}</dt><dd className="rc-tabular">{fmt(m)}</dd></div>
          ))}
        </dl>
      </Card>

      {out.series && out.series.length > 1 && (
        <Card title={t.ai.seriesTitle} subtitle="MXN">
          <AreaChart
            data={out.series.map((s) => ({ label: s.period, value: s.total }))}
            ariaLabel={t.ai.seriesTitle}
            formatValue={(v) => formatCurrency(v, lang)}
            formatAxis={(v) => formatCurrency(v, lang, 'MXN', true)}
            tableHeaders={[t.common.period, t.ai.metrics.total]}
            height={220}
          />
        </Card>
      )}

      {out.breakdown && (
        <Card title={interpolate(t.ai.breakdownTitle, { dimension: out.breakdown.dimension })}>
          <ul className="rc-bars">
            {out.breakdown.items.map((it) => (
              <li key={it.label}>
                <span className="rc-bars__label">{it.label === '__other__' ? t.ai.other : it.label}</span>
                <span className="rc-bars__track" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(1, it.share)) * 100}%` }} /></span>
                <span className="rc-tabular rc-bars__value">{formatPercent(it.share, lang, 1)} · {formatCurrency(it.total, lang)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {out.unusual && out.unusual.length > 0 && (
        <Card title={t.ai.unusualTitle} subtitle={t.ai.unusualHint} className="rc-span-2">
          <div className="rc-table-wrap">
            <table className="rc-table">
              <thead><tr><th scope="col">{t.ai.row}</th><th scope="col">{t.data.roles.date}</th><th scope="col">{t.data.roles.amount}</th><th scope="col">{out.breakdown?.dimension ?? ''}</th></tr></thead>
              <tbody>
                {out.unusual.map((u) => (
                  <tr key={u.row_number}><td className="rc-tabular">{u.row_number}</td><td className="rc-tabular">{u.date}</td><td className="rc-tabular">{formatCurrency(u.amount, lang)}</td><td>{u.label ?? '—'}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card title={t.ai.recommendationsTitle} className="rc-span-2">
        {out.recommendations.length === 0 && <p className="rc-list__meta">{t.ai.noRecommendations}</p>}
        <ul className="rc-recs">
          {out.recommendations.map((rec, i) => {
            const x = recText(t, lang, rec);
            const approval = rec.approval_id ? approvals.find((a) => a.id === rec.approval_id) : undefined;
            const evidence = [
              rec.evidence.rows?.length ? interpolate(t.ai.evidenceRows, { rows: rec.evidence.rows.join(', ') }) : null,
              rec.evidence.periods?.length ? interpolate(t.ai.evidencePeriods, { periods: rec.evidence.periods.join(' → ') }) : null,
            ].filter(Boolean).join(' · ');
            return (
              <li key={`${rec.code}-${i}`} className={`rc-rec rc-rec--${rec.severity}`}>
                <p className="rc-rec__detected">{x.detected}</p>
                <dl className="rc-rec__grid">
                  {evidence && <div><dt>{t.ai.evidence}</dt><dd>{evidence}</dd></div>}
                  <div><dt>{t.ai.why}</dt><dd>{x.why}</dd></div>
                  <div className={evidence ? '' : 'rc-rec__limit'}><dt>{t.ai.action}</dt><dd>{x.action}</dd></div>
                </dl>
                {approval && <ApprovalBox approval={approval} onChanged={onChanged} />}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title={t.ai.limitationsTitle} className="rc-span-2">
        <ul className="rc-checklist">
          {out.limitations.map((l) => <li key={l.code}><CircleAlert size={14} aria-hidden="true" />{limitationText(t, lang, l.code, l.params)}</li>)}
        </ul>
      </Card>
    </>
  );
}

function ApprovalBox({ approval, onChanged }: { approval: ApprovalInfo; onChanged: () => void }) {
  const { t, lang } = usePreferences();
  const { can } = useAuth();
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const decide = async (decision: 'approve' | 'reject') => {
    setBusy(decision);
    setError(null);
    try {
      await api(`/approvals/${approval.id}/decision`, { method: 'POST', body: { decision } });
      notifyApprovalsChanged();
      onChanged();
    } catch (e) {
      setError(aiErrorMessage(t, lang, e));
    } finally {
      setBusy(null);
    }
  };
  const tone = approval.status === 'executed' ? 'success' : approval.status === 'pending' ? 'warning' : approval.status === 'failed' ? 'danger' : 'neutral';
  return (
    <div className="rc-approval-box" role="group" aria-label={t.ai.approvalsTitle}>
      <div className="rc-row" style={{ justifyContent: 'space-between' }}>
        <strong>{approvalText(t, lang, approval.action_type, approval.payload)}</strong>
        <Badge tone={tone} dot>{t.ai.approvalStatus[approval.status]}</Badge>
      </div>
      {approval.status === 'pending' && (
        can('approvals.decide') ? (
          <>
            <p className="rc-list__meta">{t.ai.approvalHint}</p>
            <div className="rc-row">
              <Button size="sm" variant="primary" icon={<Check size={14} />} loading={busy === 'approve'} disabled={busy !== null} onClick={() => void decide('approve')}>{t.ai.approve}</Button>
              <Button size="sm" variant="ghost" icon={<X size={14} />} loading={busy === 'reject'} disabled={busy !== null} onClick={() => void decide('reject')}>{t.ai.reject}</Button>
            </div>
          </>
        ) : <p className="rc-list__meta">{t.ai.cannotDecide}</p>
      )}
      {approval.status === 'executed' && approval.result && (
        <p className="rc-list__meta">{interpolate(t.ai.approvalResult, Object.fromEntries(Object.entries(approval.result).map(([k, v]) => [k, typeof v === 'number' ? formatNumber(v, lang) : v])))}</p>
      )}
      {error && <p className="rc-form__error" role="alert">{error}</p>}
    </div>
  );
}
