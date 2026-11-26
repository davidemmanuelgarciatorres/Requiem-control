import { CircleAlert, Info, Upload } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/auth';
import { usePreferences } from '../../app/preferences';
import { AreaChart } from '../../components/charts/AreaChart';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States';
import type { FinanceCategory, FinanceOverview } from '../../lib/api';
import { formatCurrency, formatPercent, interpolate } from '../../lib/format';
import { useApiResource } from '../../lib/useApi';
import { limitationText } from '../agents/aiText';
import { PageHeader } from '../modules/PageHeader';

function Categories({ items, title, other }: { items: FinanceCategory[]; title: string; other: string }) {
  const { lang } = usePreferences();
  if (!items.length) return null;
  return (
    <Card title={title}>
      <ul className="rc-bars">
        {items.map((it) => (
          <li key={it.label}>
            <span className="rc-bars__label">{it.label === '__other__' ? other : it.label}</span>
            <span className="rc-bars__track" aria-hidden="true"><span style={{ width: `${Math.min(1, it.share) * 100}%` }} /></span>
            <span className="rc-tabular rc-bars__value">{formatPercent(it.share, lang, 1)} · {formatCurrency(it.total, lang)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function FinancePage() {
  const { t, lang } = usePreferences();
  const { session } = useAuth();
  const [params, setParams] = useSearchParams();
  const q = new URLSearchParams();
  for (const k of ['dataset_id', 'period_a', 'period_b']) if (params.get(k)) q.set(k, params.get(k)!);
  const res = useApiResource<FinanceOverview>(`/finance/overview${q.size ? `?${q}` : ''}`, session?.active_organization?.id);
  const f = t.finance;
  const o = res.data;
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    if (k === 'dataset_id') { next.delete('period_a'); next.delete('period_b'); }
    setParams(next);
  };
  const money = (v: number) => formatCurrency(v, lang);

  return (
    <>
      <PageHeader eyebrow={f.eyebrow} title={f.title} lead={f.lead} />
      {res.loading && <Card><Skeleton height={240} /></Card>}
      {res.error != null && <Card><ErrorState title={f.loadError} onRetry={res.reload} /></Card>}
      {o && !o.dataset && (
        <Card>
          <EmptyState icon={<Upload size={22} />} title={f.emptyTitle} body={f.emptyBody}
            action={<Link className="rc-btn rc-btn--primary rc-btn--sm" to="/data">{f.goImport}</Link>} />
        </Card>
      )}
      {o?.dataset && o.metrics && o.monthly && (
        <div className="rc-grid rc-grid--2">
          <Card className="rc-span-2" title={f.sourceTitle}
            subtitle={o.source && o.period ? interpolate(f.sourceLine, { dataset: o.source.dataset, amount: o.source.amount, date: o.source.date, from: o.period.from, to: o.period.to }) : undefined}>
            <div className="rc-row rc-wrap">
              <label className="rc-field rc-field--inline">
                <span className="rc-field__label">{f.dataset}</span>
                <select className="rc-input" value={o.dataset.id} onChange={(e) => set('dataset_id', e.target.value)}>
                  {o.datasets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </label>
              {o.periods && o.periods.length >= 2 && o.comparison && (
                <>
                  <label className="rc-field rc-field--inline">
                    <span className="rc-field__label">{f.compare}</span>
                    <select className="rc-input" value={o.comparison.previous} onChange={(e) => set('period_a', e.target.value)}>
                      {o.periods.map((p) => <option key={p}>{p}</option>)}
                    </select>
                  </label>
                  <label className="rc-field rc-field--inline">
                    <span className="rc-field__label">{f.against}</span>
                    <select className="rc-input" value={o.comparison.current} onChange={(e) => set('period_b', e.target.value)}>
                      {o.periods.map((p) => <option key={p}>{p}</option>)}
                    </select>
                  </label>
                </>
              )}
            </div>
            <p className="rc-list__meta rc-inline-icon"><Info size={14} aria-hidden="true" />{f.signNote}</p>
          </Card>

          <Card className="rc-span-2" title={f.metricsTitle}>
            <dl className="rc-limits">
              {o.metrics.map((m) => (
                <div key={m.key}>
                  <dt>{f.metrics[m.key]}</dt>
                  <dd className={`rc-tabular${m.key === 'net' && m.value < 0 ? ' rc-delta--down' : ''}`}>{m.format === 'percent' ? formatPercent(m.value, lang, 1) : money(m.value)}</dd>
                  <dd className="rc-list__meta">{f.formulas[m.key]}{m.rows !== undefined ? ` · ${interpolate(f.rows, { n: m.rows })}` : ''}</dd>
                </div>
              ))}
            </dl>
          </Card>

          {o.monthly.length > 1 && (
            <Card title={f.cumulativeTitle} subtitle={f.cumulativeHint}>
              <AreaChart data={o.monthly.map((m) => ({ label: m.period, value: m.cumulative }))} ariaLabel={f.cumulativeTitle}
                formatValue={money} formatAxis={(v) => formatCurrency(v, lang, 'MXN', true)} tableHeaders={[t.common.period, f.cumulative]} height={220} />
            </Card>
          )}

          {o.comparison && (
            <Card title={interpolate(f.comparisonTitle, { a: o.comparison.previous, b: o.comparison.current })}>
              <div className="rc-table-wrap">
                <table className="rc-table">
                  <thead><tr><th scope="col">{f.metric}</th><th scope="col">{o.comparison.previous}</th><th scope="col">{o.comparison.current}</th><th scope="col">{f.change}</th></tr></thead>
                  <tbody>
                    {o.comparison.metrics.map((m) => {
                      const good = m.key === 'expenses' ? m.delta < 0 : m.delta > 0;
                      return (
                        <tr key={m.key}>
                          <th scope="row">{f.metrics[m.key as 'income']}</th>
                          <td className="rc-tabular">{money(m.previous)}</td>
                          <td className="rc-tabular">{money(m.current)}</td>
                          <td className={`rc-tabular ${m.delta === 0 ? '' : good ? 'rc-delta--up' : 'rc-delta--down'}`}>
                            {m.delta > 0 ? '+' : ''}{money(m.delta)}{m.delta_pct !== null ? ` (${formatPercent(m.delta_pct, lang, 1, true)})` : ''}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <Card className="rc-span-2" title={f.monthlyTitle}>
            <div className="rc-table-wrap">
              <table className="rc-table">
                <thead><tr><th scope="col">{t.common.period}</th><th scope="col">{f.metrics.income}</th><th scope="col">{f.metrics.expenses}</th><th scope="col">{f.metrics.net}</th><th scope="col">{f.cumulative}</th></tr></thead>
                <tbody>
                  {o.monthly.map((m) => (
                    <tr key={m.period}>
                      <th scope="row" className="rc-tabular">{m.period}</th>
                      <td className="rc-tabular">{money(m.income)}</td>
                      <td className="rc-tabular">{money(m.expenses)}</td>
                      <td className={`rc-tabular${m.net < 0 ? ' rc-delta--down' : ''}`}>{money(m.net)}</td>
                      <td className={`rc-tabular${m.cumulative < 0 ? ' rc-delta--down' : ''}`}>{money(m.cumulative)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Categories items={o.expense_categories ?? []} title={interpolate(f.expensesBy, { dimension: o.group_name ?? '' })} other={t.ai.other} />
          <Categories items={o.income_categories ?? []} title={interpolate(f.incomeBy, { dimension: o.group_name ?? '' })} other={t.ai.other} />

          <Card className="rc-span-2" title={f.observationsTitle}>
            {(o.observations ?? []).length === 0 ? <p className="rc-list__meta">{f.noObservations}</p> : (
              <ul className="rc-checklist">
                {o.observations!.map((ob) => (
                  <li key={ob.code}>
                    <Badge tone={ob.severity === 'warning' ? 'warning' : 'outline'}>{t.status[ob.severity === 'warning' ? 'warning' : 'info']}</Badge>
                    {interpolate(f.obs[ob.code], Object.fromEntries(Object.entries(ob.params).map(([k, v]) => [k,
                      Array.isArray(v) ? v.join(', ') : k === 'share' || k === 'pct' ? formatPercent(Number(v), lang, 1) : k === 'value' || k === 'threshold' ? money(Number(v)) : String(v)])))}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {(o.unusual ?? []).length > 0 && (
            <Card className="rc-span-2" title={t.ai.unusualTitle} subtitle={f.unusualHint}>
              <div className="rc-table-wrap">
                <table className="rc-table">
                  <thead><tr><th scope="col">{t.ai.row}</th><th scope="col">{t.data.roles.date}</th><th scope="col">{t.data.roles.amount}</th><th scope="col">{o.group_name ?? ''}</th></tr></thead>
                  <tbody>{o.unusual!.map((u) => <tr key={u.row_number}><td className="rc-tabular">{u.row_number}</td><td className="rc-tabular">{u.date}</td><td className="rc-tabular">{money(u.amount)}</td><td>{u.label ?? '—'}</td></tr>)}</tbody>
                </table>
              </div>
            </Card>
          )}

          <Card className="rc-span-2" title={t.ai.limitationsTitle}>
            <ul className="rc-checklist">
              {(o.limitations ?? []).map((l) => (
                <li key={l.code}><CircleAlert size={14} aria-hidden="true" />{f.lim[l.code as keyof typeof f.lim] ?? limitationText(t, lang, l.code, l.params)}</li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}
