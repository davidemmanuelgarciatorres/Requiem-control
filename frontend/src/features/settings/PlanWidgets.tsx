import { Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../app/auth';
import { usePreferences } from '../../app/preferences';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import type { Plan, SubscriptionInfo } from '../../lib/api';
import { formatCurrency, formatNumber, formatUsdApprox, interpolate } from '../../lib/format';
import { useApiResource } from '../../lib/useApi';

type Meter = { key: string; label: string; used: number; limit: number };

export function aiTierOf(plan: Plan | undefined): 'basic' | 'advanced' {
  return plan?.features?.ai_tier === 'advanced' ? 'advanced' : 'basic';
}

export function meters(sub: SubscriptionInfo, labels: Record<string, string>): Meter[] {
  const l = (k: string) => labels[k] ?? k;
  const p = sub.plan;
  const tool = (k: 'assistant' | 'imports' | 'exports') => sub.tools?.[k];
  const out: Meter[] = [
    { key: 'executions', label: l('executions'), used: sub.usage.monthly_executions ?? 0, limit: p.max_monthly_executions },
  ];
  for (const k of ['assistant', 'imports', 'exports'] as const) {
    const u = tool(k);
    if (u) out.push({ key: k, label: l(k), used: u.used, limit: u.limit });
  }
  out.push({ key: 'agents', label: l('agents'), used: sub.usage.active_agents ?? 0, limit: p.max_active_agents });
  out.push({ key: 'members', label: l('members'), used: sub.usage.members ?? 0, limit: p.max_members });
  return out;
}

/** Barras de uso del mes frente a los límites del plan. */
export function UsageMeters({ items }: { items: Meter[] }) {
  const { lang } = usePreferences();
  return (
    <ul className="rc-usages">
      {items.map((m) => {
        const pct = m.limit > 0 ? Math.min(100, Math.round((m.used / m.limit) * 100)) : 0;
        const tone = pct >= 100 ? 'danger' : pct >= 80 ? 'warning' : 'ok';
        return (
          <li key={m.key} className="rc-usage">
            <span className="rc-usage__label">{m.label}</span>
            <span className="rc-usage__value rc-tabular">{formatNumber(m.used, lang)} / {formatNumber(m.limit, lang)}</span>
            <span className={`rc-usage__bar rc-usage__bar--${tone}`} role="progressbar" aria-label={m.label}
              aria-valuemin={0} aria-valuemax={m.limit} aria-valuenow={Math.min(m.used, m.limit)}>
              <span style={{ width: `${pct}%` }} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Línea de mejora a Premium con su precio real (y referencia en dólares). */
export function UpgradeLine({ premium }: { premium: Plan | undefined }) {
  const { t, lang } = usePreferences();
  if (!premium) return null;
  return (
    <p className="rc-list__meta">
      {interpolate(t.plans.upgradeLine, {
        price: formatCurrency(premium.price_cents / 100, lang, premium.currency),
        usd: premium.usd_approx_cents ? formatUsdApprox(premium.usd_approx_cents, lang) + ' USD' : '',
      }).replace(' ()', '')}
    </p>
  );
}

/** Tarjeta del plan en la primera página: discreta, pero siempre visible para quien ve el plan. */
export function PlanCard() {
  const { t } = usePreferences();
  const { session, can } = useAuth();
  const orgId = session?.active_organization?.id;
  const sub = useApiResource<SubscriptionInfo>(can('billing.read') ? '/organizations/current/subscription' : null, orgId);
  const plans = useApiResource<Plan[]>(can('billing.read') ? '/plans' : null);
  if (!can('billing.read') || !sub.data) return null;
  const s = sub.data;
  const free = s.plan.code === 'free';
  const tier = aiTierOf(s.plan);
  const premium = plans.data?.find((p) => p.code === 'premium');
  const top = meters(s, t.plans.tools as Record<string, string>).filter((m) => ['executions', 'assistant', 'imports'].includes(m.key));
  return (
    <Card className="rc-plan-card" aria-label={t.plans.title} title={<span className="rc-inline-icon"><Sparkles size={16} aria-hidden="true" />{t.plans.title}</span>}
      actions={<Badge tone={free ? 'outline' : 'accent'}>{free ? t.account.free : t.plans.premiumActive}</Badge>}>
      <p className="rc-list__meta">
        {t.plans.aiTitle}: <strong>{tier === 'basic' ? t.plans.aiBasic : t.plans.aiAdvanced}</strong>
      </p>
      <UsageMeters items={top} />
      {free && <UpgradeLine premium={premium} />}
      <div className="rc-row rc-wrap">
        {free && <Link className="rc-btn rc-btn--primary rc-btn--sm" to="/settings#plan">{t.plans.upgrade}</Link>}
        <Link className="rc-btn rc-btn--ghost rc-btn--sm" to="/settings#plan">{t.plans.seePlans}</Link>
      </div>
    </Card>
  );
}
