import { BarChart3, Boxes, CalendarClock, Check, Landmark, Mail, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePreferences } from '../../app/preferences';
import type { Plan } from '../../lib/api';
import { formatCurrency, formatNumber, formatUsdApprox, interpolate } from '../../lib/format';
import { useApiResource } from '../../lib/useApi';
import { PublicLayout } from './PublicLayout';

const FEATURES = [
  { key: 'data', Icon: BarChart3 },
  { key: 'finance', Icon: Landmark },
  { key: 'inventory', Icon: Boxes },
  { key: 'customers', Icon: Users },
  { key: 'email', Icon: Mail },
  { key: 'automations', Icon: CalendarClock },
] as const;

function PlanCard({ plan, featured }: { plan: Plan; featured: boolean }) {
  const { t, lang } = usePreferences();
  const l = t.landing;
  const name = plan.code === 'premium' ? l.premiumName : plan.code === 'free' ? l.freeName : plan.name;
  return (
    <article className={`rc-plan rc-glass${featured ? ' rc-plan--featured' : ''}`} aria-labelledby={`plan-${plan.code}`}>
      <h3 id={`plan-${plan.code}`} className="rc-plan__name">{name}</h3>
      <p className="rc-plan__price">
        <span className="rc-tabular">{plan.price_cents ? formatCurrency(plan.price_cents / 100, lang, plan.currency) : l.freePrice}</span>
        {plan.price_cents > 0 && <span className="rc-plan__per">{l.perMonth}</span>}
      </p>
      {plan.usd_approx_cents ? <p className="rc-plan__usd">{interpolate(l.usdNote, { usd: formatUsdApprox(plan.usd_approx_cents, lang) })}</p> : null}
      <ul className="rc-plan__list">
        <li><Check size={14} aria-hidden="true" />{interpolate(l.planMembers, { n: plan.max_members })}</li>
        <li><Check size={14} aria-hidden="true" />{interpolate(l.planAgents, { n: plan.max_active_agents })}</li>
        <li><Check size={14} aria-hidden="true" />{interpolate(l.planRuns, { n: formatNumber(plan.max_monthly_executions, lang) })}</li>
        <li><Check size={14} aria-hidden="true" />{interpolate(l.planStorage, { n: formatNumber(plan.max_storage_mb, lang) })}</li>
        {plan.code !== 'free' && <li><Check size={14} aria-hidden="true" />{l.planIntegrations}</li>}
      </ul>
      <Link className={`rc-btn ${featured ? 'rc-btn--primary' : 'rc-btn--glass'} rc-btn--lg`} to="/register">{plan.price_cents ? l.ctaPremium : l.ctaFree}</Link>
    </article>
  );
}

export function LandingPage() {
  const { t } = usePreferences();
  const l = t.landing;
  const plans = useApiResource<Plan[]>('/plans');

  return (
    <PublicLayout>
      <section className="rc-lp-hero" aria-labelledby="hero-title">
        <p className="rc-eyebrow">{l.eyebrow}</p>
        <h1 id="hero-title" className="rc-lp-hero__title">{t.auth.heroTitle} <em>{t.auth.heroAccent}</em></h1>
        <p className="rc-lp-hero__lead">{l.lead}</p>
        <div className="rc-row rc-wrap rc-lp-hero__ctas">
          <Link className="rc-btn rc-btn--primary rc-btn--lg" to="/register">{l.ctaStart}</Link>
          <a className="rc-btn rc-btn--glass rc-btn--lg" href="#pricing">{l.ctaPricing}</a>
        </div>
        <p className="rc-list__meta">{l.noCard}</p>
      </section>

      <section className="rc-public__section" aria-labelledby="features-title">
        <h2 id="features-title" className="rc-public__h2">{l.featuresTitle}</h2>
        <div className="rc-feature-grid">
          {FEATURES.map(({ key, Icon }) => (
            <article key={key} className="rc-feature rc-glass">
              <Icon size={20} aria-hidden="true" className="rc-feature__icon" />
              <h3 className="rc-feature__title">{l.features[key].title}</h3>
              <p className="rc-feature__body">{l.features[key].body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="rc-public__section" aria-labelledby="how-title">
        <h2 id="how-title" className="rc-public__h2">{l.howTitle}</h2>
        <ol className="rc-lp-steps">
          {l.steps.map((s, i) => (
            <li key={s.title} className="rc-lp-step rc-glass">
              <span className="rc-lp-step__n" aria-hidden="true">{i + 1}</span>
              <h3 className="rc-feature__title">{s.title}</h3>
              <p className="rc-feature__body">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="rc-public__section" aria-labelledby="trust-title">
        <h2 id="trust-title" className="rc-public__h2"><ShieldCheck size={20} aria-hidden="true" /> {l.trustTitle}</h2>
        <ul className="rc-trust">
          {l.trust.map((x) => <li key={x}><Sparkles size={14} aria-hidden="true" />{x}</li>)}
        </ul>
      </section>

      <section id="pricing" className="rc-public__section" aria-labelledby="pricing-title">
        <h2 id="pricing-title" className="rc-public__h2">{l.pricingTitle}</h2>
        <p className="rc-page-lead">{l.pricingLead}</p>
        {plans.data && (
          <div className="rc-plans">
            {[...plans.data].sort((a, b) => a.price_cents - b.price_cents).map((p) => <PlanCard key={p.code} plan={p} featured={p.price_cents > 0} />)}
          </div>
        )}
        {plans.loading && <p className="rc-list__meta" role="status">{t.common.loading}</p>}
      </section>
    </PublicLayout>
  );
}
