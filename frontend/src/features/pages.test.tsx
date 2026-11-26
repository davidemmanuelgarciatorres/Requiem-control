import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { json, MEMBERS, mockSignedIn, session, SUBSCRIPTION } from '../test/mockApi';
import { renderApp } from '../test/renderApp';

const settingsApi = {
  'GET /api/organizations/current/members': json(200, MEMBERS),
  'GET /api/organizations/current/subscription': json(200, SUBSCRIPTION),
};

describe('secondary pages are honest about their state', () => {
  it('integrations: nothing is shown as connected and connect is disabled', async () => {
    mockSignedIn();
    renderApp('/integrations', 'en');
    expect(await screen.findAllByText('Not connected')).toHaveLength(3);
    expect(screen.queryByText(/^Connected$/)).not.toBeInTheDocument();
    for (const b of screen.getAllByRole('button', { name: /Connect/ })) expect(b).toBeDisabled();
  });

  it('planned modules declare they are not operational', async () => {
    mockSignedIn();
    renderApp('/finance', 'en');
    expect(await screen.findByText(/not operational yet/)).toBeInTheDocument();
    expect(screen.getByText('Planned for Phase 4')).toBeInTheDocument();
  });

  it('settings: reduced-motion preference sets data-motion on <html>', async () => {
    mockSignedIn(settingsApi);
    const user = userEvent.setup();
    renderApp('/settings', 'en');
    await user.click(await screen.findByRole('button', { name: 'Reduced' }));
    expect(document.documentElement.dataset.motion).toBe('reduced');
    await user.click(screen.getByRole('button', { name: 'Follow system' }));
    expect(document.documentElement.dataset.motion).toBeUndefined();
  });
});

describe('settings: organization management', () => {
  it('lists members, shows plan limits and adds a member', async () => {
    const user = userEvent.setup();
    const fetchMock = mockSignedIn({
      ...settingsApi,
      'POST /api/organizations/current/members': json(201, { ...MEMBERS[1], id: 'm-3', email: 'caro@example.com' }),
    });
    renderApp('/settings');
    expect(await screen.findByRole('cell', { name: 'beto@example.com' })).toBeInTheDocument();
    expect(await screen.findByText('2 / 3')).toBeInTheDocument(); // miembros / límite del plan gratuito
    expect(screen.getByText('0 / 2')).toBeInTheDocument(); // agentes activos / límite
    await user.type(screen.getByLabelText('Correo del miembro'), 'caro@example.com');
    await user.click(screen.getByRole('button', { name: 'Agregar miembro' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u, i]) => u === '/api/organizations/current/members' && i?.method === 'POST')).toBe(true));
    const call = fetchMock.mock.calls.find(([u, i]) => u === '/api/organizations/current/members' && i?.method === 'POST')!;
    expect(JSON.parse(String(call[1]?.body))).toEqual({ email: 'caro@example.com', role: 'member' });
  });

  it('surfaces server-side plan limits', async () => {
    const user = userEvent.setup();
    mockSignedIn({
      ...settingsApi,
      'POST /api/organizations/current/members': json(402, { error: { code: 'plan.max_members', message: 'Tu plan no permite más miembros.', limit: 3 } }),
    });
    renderApp('/settings');
    await user.type(await screen.findByLabelText('Correo del miembro'), 'x@example.com');
    await user.click(screen.getByRole('button', { name: 'Agregar miembro' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Tu plan no permite más miembros.');
  });

  it('delete requires typing the exact identifier', async () => {
    const user = userEvent.setup();
    mockSignedIn(settingsApi);
    renderApp('/settings');
    const form = await screen.findByRole('form', { name: 'Eliminar organización' });
    const button = within(form).getByRole('button', { name: 'Eliminar definitivamente' });
    expect(button).toBeDisabled();
    await user.type(within(form).getByRole('textbox'), 'ferreteria-ana-abc123');
    expect(button).toBeEnabled();
  });

  it('a viewer sees read-only members and no management controls', async () => {
    mockSignedIn(settingsApi, session({ role: 'viewer', permissions: ['org.read', 'members.read'] }));
    renderApp('/settings');
    expect(await screen.findByRole('cell', { name: 'beto@example.com' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Agregar miembro' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Rol:/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Eliminar organización' })).not.toBeInTheDocument();
    expect(screen.queryByText('Plan y uso')).not.toBeInTheDocument();
  });
});
