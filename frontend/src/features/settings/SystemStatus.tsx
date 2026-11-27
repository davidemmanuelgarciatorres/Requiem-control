import { useAuth } from '../../app/auth';
import { usePreferences } from '../../app/preferences';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/States';
import { useApiResource } from '../../lib/useApi';

type SystemStatusInfo = {
  environment: string;
  database: 'ok' | 'unavailable';
  ai: { provider: string; model: string; simulated: boolean; configured: boolean; requested: string; note: string | null };
  google: { missing: string[]; plan_allows: boolean; dev_override: boolean };
  billing: { missing: string[]; test_mode: boolean };
  worker: 'inline' | 'worker';
  email?: { provider: 'console' | 'smtp' | 'none'; configured: boolean };
  security: { cookie_secure: boolean };
};

/** Avisos técnicos para quien administra la cuenta (propietario/administrador). El usuario final no los ve. */
export function SystemStatus() {
  const { t } = usePreferences();
  const { can, session } = useAuth();
  const s = t.system;
  const res = useApiResource<SystemStatusInfo>(can('org.update') ? '/system/status' : null, session?.active_organization?.id);
  if (!can('org.update')) return null;
  const d = res.data;
  return (
    <Card title={s.title} subtitle={s.subtitle} className="rc-span-2">
      {!d ? <Skeleton height={120} /> : (
        <dl className="rc-status-list">
          <div className="rc-status-list__row">
            <dt>{s.database}</dt>
            <dd><Badge tone={d.database === 'ok' ? 'success' : 'danger'} dot>{d.database === 'ok' ? t.common.operational : s.unavailable}</Badge></dd>
          </div>
          <div className="rc-status-list__row">
            <dt>{s.ai}</dt>
            <dd>
              <Badge tone={d.ai.simulated ? 'warning' : 'success'}>{d.ai.simulated ? s.aiMock : `${d.ai.provider} · ${d.ai.model}`}</Badge>
              <p className="rc-list__meta">{d.ai.simulated ? s.aiMockHint : s.aiRealHint}{d.ai.note ? ` ${d.ai.note}` : ''}</p>
            </dd>
          </div>
          <div className="rc-status-list__row">
            <dt>{s.google}</dt>
            <dd>
              <Badge tone={d.google.missing.length ? 'warning' : 'success'}>{d.google.missing.length ? s.googleMissing : s.googleReady}</Badge>
              {d.google.missing.length > 0 && <p className="rc-list__meta">{s.missingVars}: <code>{d.google.missing.join(', ')}</code></p>}
              {d.google.dev_override && <p className="rc-list__meta">{s.devOverride}</p>}
              {!d.google.plan_allows && <p className="rc-list__meta">{s.planNo}</p>}
            </dd>
          </div>
          <div className="rc-status-list__row">
            <dt>{s.billing}</dt>
            <dd>
              <Badge tone={d.billing.missing.length ? 'warning' : d.billing.test_mode ? 'warning' : 'success'}>
                {d.billing.missing.length ? s.billingMissing : d.billing.test_mode ? s.billingTest : s.billingLive}
              </Badge>
              {d.billing.missing.length > 0 && <p className="rc-list__meta">{s.missingVars}: <code>{d.billing.missing.join(', ')}</code></p>}
            </dd>
          </div>
          <div className="rc-status-list__row">
            <dt>{s.worker}</dt>
            <dd><Badge tone="outline">{d.worker === 'worker' ? s.workerSeparate : s.workerInline}</Badge></dd>
          </div>
          {d.email && (
            <div className="rc-status-list__row">
              <dt>{s.email}</dt>
              <dd>
                <Badge tone={d.email.provider === 'smtp' && d.email.configured ? 'success' : 'warning'}>
                  {d.email.provider === 'smtp' ? (d.email.configured ? s.emailSmtp : s.emailMissing) : d.email.provider === 'console' && d.email.configured ? s.emailConsole : s.emailOff}
                </Badge>
                {!(d.email.provider === 'smtp' && d.email.configured) && <p className="rc-list__meta">{s.emailHint}</p>}
              </dd>
            </div>
          )}
          <div className="rc-status-list__row">
            <dt>{s.environment}</dt>
            <dd>
              <Badge tone="outline">{d.environment}</Badge>
              {!d.security.cookie_secure && d.environment === 'production' && <p className="rc-list__meta">{s.cookieWarn}</p>}
            </dd>
          </div>
        </dl>
      )}
    </Card>
  );
}
