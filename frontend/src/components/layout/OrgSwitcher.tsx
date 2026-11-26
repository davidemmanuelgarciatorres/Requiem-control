import { useState, type FormEvent } from 'react';
import { Building2, Check, ChevronDown, Plus } from 'lucide-react';
import { useAuth } from '../../app/auth';
import { usePreferences } from '../../app/preferences';
import { errorMessage } from '../../features/auth/errors';
import { Button } from '../ui/Button';
import { Popover } from '../ui/Popover';

export function OrgSwitcher({ className = 'rc-org-btn' }: { className?: string }) {
  const { t } = usePreferences();
  const { session, switchOrganization, createOrganization } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!session) return null;
  const active = session.active_organization;

  const run = async (fn: () => Promise<void>, close: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      close();
    } catch (e) {
      setError(errorMessage(t, e));
    } finally {
      setBusy(false);
    }
  };

  const onCreate = (e: FormEvent<HTMLFormElement>, close: () => void) => {
    e.preventDefault();
    const form = e.currentTarget;
    const name = String(new FormData(form).get('name') ?? '').trim();
    if (name) void run(async () => { await createOrganization(name); form.reset(); }, close);
  };

  return (
    <Popover
      title={t.org.switchTitle}
      align="start"
      trigger={(p) => (
        <button type="button" className={className} aria-label={`${t.topbar.organization}: ${active?.name ?? t.org.none}`} {...p}>
          <span className="rc-org-btn__avatar"><Building2 size={15} aria-hidden="true" /></span>
          <span className="rc-org-btn__name">{active?.name ?? t.org.none}</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      )}
    >
      {(close) => (<>
      <ul className="rc-org-list">
        {session.memberships.map((m) => {
          const isActive = m.organization.id === active?.id;
          return (
            <li key={m.organization.id}>
              <button type="button" className="rc-org-option" disabled={isActive || busy} aria-current={isActive || undefined}
                onClick={() => void run(() => switchOrganization(m.organization.id), close)}>
                <span>{m.organization.name}<br /><span className="rc-list__meta">{t.org.roles[m.role]}</span></span>
                {isActive && <Check size={15} aria-label={t.org.active} />}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="rc-popover__divider" />
      <form className="rc-form--inline" onSubmit={(e) => onCreate(e, close)} aria-label={t.org.create}>
        <input className="rc-input" name="name" required maxLength={120} placeholder={t.org.createPlaceholder} aria-label={t.org.createPlaceholder} style={{ minHeight: 36, flex: 1 }} />
        <Button type="submit" size="sm" variant="glass" icon={<Plus size={14} />} loading={busy}>{t.org.createSubmit}</Button>
      </form>
      {error && <p className="rc-form__error" role="alert">{error}</p>}
      </>)}
    </Popover>
  );
}
