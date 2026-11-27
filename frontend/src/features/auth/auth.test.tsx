import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { json, mockApi, session } from '../../test/mockApi';
import { renderApp } from '../../test/renderApp';

const anonymous = { 'GET /api/auth/me': json(401, { error: { code: 'auth.required', message: 'x' } }) };

describe('authentication', () => {
  it('redirects anonymous users to the login page', async () => {
    mockApi(anonymous);
    renderApp('/settings');
    expect(await screen.findByRole('heading', { name: 'Inicia sesión' })).toBeInTheDocument();
  });

  it('logs in and returns to the originally requested page', async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi({ ...anonymous, 'POST /api/auth/login': json(200, session()) });
    renderApp('/agents');
    await user.type(await screen.findByLabelText('Correo electrónico'), 'ana@example.com');
    await user.type(screen.getByLabelText('Contraseña'), 'correct-horse-battery');
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Agentes IA' })).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/auth/login');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ email: 'ana@example.com', password: 'correct-horse-battery' });
  });

  it('shows a generic message for invalid credentials', async () => {
    const user = userEvent.setup();
    mockApi({ ...anonymous, 'POST /api/auth/login': json(401, { error: { code: 'auth.invalid_credentials', message: 'x' } }) });
    renderApp('/login');
    await user.type(await screen.findByLabelText('Correo electrónico'), 'ana@example.com');
    await user.type(screen.getByLabelText('Contraseña'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos.');
  });

  it('register validates password length before calling the API', async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi({ ...anonymous, 'POST /api/auth/register': json(201, session()) });
    renderApp('/register');
    await user.type(await screen.findByLabelText('Nombre completo'), 'Ana López');
    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@example.com');
    await user.type(screen.getByLabelText('Contraseña'), 'short');
    await user.type(screen.getByLabelText('Nombre de tu negocio u organización'), 'Ferretería Ana');
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(screen.getByRole('alert')).toHaveTextContent('al menos 10 caracteres');
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/auth/register')).toBe(false);

    await user.type(screen.getByLabelText('Contraseña'), '-but-longer');
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(await screen.findByRole('heading', { name: 'Pon tu negocio bajo control' })).toBeInTheDocument();
  });

  it('shows an explicit state (with retry) when the API is unreachable', async () => {
    mockApi({ 'GET /api/auth/me': json(502) });
    renderApp('/');
    expect(await screen.findByRole('alert')).toHaveTextContent('No se puede conectar con el servidor');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('technical system status is only in settings, for admins', async () => {
    mockApi({
      'GET /api/auth/me': json(200, session()),
      'GET /api/system/status': json(200, { environment: 'development', database: 'unavailable',
        ai: { provider: 'mock', model: 'template-v1', simulated: true, configured: false, requested: 'mock', note: null },
        google: { missing: ['GOOGLE_OAUTH_CLIENT_ID'], plan_allows: false, dev_override: false },
        billing: { missing: ['BILLING_PROVIDER=stripe'], test_mode: false }, worker: 'inline', security: { cookie_secure: false } }),
      'GET /api/organizations/current/members': json(200, []),
      'GET /api/organizations/current/subscription': json(404, {}),
    });
    renderApp('/settings');
    const dbRow = (await screen.findByText('Base de datos')).closest('div')!;
    expect(dbRow).toHaveTextContent('No disponible');
    expect(screen.getByText('GOOGLE_OAUTH_CLIENT_ID')).toBeInTheDocument();
  });

  it('the dashboard does not show technical system status to users', async () => {
    mockApi({ 'GET /api/auth/me': json(200, session({ role: 'member', permissions: ['org.read', 'data.read'] })) });
    renderApp('/');
    await screen.findByRole('heading', { name: 'Pon tu negocio bajo control' });
    expect(screen.queryByText('Base de datos')).not.toBeInTheDocument();
  });
});
