import { useState } from 'react';
import { ArrowLeft, Download } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';
import type { Language } from '../../app/preferences';
import { usePreferences } from '../../app/preferences';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ErrorState, Skeleton } from '../../components/ui/States';
import { downloadUrl, type ColumnReport, type Dataset, type DatasetColumn, type DatasetRows } from '../../lib/api';
import { formatDate, formatNumber, formatPercent, interpolate } from '../../lib/format';
import { useApiResource } from '../../lib/useApi';
import { PageHeader } from '../modules/PageHeader';
import { dataErrorMessage } from './dataText';
import { IssueList } from './IssueList';

const PAGE = 50;

function formatCell(value: string | number | boolean | null, col: DatasetColumn, lang: Language, yes: string, no: string) {
  if (value === null || value === undefined) return <span className="rc-null">—</span>;
  if (typeof value === 'boolean') return value ? yes : no;
  if (typeof value === 'number') return <span className="rc-tabular">{formatNumber(value, lang)}</span>;
  if (col.type === 'date') return <span className="rc-tabular">{formatDate(new Date(`${value}T00:00:00`), lang, { dateStyle: 'medium' })}</span>;
  return value;
}

function summary(c: ColumnReport, lang: Language): string {
  if (c.stats && typeof c.stats.min === 'number' && typeof c.stats.max === 'number') {
    return `${formatNumber(c.stats.min, lang)} – ${formatNumber(c.stats.max, lang)}${c.stats.sum !== undefined ? ` · Σ ${formatNumber(Math.round(c.stats.sum * 100) / 100, lang)}` : ''}`;
  }
  if (c.stats) return `${c.stats.min} – ${c.stats.max}`;
  if (c.top_values?.length) return c.top_values.slice(0, 3).map((v) => `${v.value} (${v.count})`).join(', ');
  return '';
}

export function DatasetPage() {
  const { datasetId = '' } = useParams();
  const location = useLocation();
  const initial = (location.state as { dataset?: Dataset } | null)?.dataset;
  const fetched = useApiResource<Dataset>(initial ? null : `/datasets/${datasetId}`);
  const ds = initial ?? fetched.data;
  const { t } = usePreferences();
  if (!ds) {
    return (
      <>
        <PageHeader eyebrow={t.data.reportEyebrow} title={t.data.title} />
        <Card>{fetched.error != null ? <ErrorState title={dataErrorMessage(t, fetched.error)} onRetry={fetched.reload} /> : <Skeleton height={160} />}</Card>
      </>
    );
  }
  return <DatasetView ds={ds} />;
}

function DatasetView({ ds }: { ds: Dataset }) {
  const { t, lang } = usePreferences();
  const [offset, setOffset] = useState(0);
  const rows = useApiResource<DatasetRows>(`/datasets/${ds.id}/rows?offset=${offset}&limit=${PAGE}`);
  const r = ds.report;
  const yes = lang === 'es' ? 'Sí' : 'Yes';
  const no = 'No';

  return (
    <>
      <PageHeader
        eyebrow={<Link to="/data" className="rc-inline-icon"><ArrowLeft size={14} aria-hidden="true" /> {t.data.backToData}</Link>}
        title={ds.name}
        aside={downloadUrl(`/datasets/${ds.id}/export.csv`) && (
          <a className="rc-btn rc-btn--glass rc-btn--sm" href={downloadUrl(`/datasets/${ds.id}/export.csv`)!} download>
            <Download size={14} aria-hidden="true" />{t.data.exportCsv}
          </a>
        )}
        lead={`${t.data.source}: ${ds.source_filename ?? '—'} · ${t.data.importedAt} ${formatDate(new Date(ds.created_at), lang, { dateStyle: 'medium', timeStyle: 'short' })}`}
      />
      <div className="rc-grid rc-grid--2">
        <Card title={t.data.reportEyebrow} className="rc-span-2">
          <dl className="rc-limits">
            <div><dt>{t.data.rows}</dt><dd className="rc-tabular">{formatNumber(ds.row_count, lang)}</dd></div>
            <div><dt>{t.data.columns}</dt><dd className="rc-tabular">{ds.column_count}</dd></div>
            <div><dt>{t.data.completeness}</dt><dd className="rc-tabular">{formatPercent(r.completeness, lang, 1)}</dd></div>
            <div><dt>{t.data.issues}</dt><dd className="rc-tabular">{r.issues.length}</dd></div>
          </dl>
        </Card>

        <Card title={t.data.issuesTitle} className="rc-span-2">
          <IssueList issues={r.issues} />
          <p className="rc-list__meta">{t.data.limitation}</p>
        </Card>

        <Card title={t.data.columnsTitle} className="rc-span-2">
          <div className="rc-table-wrap">
            <table className="rc-table">
              <thead>
                <tr>
                  <th scope="col">{t.data.colName}</th><th scope="col">{t.data.colType}</th><th scope="col">{t.data.colRole}</th>
                  <th scope="col">{t.data.completeness}</th><th scope="col">{t.data.distinct}</th><th scope="col">{t.data.summary}</th>
                </tr>
              </thead>
              <tbody>
                {ds.columns.map((c, i) => {
                  const rep = r.columns[i]!;
                  const complete = 1 - rep.missing_pct;
                  return (
                    <tr key={c.key}>
                      <td>
                        <span className="rc-list__title">{c.name}</span>
                        {c.source !== c.name && <span className="rc-list__meta"> ({c.source})</span>}
                        {!!c.conversion_failures && <span className="rc-list__meta rc-warn-text"> · {interpolate(t.data.failures, { n: c.conversion_failures })}</span>}
                      </td>
                      <td><Badge tone="outline">{t.data.types[c.type]}</Badge></td>
                      <td>{c.role !== 'none' ? t.data.roles[c.role] : <span className="rc-null">—</span>}</td>
                      <td>
                        <span className="rc-bar" aria-hidden="true"><span style={{ width: `${complete * 100}%` }} /></span>
                        <span className="rc-tabular">{formatPercent(complete, lang, 1)}</span>
                      </td>
                      <td className="rc-tabular">{formatNumber(rep.distinct, lang)}</td>
                      <td className="rc-list__meta">{summary(rep, lang)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title={t.data.rowsTitle} className="rc-span-2"
          actions={rows.data && <span className="rc-list__meta rc-tabular">{interpolate(t.data.range, { from: formatNumber(offset + 1, lang), to: formatNumber(Math.min(offset + PAGE, rows.data.total), lang), total: formatNumber(rows.data.total, lang) })}</span>}>
          {rows.loading && <Skeleton height={160} />}
          {rows.error != null && <ErrorState title={dataErrorMessage(t, rows.error)} onRetry={rows.reload} />}
          {rows.data && (
            <>
              <div className="rc-table-wrap">
                <table className="rc-table rc-table--data">
                  <thead><tr><th scope="col">{t.data.rowLabel}</th>{ds.columns.map((c) => <th key={c.key} scope="col">{c.name}</th>)}</tr></thead>
                  <tbody>
                    {rows.data.rows.map((row) => (
                      <tr key={row.row_number}>
                        <td className="rc-list__meta rc-tabular">{row.row_number}</td>
                        {ds.columns.map((c) => <td key={c.key}>{formatCell(row.data[c.key] ?? null, c, lang, yes, no)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="rc-row" style={{ justifyContent: 'flex-end' }}>
                <Button size="sm" variant="glass" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>{t.data.prev}</Button>
                <Button size="sm" variant="glass" disabled={offset + PAGE >= rows.data.total} onClick={() => setOffset(offset + PAGE)}>{t.data.next}</Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </>
  );
}
