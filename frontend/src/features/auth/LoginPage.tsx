import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/auth';
import { usePreferences } from '../../app/preferences';
import { Button } from '../../components/ui/Button';
import { IS_DEMO } from '../../lib/env';
import { AuthLayout } from './AuthLayout';
import { errorMessage } from './errors';
import { Field } from './Field';

export function LoginPage() {
  const { t } = usePreferences();
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signIn = async (email: string, password: string) => {
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      const next = (location.state as { from?: string } | null)?.from;
      navigate(next && next.startsWith('/') && !next.startsWith('//') ? next : '/', { replace: true });
    } catch (err) {
      setError(errorMessage(t, err));
      setBusy(false);
    }
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    void signIn(String(data.get('email')), String(data.get('password')));
  };

  const signInWithDemo = async () => {
    if (__DEMO__) {
      const { DEMO_EMAIL, DEMO_PASSWORD } = await import('../../lib/demoApi');
      await signIn(DEMO_EMAIL, DEMO_PASSWORD);
    }
  };

  return (
    <AuthLayout
      title={t.auth.loginTitle}
      subtitle={t.auth.loginSubtitle}
      footer={<>{t.auth.noAccount} <Link className="rc-link" to="/register">{t.auth.createAccount}</Link></>}
    >
      {IS_DEMO && (
        <div className="rc-demo-creds">
          <p className="rc-field__label">{t.demo.creds}</p>
          <p className="rc-list__meta">demo@requiem.mx · requiem-demo</p>
          <Button variant="primary" onClick={() => void signInWithDemo()} loading={busy}>{t.demo.useDemo}</Button>
        </div>
      )}
      <form className="rc-form" onSubmit={onSubmit} noValidate={false}>
        <Field label={t.auth.email} name="email" type="email" autoComplete="email" required maxLength={254} />
        <Field label={t.auth.password} name="password" type="password" autoComplete="current-password" required maxLength={128} />
        {!IS_DEMO && <Link className="rc-link rc-auth__forgot" to="/forgot-password">{t.recovery.forgotLink}</Link>}
        {error && <p className="rc-form__error" role="alert">{error}</p>}
        <Button type="submit" variant="primary" size="lg" loading={busy}>{t.auth.submitLogin}</Button>
      </form>
    </AuthLayout>
  );
}
