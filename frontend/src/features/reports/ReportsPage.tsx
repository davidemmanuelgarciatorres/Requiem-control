import { FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../app/auth';
import { usePreferences } from '../../app/preferences';
import { Card } from '../../components/ui/Card';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States';
import type { ReportSummary } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useApiResource } from '../../lib/useApi';
import { agentName } from '../agents/AgentsPage';
import { PageHeader } from '../modules/PageHeader';

export function periodText(from: string | null, to: string | null): string {
  return from && to ? `${from} → ${to}` : '—';
}

export function ReportsPage() {
  const { t, lang } = usePreferences();
  const { session } = useAuth();
  const list = useApiResource<ReportSummary[]>('/reports', session?.active_organization?.id);

  return (
    <>
      <PageHeader eyebrow={t.reports.eyebrow} title={t.reports.title} lead={t.reports.lead} />
      <Card title={t.reports.historyTitle}>
        {list.loading && <Skeleton height={120} />}
        {list.error != null && <ErrorState title={t.reports.loadError} onRetry={list.reload} />}
        {list.data && list.data.length === 0 && (
          <EmptyState icon={<FileText size={22} />} title={t.reports.emptyTitle} body={t.reports.emptyBody}
            action={<Link className="rc-btn rc-btn--primary rc-btn--sm" to="/agents">{t.reports.goToAgents}</Link>} />
        )}
        {list.data && list.data.length > 0 && (
          <ul className="rc-list">
            {list.data.map((r) => (
              <li key={r.id} className="rc-list__item">
                <div className="rc-list__main">
                  <Link className="rc-list__title" to={`/reports/${r.id}`}>{r.title}</Link>
                  <span className="rc-list__meta">
                    {agentName(t, r.agent_id)} · {t.reports.period}: {periodText(r.period_from, r.period_to)} · {formatDate(new Date(r.created_at), lang, { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
