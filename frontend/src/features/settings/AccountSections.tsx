import { useEffect, useState, type FormEvent } from 'react';
import { Download, Trash2, UserPlus } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/auth';
import { usePreferences } from '../../app/preferences';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ErrorState, Skeleton } from '../../components/ui/States';
import { api, ApiError, type AuditEntry, type Member, type Plan, type RoleCode, type SessionInfo, type SubscriptionInfo } from '../../lib/api';
import { IS_DEMO } from '../../lib/env';
import { formatCurrency, formatDate, formatNumber, formatUsdApprox, interpolate } from '../../lib/format';
import { useApiResource } from '../../lib/useApi';
import { errorMessage, PASSWORD_MIN_LENGTH } from '../auth/errors';
import { Field } from '../auth/Field';

const ROLES: RoleCode[] = ['owner', 'admin', 'member', 'viewer'];

/** Ejecuta una acción con estado de carga, error y confirmación. */
function useAction() {
  const { t } = usePreferences();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setOk(false);
    try {
      await fn();
      setOk(true);
    } catch (e) {
      setError(errorMessage(t, e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, ok, run };
}

export function AccountSection() {
  const { t } = usePreferences();
  const { session, applySession } = useAuth();
  const action = useAction();
  if (!session) return null;
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const full_name = String(new FormData(e.currentTarget).get('full_name'));
    void action.run(async () => applySession(await api<SessionInfo>('/auth/me', { method: 'PATCH', body: { full_name } })));
  };
  return (
    <Card title={t.account.title} subtitle={session.user.email}>
      <form className="rc-form--inline" onSubmit={onSubmit}>
        <Field label={t.account.name} name="full_name" defaultValue={session.user.full_name} required maxLength={120} />
        <Button type="submit" variant="glass" loading={action.busy}>{t.account.save}</Button>
      </form>
      {action.ok && <p className="rc-form__ok" role="status">{t.account.saved}</p>}
      {action.error && <p className="rc-form__error" role="alert">{action.error}</p>}
    </Card>
  );
}

export function OrganizationSection() {
  const { t } = usePreferences();
  const { session, can, refresh } = useAuth();
  const action = useAction();
  const org = session?.active_organization;
  if (!org) return null;
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get('name'));
    void action.run(async () => {
      await api('/organizations/current', { method: 'PATCH', body: { name } });
      await refresh();
    });
  };
  return (
    <Card title={t.account.orgTitle} subtitle={`${t.account.slug}: ${org.slug}`}>
      <form className="rc-form--inline" onSubmit={onSubmit}>
        <Field label={t.account.orgName} name="name" defaultValue={org.name} required maxLength={120} disabled={!can('org.update')} key={org.id} />
        <Button type="submit" variant="glass" loading={action.busy} disabled={!can('org.update')} title={can('org.update') ? undefined : t.account.noPermission}>
          {t.account.save}
        </Button>
      </form>
      {action.ok && <p className="rc-form__ok" role="status">{t.account.saved}</p>}
      {action.error && <p className="rc-form__error" role="alert">{action.error}</p>}
    </Card>
  );
}

export function PasswordSection() {
  const { t } = usePreferences();
  const r = t.recovery;
  const action = useAction();
  const [mismatch, setMismatch] = useState(false);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const next = String(data.get('new_password'));
    setMismatch(next !== String(data.get('confirm')));
    if (next !== String(data.get('confirm'))) return;
    void action.run(async () => {
      await api('/auth/password/change', { method: 'POST', body: { current_password: data.get('current_password'), new_password: next } });
      form.reset();
    });
  };
  return (
    <Card title={r.changeTitle} subtitle={r.changeSubtitle}>
      <form className="rc-form" onSubmit={onSubmit}>
        <Field label={r.currentPassword} name="current_password" type="password" autoComplete="current-password" required maxLength={128} />
        <Field label={r.newPassword} name="new_password" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN_LENGTH} maxLength={128}
          hint={interpolate(t.auth.passwordHint, { n: PASSWORD_MIN_LENGTH })} />
        <Field label={r.confirmPassword} name="confirm" type="password" autoComplete="new-password" required maxLength={128} />
        <Button type="submit" variant="glass" loading={action.busy}>{r.changeSubmit}</Button>
      </form>
      {action.ok && <p className="rc-form__ok" role="status">{r.changed}</p>}
      {mismatch && <p className="rc-form__error" role="alert">{r.mismatch}</p>}
      {action.error && !mismatch && <p className="rc-form__error" role="alert">{action.error}</p>}
    </Card>
  );
}

type PendingInvite = { id: string; email: string; role: RoleCode; expires_at: string; expired: boolean };

export function MembersSection() {
  const { t, lang } = usePreferences();
  const { session, can } = useAuth();
  const orgId = session?.active_organization?.id ?? '';
  const members = useApiResource<Member[]>(can('members.read') ? '/organizations/current/members' : null, orgId);
  const action = useAction();
  const manage = can('members.manage');
  const invites = useApiResource<PendingInvite[]>(manage ? '/organizations/current/invitations' : null, orgId);
  const [invited, setInvited] = useState<string | null>(null);

  const invite = async (email: string, role: string) => {
    await api('/organizations/current/invitations', { method: 'POST', body: { email, role } });
    setInvited(email);
    invites.reload();
  };
  const onAdd = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const email = String(data.get('email')).trim();
    const role = String(data.get('role'));
    setInvited(null);
    void action.run(async () => {
      try {
        await api('/organizations/current/members', { method: 'POST', body: { email, role } });
        members.reload();
      } catch (err) {
        // Sin cuenta todavía: se le envía una invitación por correo.
        if (!(err instanceof ApiError && err.code === 'user.not_found')) throw err;
        await invite(email, role);
      }
      form.reset();
    });
  };
  const revoke = (id: string) =>
    void action.run(async () => {
      await api(`/organizations/current/invitations/${id}`, { method: 'DELETE' });
      invites.reload();
    });
  const changeRole = (id: string, role: string) =>
    void action.run(async () => {
      await api(`/organizations/current/members/${id}`, { method: 'PATCH', body: { role } });
      members.reload();
    });
  const remove = (id: string) =>
    void action.run(async () => {
      await api(`/organizations/current/members/${id}`, { method: 'DELETE' });
      members.reload();
    });

  return (
    <Card title={t.account.membersTitle} className="rc-span-2">
      {members.loading && <Skeleton height={80} />}
      {members.error != null && <ErrorState title={errorMessage(t, members.error)} onRetry={members.reload} />}
      {members.data && (
        <div className="rc-table-wrap">
          <table className="rc-table">
            <thead><tr><th scope="col">{t.account.name}</th><th scope="col">{t.auth.email}</th><th scope="col">{t.account.role}</th><th scope="col"><span className="sr-only">{t.account.remove}</span></th></tr></thead>
            <tbody>
              {members.data.map((m) => {
                const isMe = m.user_id === session?.user.id;
                return (
                  <tr key={m.id}>
                    <td>{m.full_name}{isMe && <span className="rc-list__meta"> ({t.account.you})</span>}</td>
                    <td>{m.email}</td>
                    <td>
                      {manage ? (
                        <select className="rc-select" value={m.role} aria-label={`${t.account.role}: ${m.full_name}`} disabled={action.busy}
                          onChange={(e) => changeRole(m.id, e.target.value)}>
                          {ROLES.map((r) => <option key={r} value={r}>{t.org.roles[r]}</option>)}
                        </select>
                      ) : <Badge tone="outline">{t.org.roles[m.role]}</Badge>}
                    </td>
                    <td className="rc-table__actions">
                      {manage && !isMe && (
                        <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => remove(m.id)} disabled={action.busy}
                          aria-label={`${t.account.remove}: ${m.full_name}`}>
                          {t.account.remove}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {manage && (
        <form className="rc-form--inline" onSubmit={onAdd} aria-label={t.account.addMember}>
          <Field label={t.account.memberEmail} name="email" type="email" required hint={t.account.addMemberHint} />
          <div className="rc-field" style={{ flex: '0 0 auto' }}>
            <label className="rc-field__label" htmlFor="new-member-role">{t.account.role}</label>
            <select id="new-member-role" name="role" className="rc-select" defaultValue="member" style={{ minHeight: 44 }}>
              {ROLES.filter((r) => r !== 'owner').map((r) => <option key={r} value={r}>{t.org.roles[r]}</option>)}
            </select>
          </div>
          <Button type="submit" variant="primary" icon={<UserPlus size={15} />} loading={action.busy} style={{ marginBottom: 22 }}>
            {t.account.addMember}
          </Button>
        </form>
      )}
      {invited && <p className="rc-form__ok" role="status">{interpolate(t.account.invited, { email: invited })}</p>}
      {action.error && <p className="rc-form__error" role="alert">{action.error}</p>}
      {manage && invites.data && invites.data.length > 0 && (
        <section aria-label={t.account.pendingInvites}>
          <h3 className="rc-field__label">{t.account.pendingInvites}</h3>
          <ul className="rc-list">
            {invites.data.map((i) => (
              <li key={i.id} className="rc-list__item">
                <div className="rc-list__main">
                  <span className="rc-list__title">{i.email}</span>
                  <span className="rc-list__meta">{t.org.roles[i.role]} · {i.expired ? t.account.expired : interpolate(t.account.expiresOn, { date: formatDate(new Date(i.expires_at), lang, { dateStyle: 'medium' }) })}</span>
                </div>
                <Button size="sm" variant="ghost" disabled={action.busy} onClick={() => void action.run(async () => { setInvited(null); await invite(i.email, i.role); })}>{t.account.resendInvite}</Button>
                <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} disabled={action.busy} onClick={() => revoke(i.id)} aria-label={`${t.account.revoke}: ${i.email}`}>
                  {t.account.revoke}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Card>
  );
}

export function PlanSection() {
  const { t, lang } = usePreferences();
  const { session, can } = useAuth();
  const sub = useApiResource<SubscriptionInfo>(can('billing.read') ? '/organizations/current/subscription' : null, session?.active_organization?.id);
  if (!can('billing.read')) return null;
  const p = sub.data?.plan;
  return (
    <Card title={t.account.planTitle}
      actions={p && <Badge tone={p.code === 'free' ? 'outline' : 'accent'}>{p.code === 'free' ? t.account.free : `${formatCurrency(p.price_cents / 100, lang, p.currency)} ${t.account.perMonth}`}</Badge>}>
      {sub.loading && <Skeleton height={80} />}
      {sub.error != null && <ErrorState title={errorMessage(t, sub.error)} onRetry={sub.reload} />}
      {p && sub.data && (
        <>
          <p className="rc-card__title">{p.name}</p>
          <dl className="rc-limits">
            <div><dt>{t.account.limitMembers}</dt><dd className="rc-tabular">{sub.data.usage.members ?? 0} / {p.max_members}</dd></div>
            <div><dt>{t.account.limitAgents}</dt><dd className="rc-tabular">{sub.data.usage.active_agents ?? 0} / {p.max_active_agents}</dd></div>
            <div><dt>{t.account.limitExecutions}</dt><dd className="rc-tabular">{formatNumber(p.max_monthly_executions, lang)}</dd></div>
            <div><dt>{t.account.limitStorage}</dt><dd className="rc-tabular">{formatNumber(p.max_storage_mb, lang)} MB</dd></div>
          </dl>
          <BillingActions />
        </>
      )}
    </Card>
  );
}

type BillingStatus = {
  configured: boolean; test_mode: boolean; can_manage: boolean; plan: string;
  status: 'active' | 'trialing' | 'past_due' | 'canceled'; current_period_end: string | null;
  cancel_at_period_end: boolean; has_customer: boolean;
};

/** Suscribirse a Premium o administrar la suscripción. El pago ocurre en la página segura de Stripe. */
function BillingActions() {
  const { t, lang } = usePreferences();
  const b = t.billing;
  const { session } = useAuth();
  const [params] = useSearchParams();
  const returned = params.get('billing');
  const st = useApiResource<BillingStatus>('/billing/status', session?.active_organization?.id);
  const plans = useApiResource<Plan[]>('/plans');
  const [busy, setBusy] = useState<'checkout' | 'portal' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { reload } = st;
  // Tras pagar, el cambio de plan llega por el webhook de Stripe: se consulta unas veces.
  useEffect(() => {
    if (returned !== 'success') return;
    const id = window.setInterval(reload, 3000);
    const stop = window.setTimeout(() => window.clearInterval(id), 30000);
    return () => { window.clearInterval(id); window.clearTimeout(stop); };
  }, [returned, reload]);
  const d = st.data;
  if (!d) return null;
  const premium = plans.data?.find((p) => p.code === 'premium');
  const go = async (kind: 'checkout' | 'portal') => {
    setBusy(kind);
    setError(null);
    try {
      const r = await api<{ url: string }>(`/billing/${kind}`, { method: 'POST' });
      window.location.assign(r.url);
    } catch (e) {
      setError(errorMessage(t, e));
      setBusy(null);
    }
  };
  return (
    <div className="rc-billing">
      {returned === 'success' && d.plan !== 'premium' && <p className="rc-notice" role="status">{b.confirming}</p>}
      {returned === 'success' && d.plan === 'premium' && <p className="rc-notice" role="status">{b.thanks}</p>}
      {returned === 'cancel' && <p className="rc-list__meta" role="status">{b.cancelled}</p>}
      {d.plan === 'premium' && (
        <div className="rc-row rc-wrap">
          <Badge tone={d.status === 'past_due' ? 'warning' : 'success'} dot>{b.status[d.status]}</Badge>
          {d.current_period_end && (
            <span className="rc-list__meta">
              {interpolate(d.cancel_at_period_end ? b.endsOn : b.renewsOn, { date: formatDate(new Date(d.current_period_end), lang, { dateStyle: 'long' }) })}
            </span>
          )}
        </div>
      )}
      {d.status === 'past_due' && <p className="rc-notice rc-notice--warning" role="alert">{b.pastDue}</p>}
      {!d.configured && <p className="rc-list__meta">{t.account.billingDisabled}</p>}
      {d.configured && d.can_manage && (
        <div className="rc-row rc-wrap">
          {d.plan !== 'premium' && premium && (
            <Button variant="primary" loading={busy === 'checkout'} disabled={busy !== null} onClick={() => void go('checkout')}>
              {interpolate(b.upgrade, { price: formatCurrency(premium.price_cents / 100, lang, premium.currency) })}
            </Button>
          )}
          {d.has_customer && (
            <Button variant="glass" loading={busy === 'portal'} disabled={busy !== null} onClick={() => void go('portal')}>{b.manage}</Button>
          )}
          {d.test_mode && <Badge tone="warning">{b.testMode}</Badge>}
        </div>
      )}
      {d.configured && !d.can_manage && d.plan !== 'premium' && <p className="rc-list__meta">{b.askOwner}</p>}
      {d.plan !== 'premium' && premium && (
        <p className="rc-list__meta">
          {premium.usd_approx_cents ? <>{interpolate(t.landing.usdNote, { usd: formatUsdApprox(premium.usd_approx_cents, lang) })}. </> : null}
          {interpolate(b.premiumIncludes, { members: premium.max_members, agents: premium.max_active_agents, runs: formatNumber(premium.max_monthly_executions, lang), storage: formatNumber(premium.max_storage_mb, lang) })}
        </p>
      )}
      {d.configured && <p className="rc-list__meta">{b.secureNote}</p>}
      {error && <p className="rc-form__error" role="alert">{error}</p>}
    </div>
  );
}

export function AuditSection() {
  const { t, lang } = usePreferences();
  const { session, can } = useAuth();
  const logs = useApiResource<AuditEntry[]>(can('audit.read') ? '/organizations/current/audit-logs?limit=8' : null, session?.active_organization?.id);
  if (!can('audit.read')) return null;
  return (
    <Card title={t.account.auditTitle}>
      {logs.loading && <Skeleton height={80} />}
      {logs.data && logs.data.length === 0 && <p className="rc-list__meta">{t.account.auditEmpty}</p>}
      {logs.data && logs.data.length > 0 && (
        <ul className="rc-events__list">
          {logs.data.map((l) => (
            <li key={l.id} className="rc-event">
              <div><p><code>{l.action}</code></p><span className="rc-list__meta">{formatDate(new Date(l.created_at), lang, { dateStyle: 'medium', timeStyle: 'short' })}</span></div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function DataSection() {
  const { t } = usePreferences();
  const { session, can, refresh } = useAuth();
  const navigate = useNavigate();
  const action = useAction();
  const [confirm, setConfirm] = useState('');
  const org = session?.active_organization;
  if (!org || (!can('org.export') && !can('org.delete'))) return null;

  const onExport = () =>
    void action.run(async () => {
      if (IS_DEMO) throw new ApiError(0, 'demo.export_unavailable', t.demo.exportUnavailable);
      const data = await api<unknown>('/organizations/current/export');
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${org.slug}-export.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  const onDelete = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void action.run(async () => {
      await api('/organizations/current', { method: 'DELETE', body: { confirm_slug: confirm } });
      await refresh();
      navigate('/');
    });
  };

  return (
    <Card title={t.account.dataTitle} className="rc-span-2 rc-danger-zone">
      {can('org.export') && (
        <div className="rc-row" style={{ justifyContent: 'space-between' }}>
          <p className="rc-list__meta">{t.account.exportHint}</p>
          <Button variant="glass" icon={<Download size={15} />} onClick={onExport} loading={action.busy}>{t.account.export}</Button>
        </div>
      )}
      {can('org.delete') && (
        <form className="rc-form--inline" onSubmit={onDelete} aria-label={t.account.deleteOrg}>
          <Field label={interpolate(t.account.deleteConfirm, { slug: org.slug })} hint={t.account.deleteHint} value={confirm}
            onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          <Button type="submit" variant="danger" icon={<Trash2 size={15} />} disabled={confirm !== org.slug} loading={action.busy} style={{ marginBottom: 22 }}>
            {t.account.deleteSubmit}
          </Button>
        </form>
      )}
      {action.error && <p className="rc-form__error" role="alert">{action.error}</p>}
    </Card>
  );
}
