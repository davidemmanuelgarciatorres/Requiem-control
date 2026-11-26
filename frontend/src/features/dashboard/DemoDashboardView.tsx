import { ArrowDownRight, ArrowUpRight, Bot, CircleAlert, CircleCheck, Info, Play, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePreferences } from '../../app/preferences';
import { AreaChart } from '../../components/charts/AreaChart';
import { Gauge } from '../../components/charts/Gauge';
import { Heatmap } from '../../components/charts/Heatmap';
import { Sparkline } from '../../components/charts/Sparkline';
import { Badge, DemoBadge, type Tone } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ProgressRing } from '../../components/ui/ProgressRing';
import { formatCurrency, formatNumber, formatPercent } from '../../lib/format';
import { deriveKpis, type AgentRunState, type DemoDashboard } from './demoData';

const STATE_TONE: Record<AgentRunState, Tone> = { running: 'success', idle: 'neutral', awaiting: 'warning', failed: 'danger' };
const EVENT_ICON = { success: CircleCheck, warning: TriangleAlert, danger: CircleAlert, info: Info } as const;

function Delta({ value, label, format }: { value: number; label: string; format: (v: number) => string }) {
  const up = value >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="rc-delta">
      <span className={`rc-delta__chip ${up ? 'is-up' : 'is-down'}`}>
        <Icon size={13} aria-hidden="true" />
        <span className="rc-tabular">{format(value)}</span>
      </span>
      <span className="rc-delta__label">{label}</span>
    </span>
  );
}

export function DemoDashboardView({ data }: { data: DemoDashboard }) {
  const { t, lang } = usePreferences();
  const k = deriveKpis(data);
  const money = (v: number) => formatCurrency(v, lang, data.currency);
  const moneyCompact = (v: number) => formatCurrency(v, lang, data.currency, true);
  const pct = (v: number) => formatPercent(v, lang, 1, true);
  const pp = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)} pp`;
  const d = t.dashboard;

  return (
    <>
      <div className="rc-notice rc-notice--warning rc-demo-banner" role="note" data-testid="demo-banner">
        <TriangleAlert size={18} aria-hidden="true" />
        <p><strong>{d.demoBannerTitle}.</strong> {d.demoBannerBody}</p>
      </div>

      <div className="rc-dash" data-demo="true">
        {/* KPI principal */}
        <section className="rc-card rc-highlight rc-dash__highlight" aria-labelledby="kpi-revenue">
          <div className="rc-highlight__copy">
            <div className="rc-highlight__head">
              <h2 id="kpi-revenue" className="rc-highlight__label">{d.kpi.revenue}</h2>
              <DemoBadge />
            </div>
            <p className="rc-highlight__value rc-tabular">{money(k.revenue)}</p>
            <Delta value={k.revenueChange} label={d.kpi.vsPrevious} format={pct} />
            <div className="rc-highlight__cta">
              <Button variant="dark" size="sm" iconEnd={<Play size={13} />} disabled title={t.common.unavailable}>{d.kpi.openDetail}</Button>
            </div>
          </div>
          <ProgressRing value={k.revenueGoalProgress} label={d.kpi.revenueGoal} caption={d.kpi.revenueGoal} tone="dark" />
        </section>

        {/* Agentes */}
        <Card title={d.agents.title} demo className="rc-dash__agents" actions={<Link className="rc-link" to="/agents">{t.common.viewAll}</Link>}>
          <ul className="rc-list">
            {data.agents.map((a) => (
              <li key={a.key} className="rc-list__item">
                <span className="rc-agent-avatar" aria-hidden="true"><Bot size={16} /></span>
                <div className="rc-list__main">
                  <span className="rc-list__title">{t.agents.catalog[a.key].name}</span>
                  <span className="rc-list__meta rc-tabular">{formatNumber(a.tasks, lang)} {d.agents.tasks}</span>
                </div>
                <span className="rc-list__side"><Badge tone={STATE_TONE[a.state]} dot>{d.agents[a.state]}</Badge></span>
              </li>
            ))}
          </ul>
          <div className="rc-events">
            <h3 className="rc-subheading">{d.events.title}</h3>
            <ul className="rc-events__list">
              {data.events.map((e) => {
                const Icon = EVENT_ICON[e.tone];
                return (
                  <li key={e.id} className={`rc-event rc-event--${e.tone}`}>
                    <Icon size={15} aria-label={t.status[e.tone]} />
                    <div>
                      <p>{e.text}</p>
                      <span className="rc-list__meta">{e.time}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </Card>

        {/* Ingresos */}
        <Card title={d.charts.revenueTitle} subtitle={d.charts.revenueSubtitle} demo className="rc-dash__revenue">
          <AreaChart
            data={data.weeklyRevenue}
            ariaLabel={`${d.charts.revenueTitle}, ${d.charts.revenueSubtitle}. ${t.common.demoData}.`}
            formatValue={money}
            formatAxis={moneyCompact}
            tableHeaders={[d.charts.week, d.kpi.revenue]}
          />
        </Card>

        {/* Calidad */}
        <Card title={d.charts.qualityTitle} subtitle={d.charts.qualitySubtitle} demo className="rc-dash__quality">
          <Gauge value={k.quality} label={d.charts.qualityTitle} display={formatPercent(k.quality, lang)} caption={d.charts.qualityValid} />
          <dl className="rc-split-stats">
            <div><dt>{d.charts.qualityValid}</dt><dd className="rc-tabular">{formatNumber(data.records.valid, lang)}</dd></div>
            <div><dt>{d.charts.qualityIssues}</dt><dd className="rc-tabular">{formatNumber(data.records.total - data.records.valid, lang)}</dd></div>
          </dl>
        </Card>

        {/* KPI secundarios */}
        <Card title={d.kpi.expenses} demo className="rc-dash__k1">
          <div className="rc-mini-kpi">
            <div>
              <p className="rc-mini-kpi__value rc-tabular">{money(k.expenses)}</p>
              <Delta value={k.expensesChange} label={d.kpi.vsPrevious} format={pct} />
            </div>
            <Sparkline values={data.expenses} tone="neutral" />
          </div>
        </Card>
        <Card title={d.kpi.margin} demo className="rc-dash__k2">
          <div className="rc-mini-kpi">
            <div>
              <p className="rc-mini-kpi__value rc-tabular">{formatPercent(k.margin, lang)}</p>
              <Delta value={k.marginChange} label={d.kpi.vsPrevious} format={pp} />
            </div>
            <Sparkline values={data.grossMargin} />
          </div>
        </Card>
        <Card title={d.kpi.records} demo className="rc-dash__k3">
          <div className="rc-mini-kpi">
            <div>
              <p className="rc-mini-kpi__value rc-tabular">{formatNumber(data.records.total, lang)}</p>
              <span className="rc-delta__label">{formatPercent(k.quality, lang)} {d.charts.qualityValid}</span>
            </div>
            <Sparkline values={data.activity.map((w) => w.reduce((a, b) => a + b, 0))} />
          </div>
        </Card>

        {/* Recomendaciones explicables */}
        <Card title={d.recommendations.title} demo className="rc-dash__recs">
          <ul className="rc-recs">
            {data.recommendations.map((r) => (
              <li key={r.id} className={`rc-rec rc-rec--${r.severity}`}>
                <p className="rc-rec__detected">{r.detected}</p>
                <dl className="rc-rec__grid">
                  <div><dt>{d.recommendations.evidence}</dt><dd>{r.evidence}</dd></div>
                  <div><dt>{t.common.period}</dt><dd>{r.period}</dd></div>
                  <div><dt>{d.recommendations.why}</dt><dd>{r.why}</dd></div>
                  <div><dt>{d.recommendations.action}</dt><dd>{r.action}</dd></div>
                  <div className="rc-rec__limit"><dt>{d.recommendations.limitations}</dt><dd>{r.limitations}</dd></div>
                </dl>
              </li>
            ))}
          </ul>
        </Card>

        {/* Aprobaciones */}
        <Card title={d.approvals.title} demo className="rc-dash__approvals">
          <ul className="rc-list">
            {data.approvals.map((a) => (
              <li key={a.id} className="rc-list__item rc-approval">
                <div className="rc-list__main">
                  <span className="rc-list__title">{a.title}</span>
                  <span className="rc-list__meta">{a.agent} · {a.prepared}</span>
                </div>
                <Button size="sm" variant="glass" disabled title={d.approvals.reviewDisabled} aria-describedby="approvals-disabled-note">
                  {d.approvals.review}
                </Button>
              </li>
            ))}
          </ul>
          <p id="approvals-disabled-note" className="rc-list__meta">{d.approvals.reviewDisabled}</p>
        </Card>

        {/* Actividad */}
        <Card title={d.charts.activityTitle} subtitle={d.charts.activitySubtitle} demo className="rc-dash__activity">
          <Heatmap
            weeks={data.activity}
            rowLabels={d.charts.weekday}
            ariaLabel={`${d.charts.activityTitle}, ${d.charts.activitySubtitle}. ${t.common.demoData}.`}
            weekLabel={d.charts.week}
            lessLabel={d.charts.less}
            moreLabel={d.charts.more}
          />
        </Card>
      </div>
    </>
  );
}
