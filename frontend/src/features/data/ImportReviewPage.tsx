import { useState, type FormEvent } from 'react';
import { ArrowLeft, Check, TriangleAlert, X } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../app/auth';
import { usePreferences } from '../../app/preferences';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ErrorState, Skeleton } from '../../components/ui/States';
import { api, type ColumnRole, type ColumnType, type Dataset, type UploadPreview } from '../../lib/api';
import { formatNumber, formatPercent, interpolate } from '../../lib/format';
import { useApiResource } from '../../lib/useApi';
import { PageHeader } from '../modules/PageHeader';
import { dataErrorMessage } from './dataText';
import { IssueList } from './IssueList';

const TYPES: Exclude<ColumnType, 'empty'>[] = ['text', 'number', 'integer', 'date', 'boolean'];
const ROLES: ColumnRole[] = ['none', 'date', 'amount', 'quantity', 'category', 'customer', 'product', 'identifier'];

type Mapping = { key: string; source: string; name: string; type: Exclude<ColumnType, 'empty'>; role: ColumnRole; include: boolean };

export function ImportReviewPage() {
  const { uploadId = '' } = useParams();
  const location = useLocation();
  const initial = (location.state as { preview?: UploadPreview } | null)?.preview;
  const fetched = useApiResource<UploadPreview>(initial ? null : `/datasets/uploads/${uploadId}`);
  const preview = initial ?? fetched.data;
  const { t } = usePreferences();

  if (!preview) {
    return (
      <>
        <PageHeader eyebrow={t.data.reviewEyebrow} title={t.data.title} />
        <Card>
          {fetched.error != null ? <ErrorState title={dataErrorMessage(t, fetched.error)} onRetry={fetched.reload} /> : <Skeleton height={160} />}
        </Card>
      </>
    );
  }
  return <Review key={preview.id} preview={preview} />;
}

function Review({ preview }: { preview: UploadPreview }) {
  const { t, lang } = usePreferences();
  const { can } = useAuth();
  const navigate = useNavigate();
  const report = preview.report;
  const [name, setName] = useState(preview.filename.replace(/\.(csv|xlsx)$/i, ''));
  const [mapping, setMapping] = useState<Mapping[]>(() =>
    report.columns.map((c) => ({
      key: c.key,
      source: c.name,
      name: c.name,
      type: c.type === 'empty' ? 'text' : c.type,
      role: c.suggested_role,
      include: c.type !== 'empty',
    })),
  );
  const [busy, setBusy] = useState<'confirm' | 'discard' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canWrite = can('data.write') && preview.status === 'validated';

  const update = (key: string, patch: Partial<Mapping>) => setMapping((m) => m.map((c) => (c.key === key ? { ...c, ...patch } : c)));

  const onConfirm = async (e: FormEvent) => {
    e.preventDefault();
    setBusy('confirm');
    setError(null);
    try {
      const ds = await api<Dataset>(`/datasets/uploads/${preview.id}/confirm`, {
        method: 'POST',
        body: { name, columns: mapping.map(({ key, name: n, type, role, include }) => ({ key, name: n, type, role, include })) },
      });
      navigate(`/data/${ds.id}`, { replace: true, state: { dataset: ds } });
    } catch (err) {
      setError(dataErrorMessage(t, err));
      setBusy(null);
    }
  };

  const onDiscard = async () => {
    setBusy('discard');
    try {
      await api(`/datasets/uploads/${preview.id}`, { method: 'DELETE' });
      navigate('/data', { replace: true });
    } catch (err) {
      setError(dataErrorMessage(t, err));
      setBusy(null);
    }
  };

  const detected = [
    preview.format.toUpperCase(),
    preview.options.delimiter && `${t.data.delimiter}: «${preview.options.delimiter === '\t' ? 'TAB' : preview.options.delimiter}»`,
    preview.options.encoding && `${t.data.encoding}: ${preview.options.encoding === 'cp1252' ? 'Windows-1252' : 'UTF-8'}`,
    preview.options.sheet && `${t.data.sheet}: ${preview.options.sheet}`,
  ].filter(Boolean).join(' · ');

  return (
    <>
      <PageHeader
        eyebrow={<Link to="/data" className="rc-inline-icon"><ArrowLeft size={14} aria-hidden="true" /> {t.data.backToData}</Link>}
        title={preview.filename}
        lead={`${t.data.detected}: ${detected}`}
      />
      <div className="rc-grid rc-grid--2">
        <Card title={t.data.reviewEyebrow} className="rc-span-2">
          <dl className="rc-limits">
            <div><dt>{t.data.rows}</dt><dd className="rc-tabular">{formatNumber(report.row_count, lang)}</dd></div>
            <div><dt>{t.data.columns}</dt><dd className="rc-tabular">{report.column_count}</dd></div>
            <div><dt>{t.data.completeness}</dt><dd className="rc-tabular">{formatPercent(report.completeness, lang, 1)}</dd></div>
            <div><dt>{t.data.issues}</dt><dd className="rc-tabular">{report.issues.length}</dd></div>
          </dl>
          {preview.duplicate_of && (
            <p className="rc-notice rc-notice--warning" role="note">
              <TriangleAlert size={16} aria-hidden="true" />
              <span>{interpolate(t.data.duplicateWarning, { name: preview.duplicate_of.name })}</span>
            </p>
          )}
        </Card>

        <Card title={t.data.issuesTitle} className="rc-span-2">
          <IssueList issues={report.issues} />
          <p className="rc-list__meta">{t.data.limitation}</p>
        </Card>

        <Card title={t.data.mappingTitle} subtitle={t.data.mappingHint} className="rc-span-2">
          <form onSubmit={(e) => void onConfirm(e)} className="rc-form" aria-label={t.data.confirm}>
            <div className="rc-table-wrap">
              <table className="rc-table rc-mapping">
                <thead>
                  <tr>
                    <th scope="col">{t.data.colInclude}</th>
                    <th scope="col">{t.data.colOriginal}</th>
                    <th scope="col">{t.data.colName}</th>
                    <th scope="col">{t.data.colType}</th>
                    <th scope="col">{t.data.colRole}</th>
                    <th scope="col">{t.data.missing}</th>
                  </tr>
                </thead>
                <tbody>
                  {mapping.map((m) => {
                    const col = report.columns.find((c) => c.key === m.key)!;
                    return (
                      <tr key={m.key} className={m.include ? '' : 'is-excluded'}>
                        <td>
                          <input type="checkbox" checked={m.include} disabled={!canWrite} onChange={(e) => update(m.key, { include: e.target.checked })}
                            aria-label={`${t.data.colInclude}: ${m.source}`} className="rc-check" />
                        </td>
                        <td>
                          <span className="rc-list__title">{m.source}</span>
                          <span className="rc-list__meta rc-mapping__examples">{col.examples.join(' · ')}</span>
                        </td>
                        <td>
                          <input className="rc-input rc-input--sm" value={m.name} maxLength={80} required disabled={!canWrite || !m.include}
                            onChange={(e) => update(m.key, { name: e.target.value })} aria-label={`${t.data.colName}: ${m.source}`} />
                        </td>
                        <td>
                          <select className="rc-select" value={m.type} disabled={!canWrite || !m.include} onChange={(e) => update(m.key, { type: e.target.value as Mapping['type'] })}
                            aria-label={`${t.data.colType}: ${m.source}`}>
                            {TYPES.map((x) => <option key={x} value={x}>{t.data.types[x]}</option>)}
                          </select>
                        </td>
                        <td>
                          <select className="rc-select" value={m.role} disabled={!canWrite || !m.include} onChange={(e) => update(m.key, { role: e.target.value as ColumnRole })}
                            aria-label={`${t.data.colRole}: ${m.source}`}>
                            {ROLES.map((x) => <option key={x} value={x}>{t.data.roles[x]}</option>)}
                          </select>
                        </td>
                        <td className="rc-tabular">{col.missing ? formatPercent(col.missing_pct, lang, 1) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="rc-form--inline">
              <div className="rc-field">
                <label className="rc-field__label" htmlFor="dataset-name">{t.data.datasetName}</label>
                <input id="dataset-name" className="rc-input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} disabled={!canWrite} />
              </div>
              <Button type="submit" variant="primary" icon={<Check size={15} />} loading={busy === 'confirm'} disabled={!canWrite || busy !== null}>
                {t.data.confirm}
              </Button>
              <Button type="button" variant="ghost" icon={<X size={15} />} loading={busy === 'discard'} disabled={!canWrite || busy !== null} onClick={() => void onDiscard()}>
                {t.data.discard}
              </Button>
            </div>
            {error && <p className="rc-form__error" role="alert">{error}</p>}
            {!can('data.write') && <p className="rc-list__meta">{t.data.readOnlyNote}</p>}
          </form>
        </Card>

        <Card title={t.data.previewTitle} subtitle={interpolate(t.data.previewHint, { n: preview.preview_rows.length })} className="rc-span-2">
          <div className="rc-table-wrap">
            <table className="rc-table rc-table--data">
              <thead>
                <tr><th scope="col">{t.data.rowLabel}</th>{report.columns.map((c) => <th key={c.key} scope="col">{c.name} <Badge tone="outline">{t.data.types[c.type]}</Badge></th>)}</tr>
              </thead>
              <tbody>
                {preview.preview_rows.map((r, i) => (
                  <tr key={i}><td className="rc-list__meta rc-tabular">{i + 2}</td>{r.map((v, j) => <td key={j}>{v || <span className="rc-null">—</span>}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
