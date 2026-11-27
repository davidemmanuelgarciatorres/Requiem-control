import { useState } from 'react';
import { MailWarning } from 'lucide-react';
import { useAuth } from '../../app/auth';
import { usePreferences } from '../../app/preferences';
import { errorMessage } from '../../features/auth/errors';
import { api } from '../../lib/api';
import { interpolate } from '../../lib/format';
import { Button } from '../ui/Button';

/** Recordatorio discreto para confirmar el correo (necesario para recuperar la cuenta). */
export function VerifyEmailBanner() {
  const { t } = usePreferences();
  const { session } = useAuth();
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  if (!session || session.user.email_verified !== false) return null;
  const resend = async () => {
    setState('busy');
    setError(null);
    try {
      await api('/auth/email/resend', { method: 'POST' });
      setState('sent');
    } catch (e) {
      setError(errorMessage(t, e));
      setState('idle');
    }
  };
  return (
    <div className="rc-notice rc-notice--warning rc-verify-banner" role="note">
      <MailWarning size={16} aria-hidden="true" />
      <span>{interpolate(t.recovery.unverified, { email: session.user.email })}{error && <> · {error}</>}</span>
      {state === 'sent'
        ? <span role="status" className="rc-list__meta">{t.recovery.resent}</span>
        : <Button size="sm" variant="ghost" loading={state === 'busy'} onClick={() => void resend()}>{t.recovery.resend}</Button>}
    </div>
  );
}
