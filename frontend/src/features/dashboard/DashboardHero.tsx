import { Bot, Building2, Eye, Users, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../app/auth';
import { usePreferences } from '../../app/preferences';
import { Button } from '../../components/ui/Button';
import type { Health, SubscriptionInfo } from '../../lib/api';
import { interpolate } from '../../lib/format';
import { IS_DEMO } from '../../lib/env';
import { useApiResource } from '../../lib/useApi';

/**
 * Portada del panel. Los indicadores de la derecha son datos REALES de la
 * organización activa (no de demostración).
 */
export function DashboardHero({ demo, onToggleDemo }: { demo: boolean; onToggleDemo: () => void }) {
  const { t } = usePreferences();
  const { session, can } = useAuth();
  const health = useApiResource<Health>('/health');
  const sub = useApiResource<SubscriptionInfo>(can('billing.read') ? '/organizations/current/subscription' : null, session?.active_organization?.id);
  const h = t.dashboard.hero;
  const firstName = session?.user.full_name.split(' ')[0] ?? '';

  const state = IS_DEMO ? 'demo' : health.loading ? 'checking' : health.data?.status === 'ok' ? 'ok' : 'down';
  const stateLabel = state === 'demo' ? t.demo.chip : state === 'checking' ? h.checking : state === 'ok' ? h.nominal : h.degraded;

  const stats = [
    { icon: Building2, value: String(session?.memberships.length ?? 0), label: h.statOrganizations },
    sub.data && { icon: Users, value: `${sub.data.usage.members ?? 0}/${sub.data.plan.max_members}`, label: h.statMembers },
    sub.data && { icon: Bot, value: `${sub.data.usage.active_agents ?? 0}/${sub.data.plan.max_active_agents}`, label: h.statAgents },
  ].filter(Boolean) as { icon: typeof Bot; value: string; label: string }[];

  return (
    <section className="rc-hero" aria-labelledby="dash-title">
      <div className="rc-hero__copy">
        <p className="rc-chip" data-state={state} role="status">
          {h.statusChip} <span className="rc-dot" aria-hidden="true" /> <strong>{stateLabel}</strong>
        </p>
        <h1 id="dash-title" className="rc-hero__title">
          {h.lines.map((line) => <span key={line}>{line}</span>)}
        </h1>
        <p className="rc-hero__lead">
          {firstName && <>{interpolate(h.hello, { name: firstName })} </>}
          {demo ? t.dashboard.subtitleDemo : t.dashboard.subtitleEmpty}
        </p>
        <div className="rc-hero__actions">
          <Link to="/settings" className="rc-btn rc-btn--primary rc-btn--lg">{h.ctaTeam}</Link>
          <Button variant="glass" size="lg" icon={demo ? <X size={16} /> : <Eye size={16} />} onClick={onToggleDemo}>
            {demo ? t.dashboard.hideDemo : t.dashboard.showDemo}
          </Button>
        </div>
      </div>
      {stats.length > 0 && (
        <ul className="rc-hero__stats">
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <li key={s.label} className="rc-stat">
                <Icon size={18} className="rc-stat__icon" aria-hidden="true" />
                <span className="rc-stat__value rc-tabular">{s.value}</span>
                <span className="rc-stat__label">{s.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
