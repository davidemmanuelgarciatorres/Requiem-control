import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { json, mockApi, mockSignedIn, session } from '../../test/mockApi';
import { renderApp } from '../../test/renderApp';

const anonymous = { 'GET /api/auth/me': json(401, { error: { code: 'auth.required', message: 'x' } }) };
const bodyOf = (fetchMock: ReturnType<typeof mockApi>, url: string) =>
  JSON.parse(String(fetchMock.mock.calls.find(([u, init]) => u === url && init?.body)?.[1]?.body));

describe('account recovery and invitations', () => {
  it('login links to password recovery, which never reveals whether the account exists', async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi({ ...anonymous, 'POST /api/auth/password/forgot': json(202, { ok: true }) });
    renderApp('/login');
    await user.click(await screen.findByRole('link', { name: '¿Olvidaste tu contraseña?' }));
    await user.type(await screen.findByLabelText('Correo electrónico'), 'ana@example.com');
    await user.click(screen.getByRole('button', { name: 'Enviar enlace' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Si existe una cuenta con ana@example.com');
    expect(bodyOf(fetchMock, '/api/auth/password/forgot')).toEqual({ email: 'ana@example.com' });
  });

  it('reset checks confirmation, sends the token and handles a used link', async () => {
    const user = userEvent.setup();
    let calls = 0;
    const fetchMock = mockApi({
      ...anonymous,
      'POST /api/auth/password/reset': () => (++calls === 1 ? json(400, { error: { code: 'auth.token_invalid', message: 'x' } }) : json(200, { ok: true }))(),
    });
    renderApp('/reset-password?token=abcdefghijklmnop');
    await user.type(await screen.findByLabelText('Contraseña nueva'), 'una-clave-larga');
    await user.type(screen.getByLabelText('Confirma la contraseña'), 'otra-distinta-xx');
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
    expect(screen.getByRole('alert')).toHaveTextContent('no coinciden');
    expect(fetchMock.mock.calls.some(([u]) => u === '/api/auth/password/reset')).toBe(false);

    await user.clear(screen.getByLabelText('Confirma la contraseña'));
    await user.type(screen.getByLabelText('Confirma la contraseña'), 'una-clave-larga');
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ya se usó o caducó');
    expect(screen.getByRole('link', { name: 'Solicitar un enlace nuevo' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Tu contraseña se actualizó');
    expect(bodyOf(fetchMock, '/api/auth/password/reset')).toEqual({ token: 'abcdefghijklmnop', password: 'una-clave-larga' });
  });

  it('verifies the email exactly once', async () => {
    const fetchMock = mockApi({ ...anonymous, 'POST /api/auth/email/verify': json(200, { ok: true }) });
    renderApp('/verify-email?token=abcdefghijklmnop');
    expect(await screen.findByText('Tu correo quedó confirmado. ¡Gracias!')).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([u]) => u === '/api/auth/email/verify')).toHaveLength(1);
  });

  it('shows the unverified banner and resends the email', async () => {
    const user = userEvent.setup();
    const s = session();
    const fetchMock = mockSignedIn({ 'POST /api/auth/email/resend': json(202, { ok: true }) }, { ...s, user: { ...s.user, email_verified: false } });
    renderApp('/settings');
    expect(await screen.findByText(/Confirma tu correo ana@example.com/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reenviar correo' }));
    expect(await screen.findByText('Correo enviado.')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([u]) => u === '/api/auth/email/resend')).toBe(true);
  });

  it('changes the password from settings', async () => {
    const user = userEvent.setup();
    const fetchMock = mockSignedIn({ 'POST /api/auth/password/change': json(200, { ok: true }) });
    renderApp('/settings');
    await user.type(await screen.findByLabelText('Contraseña actual'), 'vieja-clave-123');
    await user.type(screen.getByLabelText('Contraseña nueva'), 'nueva-clave-123');
    await user.type(screen.getByLabelText('Confirma la contraseña'), 'nueva-clave-123');
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    expect(await screen.findByText('Contraseña actualizada.')).toBeInTheDocument();
    expect(bodyOf(fetchMock, '/api/auth/password/change')).toEqual({ current_password: 'vieja-clave-123', new_password: 'nueva-clave-123' });
  });

  it('invites someone without an account and lists the pending invitation', async () => {
    const user = userEvent.setup();
    let invited = false;
    const fetchMock = mockSignedIn({
      'GET /api/organizations/current/members': json(200, []),
      'POST /api/organizations/current/members': json(404, { error: { code: 'user.not_found', message: 'x' } }),
      'POST /api/organizations/current/invitations': () => { invited = true; return json(201, { id: 'i-1' })(); },
      'GET /api/organizations/current/invitations': () =>
        json(200, invited ? [{ id: 'i-1', email: 'beto@example.com', role: 'member', expires_at: '2030-01-08T00:00:00Z', expired: false }] : [])(),
    });
    renderApp('/settings');
    await user.type(await screen.findByLabelText('Correo del miembro'), 'beto@example.com');
    await user.click(screen.getByRole('button', { name: 'Agregar miembro' }));
    expect(await screen.findByText('Invitación enviada a beto@example.com.')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Cancelar invitación: beto@example.com' })).toBeInTheDocument();
    expect(bodyOf(fetchMock, '/api/organizations/current/invitations')).toEqual({ email: 'beto@example.com', role: 'member' });
  });

  it('a new person registers from the invitation with the invited email', async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi({
      ...anonymous,
      'GET /api/invitations/preview?token=abcdefghijklmnop': json(200, { organization: 'Ferretería', email: 'beto@example.com', expired: false }),
      'POST /api/auth/register': json(201, session()),
    });
    renderApp('/invite?token=abcdefghijklmnop');
    expect(await screen.findByText(/Te invitaron a unirte a Ferretería/)).toBeInTheDocument();
    expect(screen.getByLabelText('Correo electrónico')).toHaveValue('beto@example.com');
    await user.type(screen.getByLabelText('Nombre completo'), 'Beto');
    await user.type(screen.getByLabelText('Contraseña'), 'una-clave-larga');
    await user.click(screen.getByRole('button', { name: 'Crear cuenta y unirme' }));
    await screen.findByRole('heading', { name: 'Pon tu negocio bajo control' });
    expect(bodyOf(fetchMock, '/api/auth/register')).toMatchObject({ email: 'beto@example.com', invite_token: 'abcdefghijklmnop' });
    expect(bodyOf(fetchMock, '/api/auth/register').organization_name).toBeUndefined();
  });

  it('a signed-in user with another email is told to switch account', async () => {
    mockSignedIn({ 'GET /api/invitations/preview?token=abcdefghijklmnop': json(200, { organization: 'Ferretería', email: 'beto@example.com', expired: false }) });
    renderApp('/invite?token=abcdefghijklmnop');
    expect(await screen.findByRole('alert')).toHaveTextContent('Iniciaste sesión como ana@example.com');
  });
});
