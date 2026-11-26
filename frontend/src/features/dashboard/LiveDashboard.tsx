import { ArrowRight, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePreferences } from '../../app/preferences';
import { AreaChart } from '../../components/charts/AreaChart';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import type { DashboardSummary } from '../../lib/api';
import { formatCurrency, formatDate, formatNumber, formatPercent, interpolate } from '../../lib/format';
import { agentName, STATUS_TONE } from '../agents/AgentsPage';
import { recText } from '../agents/aiText';

/** Panel con los datos REALES de la organización (resultado del último análisis y actividad). */
export function LiveDashboard({ data }: { data: DashboardSummary }) {
  const { t, lang } = usePreferences();
  const fin = data.financial;
  const fmt = (m: NonNullable<typeof fin>['metrics'][number]) =>
    m.format === 'currency' ? formatCurrency(m.value, lang) : m.format === 'percent' ? formatPercent(m.value, lang, 1, m.key === 'change') : formatNumber(m.value, lang);

  return (
    <div className="rc-grid rc-grid--2" data-testid="live-dashboard">
      <Card title={t.live.financialTitle} className="rc-span-2"
        subtitle={fin ? interpolate(t.live.financialSubtitle, { dataset: fin.dataset.name, from: fin.period?.from ?? '—', to: fin.period?.to ?? '—' }) : undefined}
        actions={fin && <Link className="rc-inline-icon" to={`/agents/runs/${fin.execution_id}`}>{t.live.viewAnalysis} <ArrowRight size={14} aria-hidden="true" /></Link>}>
        {fin ? (
          <>
            <dl className="rc-limits">
              {fin.metrics.map((m) => (
                <div key={m.key}><dt>{(t.ai.metrics as Record<string, string>)[m.key] ?? m.key}</dt><dd className="rc-tabular">{fmt(m)}</dd></div>
              ))}
            </dl>
            {fin.series && fin.series.length > 1 && (
              <AreaChart data={fin.series.map((s) => ({ label: s.period, value: s.total }))} ariaLabel={t.ai.seriesTitle}
                formatValue={(v) => formatCurrency(v, lang)} formatAxis={(v) => formatCurrency(v, lang, 'MXN', true)}
                tableHeaders={[t.common.period, t.ai.metrics.total]} height={200} />
            )}
          </>
        ) : (
          <p className="rc-list__meta">{t.live.noFinancial} <Link to="/agents">{t.live.runAnalysis}</Link></p>
        )}
      </Card>

      <Card title={t.live.recommendationsTitle}>
        {data.recommendations.length === 0 ? <p className="rc-list__meta">{t.ai.noRecommendations}</p> : (
          <ul className="rc-list">
            {data.recommendations.map((rec, i) => (
              <li key={`${rec.execution_id}-${rec.code}-${i}`} className="rc-list__item">
                <div className="rc-list__main">
                  <Link className="rc-list__title" to={`/agents/runs/${rec.execution_id}`}>{recText(t, lang, rec).detected}</Link>
                  <span className="rc-list__meta">{agentName(t, rec.agent_id)}{rec.dataset ? ` · ${rec.dataset}` : ''}</span>
                </div>
                <Badge tone={rec.severity === 'warning' ? 'warning' : 'outline'}>{t.status[rec.severity === 'warning' ? 'warning' : 'info']}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={t.live.activityTitle}
        subtitle={interpolate(t.live.activitySubtitle, { datasets: data.datasets, agents: data.active_agents, approvals: data.pending_approvals })}>
        {data.recent_executions.length === 0 ? <p className="rc-list__meta">{t.live.noActivity}</p> : (
          <ul className="rc-list">
            {data.recent_executions.map((e) => (
              <li key={e.id} className="rc-list__item">
                <div className="rc-list__main">
                  <Link className="rc-list__title" to={`/agents/runs/${e.id}`}>{agentName(t, e.agent_id)}{e.dataset ? ` · ${e.dataset}` : ''}</Link>
                  <span className="rc-list__meta">{formatDate(new Date(e.created_at), lang, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                </div>
                <Badge tone={STATUS_TONE[e.status]} dot>{t.ai.status[e.status]}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={t.live.reportsTitle} className="rc-span-2"
        actions={<Link className="rc-inline-icon" to="/reports">{t.common.viewAll} <ArrowRight size={14} aria-hidden="true" /></Link>}>
        {data.reports.length === 0 ? <p className="rc-list__meta">{t.live.noReports}</p> : (
          <ul className="rc-list">
            {data.reports.map((r) => (
              <li key={r.id} className="rc-list__item">
                <FileText size={16} aria-hidden="true" />
                <div className="rc-list__main">
                  <Link className="rc-list__title" to={`/reports/${r.id}`}>{r.title}</Link>
                  <span className="rc-list__meta">{formatDate(new Date(r.created_at), lang, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
