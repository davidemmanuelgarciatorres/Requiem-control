import { useState } from 'react';
import { ArrowRight, Table2, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/auth';
import { usePreferences } from '../../app/preferences';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States';
import { api, uploadFile, type DatasetSummary, type UploadPreview, type UploadSummary } from '../../lib/api';
import { IS_DEMO } from '../../lib/env';
import { formatDate, formatNumber, formatPercent } from '../../lib/format';
import { useApiResource } from '../../lib/useApi';
import { PageHeader } from '../modules/PageHeader';
import { dataErrorMessage } from './dataText';
import { UploadDropzone } from './UploadDropzone';

export function DataPage() {
  const { t, lang } = usePreferences();
  const { session, can } = useAuth();
  const navigate = useNavigate();
  const orgKey = session?.active_organization?.id ?? '';
  const datasets = useApiResource<DatasetSummary[]>('/datasets', orgKey);
  const uploads = useApiResource<UploadSummary[]>('/datasets/uploads', orgKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canWrite = can('data.write');
  const pending = uploads.data?.filter((u) => u.status === 'validated') ?? [];

  const onFile = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const preview = await uploadFile<UploadPreview>('/datasets/uploads', file);
      navigate(`/data/import/${preview.id}`, { state: { preview } });
    } catch (e) {
      setError(dataErrorMessage(t, e));
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow={t.nav.sectionIntelligence} title={t.data.title} lead={t.data.lead} />
      <div className="rc-grid rc-grid--2">
        <Card title={t.data.uploadTitle} className="rc-span-2">
          {IS_DEMO && <p className="rc-notice rc-notice--warning" role="note">{t.data.demoUnavailable}</p>}
          {!canWrite && <p className="rc-notice" role="note">{t.data.readOnlyNote}</p>}
          <UploadDropzone onFile={(f) => void onFile(f)} busy={busy} disabled={!canWrite || IS_DEMO} />
          {error && <p className="rc-form__error" role="alert">{error}</p>}
        </Card>

        {pending.length > 0 && (
          <Card title={t.data.pendingTitle} className="rc-span-2">
            <ul className="rc-list">
              {pending.map((u) => (
                <li key={u.id} className="rc-list__item">
                  <div className="rc-list__main">
                    <span className="rc-list__title">{u.filename}</span>
                    <span className="rc-list__meta">{u.format.toUpperCase()} · {formatDate(new Date(u.created_at), lang, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                  </div>
                  <Link className="rc-btn rc-btn--glass rc-btn--sm" to={`/data/import/${u.id}`}>{t.data.review}</Link>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card title={t.data.historyTitle} className="rc-span-2">
          {datasets.loading && <Skeleton height={96} />}
          {datasets.error != null && <ErrorState title={dataErrorMessage(t, datasets.error)} onRetry={datasets.reload} />}
          {datasets.data?.length === 0 && <EmptyState icon={<Table2 size={20} />} title={t.data.historyEmpty} />}
          {datasets.data && datasets.data.length > 0 && (
            <ul className="rc-list" aria-label={t.data.historyTitle}>
              {datasets.data.map((d) => (
                <DatasetItem key={d.id} d={d} canDelete={canWrite} onDeleted={() => { datasets.reload(); uploads.reload(); }} />
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function DatasetItem({ d, canDelete, onDeleted }: { d: DatasetSummary; canDelete: boolean; onDeleted: () => void }) {
  const { t, lang } = usePreferences();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    setBusy(true);
    try {
      await api(`/datasets/${d.id}`, { method: 'DELETE' });
      onDeleted();
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="rc-list__item rc-dataset-item">
      <div className="rc-list__main">
        <Link to={`/data/${d.id}`} className="rc-list__title rc-dataset-item__link">{d.name}</Link>
        <span className="rc-list__meta rc-tabular">
          {formatNumber(d.row_count, lang)} {t.data.rows} · {d.column_count} {t.data.columns}
          {d.source_filename ? ` · ${d.source_filename}` : ''} · {formatDate(new Date(d.created_at), lang, { dateStyle: 'medium' })}
        </span>
      </div>
      <Badge tone={d.completeness >= 0.98 ? 'success' : 'warning'}>{t.data.completeness} {formatPercent(d.completeness, lang, 1)}</Badge>
      {d.issue_count > 0 && <Badge tone="outline">{d.issue_count} {t.data.issues.toLowerCase()}</Badge>}
      <Link className="rc-btn rc-btn--glass rc-btn--sm" to={`/data/${d.id}`} aria-label={`${t.data.open}: ${d.name}`}>
        {t.data.open} <ArrowRight size={13} aria-hidden="true" />
      </Link>
      {canDelete && (
        confirming ? (
          <Button size="sm" variant="danger" loading={busy} onClick={() => void remove()}>{t.data.deleteConfirm}</Button>
        ) : (
          <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={() => setConfirming(true)} aria-label={`${t.data.delete}: ${d.name}`}>
            {t.data.delete}
          </Button>
        )
      )}
    </li>
  );
}
