import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { json, mockApi, SUBSCRIPTION } from '../../test/mockApi';
import { renderApp } from '../../test/renderApp';

const anonymous = { 'GET /api/auth/me': json(401, { error: { code: 'auth.required', message: 'x' } }) };
const PREMIUM = { ...SUBSCRIPTION.plan, code: 'premium', name: 'Premium', price_cents: 40000, max_members: 10, max_active_agents: 10, max_monthly_executions: 2000, max_storage_mb: 1024 };

describe('public pages', () => {
  it('anonymous visitors see the landing page with real plan prices', async () => {
    mockApi({ ...anonymous, 'GET /api/plans': json(200, [PREMIUM, SUBSCRIPTION.plan]) });
    renderApp('/');
    expect(await screen.findByRole('heading', { level: 1, name: /Tu negocio, bajo control/ })).toBeInTheDocument();
    const premium = await screen.findByRole('article', { name: 'Premium' });
    expect(within(premium).getByText(/400/)).toBeInTheDocument();
    expect(within(premium).getByText('Hasta 10 miembros')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Crear cuenta gratis' })[0]).toHaveAttribute('href', '/register');
    expect(screen.getByRole('link', { name: 'Aviso de privacidad' })).toHaveAttribute('href', '/privacy');
  });

  it('legal pages show visible placeholders until the owner details are configured', async () => {
    mockApi({ ...anonymous, 'GET /api/legal': json(200, { entity_name: null, address: null, contact_email: null, updated_on: null, complete: false }) });
    renderApp('/privacy');
    expect(await screen.findByRole('heading', { level: 1, name: 'Aviso de privacidad' })).toBeInTheDocument();
    expect(await screen.findByText(/\[RAZÓN SOCIAL\], con domicilio en \[DOMICILIO\]/)).toBeInTheDocument();
  });

  it('legal pages use the configured owner details', async () => {
    mockApi({ ...anonymous, 'GET /api/legal': json(200, { entity_name: 'Mi Empresa S.A. de C.V.', address: 'Calle 1, CDMX', contact_email: 'privacidad@example.com', updated_on: '2026-11-27', complete: true }) });
    renderApp('/terms');
    expect(await screen.findByText(/servicio ofrecido por Mi Empresa S\.A\. de C\.V\./)).toBeInTheDocument();
    expect(screen.getByText(/privacidad@example\.com/)).toBeInTheDocument();
    expect(screen.queryByText(/\[RAZÓN SOCIAL\]/)).not.toBeInTheDocument();
  });
});
