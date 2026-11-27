import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MailCheck } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/auth';
import { usePreferences } from '../../app/preferences';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/States';
import { api } from '../../lib/api';
import { interpolate } from '../../lib/format';
import { AuthLayout } from './AuthLayout';
import { errorMessage, PASSWORD_MIN_LENGTH } from './errors';
import { Field } from './Field';
import { AcceptTerms } from './AcceptTerms';

function BackToLogin() {
  const { t } = usePreferences();
  return <Link className="rc-link" to="/login">{t.recovery.backToLogin}</Link>;
}

/** Solicitud de enlace: la respuesta es idéntica exista o no la cuenta (no revela correos registrados). */
export function ForgotPasswordPage() {
  const { t } = usePreferences();
  const r = t.recovery;
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get('email')).trim();
    setBusy(true);
    setError(null);
    try {
      await api('/auth/password/forgot', { method: 'POST', body: { email } });
      setSent(email);
    } catch (err) {
      setError(errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title={r.forgotTitle} subtitle={r.forgotSubtitle} footer={<BackToLogin />}>
      {sent ? (
        <p className="rc-notice" role="status"><MailCheck size={16} aria-hidden="true" /><span>{interpolate(r.forgotSent, { email: sent })}</span></p>
      ) : (
        <form className="rc-form" onSubmit={(e) => void onSubmit(e)}>
          <Field label={t.auth.email} name="email" type="email" autoComplete="email" required maxLength={254} />
          {error && <p className="rc-form__error" role="alert">{error}</p>}
          <Button type="submit" variant="primary" size="lg" loading={busy}>{r.forgotSubmit}</Button>
        </form>
      )}
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const { t } = usePreferences();
  const r = t.recovery;
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const password = String(data.get('password'));
    if (password.length < PASSWORD_MIN_LENGTH) return setError(interpolate(t.auth.errors.passwordTooShort, { n: PASSWORD_MIN_LENGTH }));
    if (password !== String(data.get('confirm'))) return setError(r.mismatch);
    setBusy(true);
    setError(null);
    try {
      await api('/auth/password/reset', { method: 'POST', body: { token, password } });
      setDone(true);
    } catch (err) {
      setError(errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title={r.resetTitle} subtitle={r.resetSubtitle} footer={<BackToLogin />}>
      {!token ? (
        <p className="rc-form__error" role="alert">{r.missingToken} <Link className="rc-link" to="/forgot-password">{r.requestNew}</Link></p>
      ) : done ? (
        <>
          <p className="rc-notice" role="status"><MailCheck size={16} aria-hidden="true" /><span>{r.resetDone}</span></p>
          <Link className="rc-btn rc-btn--primary rc-btn--lg" to="/login">{t.auth.signIn}</Link>
        </>
      ) : (
        <form className="rc-form" onSubmit={(e) => void onSubmit(e)}>
          <Field label={r.newPassword} name="password" type="password" autoComplete="new-password" required maxLength={128}
            hint={interpolate(t.auth.passwordHint, { n: PASSWORD_MIN_LENGTH })} />
          <Field label={r.confirmPassword} name="confirm" type="password" autoComplete="new-password" required maxLength={128} />
          {error && (
            <p className="rc-form__error" role="alert">{error}{' '}
              {error === r.errors.tokenInvalid && <Link className="rc-link" to="/forgot-password">{r.requestNew}</Link>}</p>
          )}
          <Button type="submit" variant="primary" size="lg" loading={busy}>{r.resetSubmit}</Button>
        </form>
      )}
    </AuthLayout>
  );
}

export function VerifyEmailPage() {
  const { t } = usePreferences();
  const r = t.recovery;
  const { session, refresh } = useAuth();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [status, setStatus] = useState<'working' | 'ok' | 'error'>(token ? 'working' : 'error');
  const [error, setError] = useState<string>(token ? '' : r.missingToken);
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true; // el token es de un solo uso: no repetir en el doble montaje de desarrollo
    api('/auth/email/verify', { method: 'POST', body: { token } })
      .then(() => {
        setStatus('ok');
        if (session) void refresh();
      })
      .catch((e: unknown) => {
        setStatus('error');
        setError(errorMessage(t, e));
      });
  }, [token, session, refresh, t]);

  return (
    <AuthLayout title={r.verifyTitle} subtitle="" footer={session ? null : <BackToLogin />}>
      {status === 'working' && <p role="status">{r.verifying}</p>}
      {status === 'ok' && (
        <>
          <p className="rc-notice" role="status"><MailCheck size={16} aria-hidden="true" /><span>{r.verified}</span></p>
          <Link className="rc-btn rc-btn--primary rc-btn--lg" to={session ? '/' : '/login'}>{r.continue}</Link>
        </>
      )}
      {status === 'error' && <p className="rc-form__error" role="alert">{error}</p>}
    </AuthLayout>
  );
}

type InvitePreview = { organization: string; email: string; expired: boolean };

export function InvitePage() {
  const { t, lang } = usePreferences();
  const r = t.recovery;
  const { state, session, register, refresh } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [info, setInfo] = useState<InvitePreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(token ? null : r.missingToken);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api<InvitePreview>(`/invitations/preview?token=${encodeURIComponent(token)}`)
      .then(setInfo)
      .catch((e: unknown) => setLoadError(errorMessage(t, e)));
  }, [token, t]);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/invitations/accept', { method: 'POST', body: { token } });
      await refresh();
      navigate('/', { replace: true });
    } catch (e) {
      setError(errorMessage(t, e));
      setBusy(false);
    }
  };

  const onRegister = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!info) return;
    const data = new FormData(e.currentTarget);
    const password = String(data.get('password'));
    if (password.length < PASSWORD_MIN_LENGTH) return setError(interpolate(t.auth.errors.passwordTooShort, { n: PASSWORD_MIN_LENGTH }));
    setBusy(true);
    setError(null);
    try {
      await register({ email: info.email, password, full_name: String(data.get('full_name')), invite_token: token, preferred_language: lang });
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(t, err));
      setBusy(false);
    }
  };

  const sameEmail = session && info && session.user.email.toLowerCase() === info.email.toLowerCase();

  return (
    <AuthLayout title={r.inviteTitle} subtitle={info ? interpolate(r.inviteBody, { org: info.organization, email: info.email }) : ''}
      footer={!session && info ? <>{r.inviteHaveAccount} <Link className="rc-link" to="/login" state={{ from: `/invite?token=${token}` }}>{t.auth.signIn}</Link></> : null}>
      {loadError && <p className="rc-form__error" role="alert">{loadError}</p>}
      {!loadError && (!info || state.status === 'loading') && <div role="status" aria-label={r.inviteLoading}><Skeleton height={120} /></div>}
      {info && state.status !== 'loading' && session && (
        sameEmail ? (
          <div className="rc-form">
            {error && <p className="rc-form__error" role="alert">{error}</p>}
            <Button variant="primary" size="lg" loading={busy} onClick={() => void accept()}>{interpolate(r.inviteAccept, { org: info.organization })}</Button>
          </div>
        ) : (
          <p className="rc-notice rc-notice--warning" role="alert"><span>{interpolate(r.inviteWrongAccount, { current: session.user.email, email: info.email })}</span></p>
        )
      )}
      {info && state.status !== 'loading' && !session && (
        <form className="rc-form" onSubmit={(e) => void onRegister(e)} aria-label={r.inviteRegister}>
          <Field label={t.auth.email} name="email" type="email" value={info.email} readOnly />
          <Field label={t.auth.fullName} name="full_name" autoComplete="name" required maxLength={120} />
          <Field label={t.auth.password} name="password" type="password" autoComplete="new-password" required maxLength={128}
            hint={interpolate(t.auth.passwordHint, { n: PASSWORD_MIN_LENGTH })} />
          {error && <p className="rc-form__error" role="alert">{error}</p>}
          <Button type="submit" variant="primary" size="lg" loading={busy}>{r.inviteRegisterSubmit}</Button>
          <AcceptTerms />
        </form>
      )}
    </AuthLayout>
  );
}
