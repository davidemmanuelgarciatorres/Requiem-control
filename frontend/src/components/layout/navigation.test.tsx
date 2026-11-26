import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { NAV_ITEMS } from '../../app/navigation';
import { json, mockSignedIn, ORG2, session } from '../../test/mockApi';
import { renderApp } from '../../test/renderApp';

describe('navigation & shell', () => {
  beforeEach(() => {
    mockSignedIn();
  });

  it('sidebar lists every module', async () => {
    renderApp('/');
    const nav = (await screen.findAllByRole('navigation', { name: 'Navegación principal' }))[0]!;
    expect(within(nav).getAllByRole('link')).toHaveLength(NAV_ITEMS.length);
    expect(within(nav).getByRole('link', { name: 'Visión general' })).toHaveAttribute('aria-current', 'page');
  });

  it('every route renders without crashing', async () => {
    for (const item of NAV_ITEMS) {
      const { unmount } = renderApp(item.path);
      expect((await screen.findAllByRole('heading', { level: 1 })).length).toBeGreaterThan(0);
      unmount();
    }
  });

  it('mobile drawer opens, navigates and closes with Escape', async () => {
    const user = userEvent.setup();
    renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Abrir menú' }));
    const drawer = screen.getByRole('dialog', { name: 'Navegación principal' });
    expect(screen.getByRole('button', { name: 'Cerrar menú' })).toHaveFocus();
    await user.click(within(drawer).getByRole('link', { name: /Agentes IA/ }));
    expect(screen.queryByRole('dialog', { name: 'Navegación principal' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Agentes IA' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Abrir menú' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Navegación principal' })).not.toBeInTheDocument();
  });

  it('search filters modules and navigates with the keyboard', async () => {
    const user = userEvent.setup();
    renderApp('/');
    const box = await screen.findByRole('combobox', { name: 'Buscar en la plataforma' });
    await user.type(box, 'report');
    expect(screen.getByRole('option', { name: /Reportes/ })).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('heading', { level: 1, name: 'Reportes' })).toBeInTheDocument();
    await user.type(box, 'zzz');
    expect(screen.getByText('Sin resultados para “zzz”')).toBeInTheDocument();
  });

  it('language switch updates the interface and <html lang>', async () => {
    const user = userEvent.setup();
    renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'EN' }));
    expect(screen.getByRole('heading', { name: 'Take control of your business' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
    expect(window.localStorage.getItem('rc.lang')).toBe('en');
  });

  it('greets the signed-in user and shows them in the profile panel', async () => {
    const user = userEvent.setup();
    renderApp('/');
    expect(await screen.findByRole('heading', { level: 1, name: /, Ana$/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Perfil' }));
    const panel = screen.getByRole('dialog', { name: 'Perfil' });
    expect(panel).toHaveTextContent('ana@example.com');
    expect(panel).toHaveTextContent('Propietario · Ferretería Ana');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Perfil' })).not.toBeInTheDocument();
  });

  it('logout calls the API with the CSRF token and returns to login', async () => {
    const user = userEvent.setup();
    const fetchMock = mockSignedIn({ 'POST /api/auth/logout': json(204) });
    renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Perfil' }));
    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(await screen.findByRole('heading', { name: 'Inicia sesión' })).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([url, init]) => url === '/api/auth/logout' && init?.method === 'POST');
    expect((call?.[1]?.headers as Record<string, string>)['X-CSRF-Token']).toBe('csrf-123');
  });

  it('organization switcher switches via the API', async () => {
    const user = userEvent.setup();
    const fetchMock = mockSignedIn({
      'POST /api/auth/switch-organization': json(200, session({ active_organization: ORG2, role: 'viewer' })),
    });
    renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Organización: Ferretería Ana' }));
    await user.click(screen.getByRole('button', { name: /Segunda/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Organización: Segunda' })).toBeInTheDocument());
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/auth/switch-organization');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ organization_id: 'org-2' });
  });

  it('unknown routes show a not-found state', async () => {
    renderApp('/does-not-exist');
    expect(await screen.findByText('Página no encontrada')).toBeInTheDocument();
  });
});
