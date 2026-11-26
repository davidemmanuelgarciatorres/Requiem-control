import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/auth';
import { usePreferences } from '../../app/preferences';
import { Button } from '../../components/ui/Button';
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

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await login(String(data.get('email')), String(data.get('password')));
      const next = (location.state as { from?: string } | null)?.from;
      navigate(next && next.startsWith('/') && !next.startsWith('//') ? next : '/', { replace: true });
    } catch (err) {
      setError(errorMessage(t, err));
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title={t.auth.loginTitle}
      subtitle={t.auth.loginSubtitle}
      footer={<>{t.auth.noAccount} <Link className="rc-link" to="/register">{t.auth.createAccount}</Link></>}
    >
      <form className="rc-form" onSubmit={onSubmit} noValidate={false}>
        <Field label={t.auth.email} name="email" type="email" autoComplete="email" required maxLength={254} />
        <Field label={t.auth.password} name="password" type="password" autoComplete="current-password" required maxLength={128} />
        {error && <p className="rc-form__error" role="alert">{error}</p>}
        <Button type="submit" variant="primary" size="lg" loading={busy}>{t.auth.submitLogin}</Button>
      </form>
    </AuthLayout>
  );
}
