import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { json, mockSignedIn, session, SUBSCRIPTION } from '../../test/mockApi';
import { renderApp } from '../../test/renderApp';

const PERMS = ['org.read', 'billing.read', 'billing.manage', 'members.read'];
const PREMIUM = { code: 'premium', name: 'Premium', price_cents: 40000, currency: 'MXN', interval: 'month', max_active_agents: 6, max_monthly_executions: 2000, max_storage_mb: 2048, max_members: 10 };
const status = (over = {}) => ({ configured: true, test_mode: true, can_manage: true, plan: 'free', status: 'active', current_period_end: null,
  cancel_at_period_end: false, has_customer: false, ...over });
const base = {
  'GET /api/organizations/current/subscription': json(200, SUBSCRIPTION),
  'GET /api/organizations/current/members': json(200, []),
  'GET /api/plans': json(200, [SUBSCRIPTION.plan, PREMIUM]),
};

describe('Billing', () => {
  it('owner upgrades to Premium through Stripe Checkout (redirect)', async () => {
    const user = userEvent.setup();
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    const fetchMock = mockSignedIn({ ...base, 'GET /api/billing/status': json(200, status()),
      'POST /api/billing/checkout': json(200, { url: 'https://checkout.stripe.com/c/cs_1' }) }, session({ permissions: PERMS }));
    renderApp('/settings');
    expect(await screen.findByText('Modo de prueba (sin cobros reales)')).toBeInTheDocument();
    expect(screen.getByText(/nunca ve ni guarda los datos de tu tarjeta/)).toBeInTheDocument();
    const btn = await screen.findByRole("button", { name: /Mejorar a Premium/ });
    expect(btn).toHaveTextContent(/400/);
    await user.click(btn);
    expect(assign).toHaveBeenCalledWith('https://checkout.stripe.com/c/cs_1');
    expect(fetchMock.mock.calls.some(([u, i]) => u === '/api/billing/checkout' && i?.method === 'POST')).toBe(true);
    vi.unstubAllGlobals();
  });

  it('shows renewal, scheduled cancellation and past-due states for Premium', async () => {
    mockSignedIn({ ...base, 'GET /api/billing/status': json(200, status({ plan: 'premium', status: 'past_due', has_customer: true,
      current_period_end: '2026-12-27T00:00:00Z', cancel_at_period_end: true })) }, session({ permissions: PERMS }));
    renderApp('/settings');
    expect(await screen.findByText('Pago pendiente')).toBeInTheDocument();
    expect(screen.getByText(/Premium sigue activo hasta el/)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('no se pudo cobrar');
    expect(screen.getByRole('button', { name: 'Administrar suscripción' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Mejorar a Premium/ })).not.toBeInTheDocument();
  });

  it('without payment configuration users see a plain message, no buttons', async () => {
    mockSignedIn({ ...base, 'GET /api/billing/status': json(200, status({ configured: false })) }, session({ permissions: PERMS }));
    renderApp('/settings');
    expect(await screen.findByText(/Los pagos en línea todavía no están disponibles/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mejorar a Premium/ })).not.toBeInTheDocument();
  });
});
