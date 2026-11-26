import { useState } from 'react';
import { ArrowLeft, Download, Printer, Trash2 } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../app/auth';
import { usePreferences } from '../../app/preferences';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ErrorState, Skeleton } from '../../components/ui/States';
import { api, downloadUrl, type Report, type ReportComparison } from '../../lib/api';
import { formatCurrency, formatDate, formatNumber, formatPercent, interpolate } from '../../lib/format';
import { useApiResource } from '../../lib/useApi';
import { agentName } from '../agents/AgentsPage';
import { aiErrorMessage } from '../agents/aiText';
import { Results } from '../agents/ExecutionPage';
import { PageHeader } from '../modules/PageHeader';
import { periodText } from './ReportsPage';

export function ReportPage() {
  const { reportId = '' } = useParams();
  const location = useLocation();
  const initial = (location.state as { report?: Report } | null)?.report;
  const fetched = useApiResource<Report>(initial?.id === reportId ? null : `/reports/${reportId}`);
  const { t } = usePreferences();
  const report = initial?.id === reportId ? initial : fetched.data;

  if (!report) {
    return (
      <>
        <PageHeader eyebrow={t.reports.eyebrow} title={t.reports.title} />
        <Card>{fetched.error != null ? <ErrorState title={t.reports.loadError} onRetry={fetched.reload} /> : <Skeleton height={200} />}</Card>
      </>
    );
  }
  return <ReportView report={report} />;
}

function ReportView({ report: r }: { report: Report }) {
  const { t, lang } = usePreferences();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const c = r.content;
  const csv = downloadUrl(`/reports/${r.id}/export.csv`);

  const remove = async () => {
    setBusy(true);
    try {
      await api(`/reports/${r.id}`, { method: 'DELETE' });
      navigate('/reports');
    } catch (e) {
      setError(aiErrorMessage(t, lang, e));
      setBusy(false);
    }
  };

  return (
    <article className="rc-report">
      <PageHeader
        eyebrow={<Link to="/reports" className="rc-inline-icon rc-no-print"><ArrowLeft size={14} aria-hidden="true" /> {t.reports.title}</Link>}
        title={r.title}
        lead={`${c.organization} · ${agentName(t, r.agent_id)} · ${formatDate(new Date(r.created_at), lang, { dateStyle: 'long', timeStyle: 'short' })}`}
        aside={
          <div className="rc-row rc-no-print">
            <Button size="sm" variant="primary" icon={<Printer size={14} />} onClick={() => window.print()}>{t.reports.print}</Button>
            {csv && <a className="rc-btn rc-btn--glass rc-btn--sm" href={csv} download><Download size={14} aria-hidden="true" />{t.reports.csv}</a>}
            {can('data.write') && !confirming && (
              <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => setConfirming(true)}>{t.reports.delete}</Button>
            )}
          </div>
        }
      />
      {confirming && (
        <div className="rc-notice rc-notice--warning rc-no-print" role="alert">
          <span>{t.reports.confirmDelete}</span>
          <div className="rc-row">
            <Button size="sm" variant="danger" loading={busy} onClick={() => void remove()}>{t.reports.delete}</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>{t.reports.cancel}</Button>
          </div>
        </div>
      )}
      {error && <p className="rc-form__error" role="alert">{error}</p>}
      {!csv && <p className="rc-list__meta rc-no-print">{t.reports.csvDemo}</p>}

      <div className="rc-grid rc-grid--2">
        <Card title={t.reports.scopeTitle} className="rc-span-2">
          <dl className="rc-limits">
            <div><dt>{t.reports.period}</dt><dd className="rc-tabular">{periodText(r.period_from, r.period_to)}</dd></div>
            <div><dt>{t.reports.sources}</dt><dd>{c.sources.map((s) => `${s.name} (${formatNumber(s.rows, lang)} ${t.data.rows.toLowerCase()})`).join(', ') || '—'}</dd></div>
            <div><dt>{t.reports.generatedBy}</dt><dd>
              {c.generated_by?.simulated ? <Badge tone="warning">{t.ai.simulatedBadge}</Badge> : (c.generated_by?.model ?? '—')}
            </dd></div>
            <div><dt>{t.reports.snapshot}</dt><dd>{t.reports.snapshotHint}</dd></div>
          </dl>
        </Card>
        <Comparison cmp={r.comparison} />
        <Results out={{ ...c, period: r.period_from && r.period_to ? { from: r.period_from, to: r.period_to } : null }} approvals={[]} onChanged={() => {}} />
      </div>
    </article>
  );
}

function Comparison({ cmp }: { cmp: ReportComparison | null }) {
  const { t, lang } = usePreferences();
  const fmt = (v: number, f: string, key: string) =>
    f === 'currency' ? formatCurrency(v, lang) : f === 'percent' ? formatPercent(v, lang, 1, key === 'change') : formatNumber(v, lang);
  if (!cmp) {
    return <Card title={t.reports.comparisonTitle} className="rc-span-2"><p className="rc-list__meta">{t.reports.noPrevious}</p></Card>;
  }
  return (
    <Card title={t.reports.comparisonTitle} className="rc-span-2"
      subtitle={interpolate(t.reports.comparedWith, { title: cmp.previous_title, period: periodText(cmp.previous_period.from, cmp.previous_period.to) })}>
      <div className="rc-table-wrap">
        <table className="rc-table">
          <thead><tr>
            <th scope="col">{t.reports.metric}</th><th scope="col">{t.reports.previous}</th><th scope="col">{t.reports.current}</th><th scope="col">{t.reports.change}</th>
          </tr></thead>
          <tbody>
            {cmp.metrics.map((m) => {
              const tone = m.delta > 0 ? 'rc-delta--up' : m.delta < 0 ? 'rc-delta--down' : '';
              const pct = m.format !== 'percent' && m.delta_pct !== null ? ` (${formatPercent(m.delta_pct, lang, 1, true)})` : '';
              const delta = m.format === 'percent' ? `${formatNumber(Math.round(m.delta * 1000) / 10, lang)} pp` : `${m.delta > 0 ? '+' : ''}${fmt(m.delta, m.format, m.key)}${pct}`;
              return (
                <tr key={m.key}>
                  <th scope="row">{(t.ai.metrics as Record<string, string>)[m.key] ?? m.key}</th>
                  <td className="rc-tabular">{fmt(m.previous, m.format, m.key)}</td>
                  <td className="rc-tabular">{fmt(m.current, m.format, m.key)}</td>
                  <td className={`rc-tabular ${tone}`}>{delta}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="rc-list__meta">{t.reports.comparisonHint}</p>
    </Card>
  );
}
