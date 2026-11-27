import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { json, mockSignedIn, session, SUBSCRIPTION } from '../../test/mockApi';
import { renderApp } from '../../test/renderApp';

const FREE = { ...SUBSCRIPTION.plan, features: { ai_tier: 'basic' } };
const PREMIUM = { ...SUBSCRIPTION.plan, code: 'premium', name: 'Premium', price_cents: 40000, max_members: 15, usd_approx_cents: 2200, features: { ai_tier: 'advanced' } };
const SUB = {
  ...SUBSCRIPTION, plan: FREE, usage: { members: 1, active_agents: 1, monthly_executions: 12, storage_mb: 1 },
  tools: { assistant: { used: 45, limit: 50 }, imports: { used: 2, limit: 20 }, exports: { used: 30, limit: 30 } },
};

describe('plans, usage and ranks', () => {
  it('the first page shows the plan, its usage and where to upgrade', async () => {
    mockSignedIn({
      'GET /api/organizations/current/subscription': json(200, SUB),
      'GET /api/plans': json(200, [FREE, PREMIUM]),
    });
    renderApp('/');
    const card = await screen.findByRole('region', { name: 'Tu plan' });
    expect(within(card).getByText('IA básica')).toBeInTheDocument();
    expect(await within(card).findByText(/Premium \$400(\.00)? al mes \(≈ US\$22 USD\)/)).toBeInTheDocument();
    expect(within(card).getByRole('progressbar', { name: 'Preguntas al asistente' })).toHaveAttribute('aria-valuenow', '45');
    expect(within(card).getByRole('link', { name: 'Mejorar a Premium' })).toHaveAttribute('href', '/settings#plan');
  });

  it('premium shows the advanced AI and no upgrade button', async () => {
    mockSignedIn({
      'GET /api/organizations/current/subscription': json(200, { ...SUB, plan: PREMIUM }),
      'GET /api/plans': json(200, [FREE, PREMIUM]),
    });
    renderApp('/');
    const card = await screen.findByRole('region', { name: 'Tu plan' });
    expect(within(card).getByText('IA avanzada')).toBeInTheDocument();
    expect(within(card).queryByRole('link', { name: 'Mejorar a Premium' })).not.toBeInTheDocument();
  });

  it('a co-leader can only assign ranks below their own, and the ranks table explains each one', async () => {
    const user = userEvent.setup();
    mockSignedIn({
      'GET /api/organizations/current/members': json(200, [
        { id: 'm1', user_id: 'u-1', email: 'ana@example.com', full_name: 'Ana', role: 'admin', created_at: '2026-01-01' },
        { id: 'm2', user_id: 'u-2', email: 'beto@example.com', full_name: 'Beto', role: 'admin', created_at: '2026-01-01' },
        { id: 'm3', user_id: 'u-3', email: 'caro@example.com', full_name: 'Caro', role: 'member', created_at: '2026-01-01' },
      ]),
      'GET /api/organizations/current/invitations': json(200, []),
    }, session({ role: 'admin', permissions: ['org.read', 'members.read', 'members.manage'] }));
    renderApp('/settings');
    const caro = await screen.findByLabelText('Rol: Caro');
    const role = screen.getByLabelText('Rol', { selector: 'select#new-member-role' });
    expect(within(role).getAllByRole('option').map((o) => o.textContent)).toEqual(['Encargado', 'Miembro', 'Observador']);
    expect(screen.queryByLabelText('Rol: Beto')).not.toBeInTheDocument(); // otro Colíder: no editable
    expect(within(caro).getAllByRole('option').map((o) => o.textContent)).toEqual(['Encargado', 'Miembro', 'Observador']);
    await user.click(screen.getByText('¿Qué puede hacer cada rango?'));
    expect(screen.getByRole('columnheader', { name: 'Líder' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Pagos y eliminar la organización' })).toBeInTheDocument();
  });

  it('explains when a monthly limit is reached', async () => {
    const user = userEvent.setup();
    mockSignedIn({
      'GET /api/assistant/conversations': json(200, []),
      'POST /api/assistant/messages': json(402, { error: { code: 'plan.limit_reached', message: 'x', tool: 'assistant', limit: 50 } }),
    }, session({ permissions: ['data.read', 'org.read'] }));
    renderApp('/assistant');
    await user.type(await screen.findByLabelText('Escribe tu pregunta…'), 'hola');
    await user.click(screen.getByRole('button', { name: 'Enviar', exact: true } as never));
    expect(await screen.findByRole('alert')).toHaveTextContent('límite mensual de tu plan para «Preguntas al asistente» (50)');
  });
});
