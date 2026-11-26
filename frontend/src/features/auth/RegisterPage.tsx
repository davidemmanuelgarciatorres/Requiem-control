import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/auth';
import { usePreferences } from '../../app/preferences';
import { Button } from '../../components/ui/Button';
import { interpolate } from '../../lib/format';
import { AuthLayout } from './AuthLayout';
import { errorMessage, PASSWORD_MIN_LENGTH } from './errors';
import { Field } from './Field';

export function RegisterPage() {
  const { t, lang } = usePreferences();
  const { register } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const password = String(data.get('password'));
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(interpolate(t.auth.errors.passwordTooShort, { n: PASSWORD_MIN_LENGTH }));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await register({
        email: String(data.get('email')),
        password,
        full_name: String(data.get('full_name')),
        organization_name: String(data.get('organization_name')),
        preferred_language: lang,
      });
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(t, err));
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title={t.auth.registerTitle}
      subtitle={t.auth.registerSubtitle}
      footer={<>{t.auth.haveAccount} <Link className="rc-link" to="/login">{t.auth.signIn}</Link></>}
    >
      <form className="rc-form" onSubmit={onSubmit}>
        <Field label={t.auth.fullName} name="full_name" autoComplete="name" required maxLength={120} />
        <Field label={t.auth.email} name="email" type="email" autoComplete="email" required maxLength={254} />
        <Field label={t.auth.password} name="password" type="password" autoComplete="new-password" required maxLength={128}
          hint={interpolate(t.auth.passwordHint, { n: PASSWORD_MIN_LENGTH })} />
        <Field label={t.auth.organizationName} name="organization_name" autoComplete="organization" required maxLength={120} />
        {error && <p className="rc-form__error" role="alert">{error}</p>}
        <Button type="submit" variant="primary" size="lg" loading={busy}>{t.auth.submitRegister}</Button>
      </form>
    </AuthLayout>
  );
}
