import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { NAV_ITEMS } from '../../app/navigation';
import { renderApp } from '../../test/renderApp';

describe('navigation & shell', () => {
  it('sidebar lists every module', () => {
    renderApp('/');
    const nav = screen.getAllByRole('navigation', { name: 'Navegación principal' })[0]!;
    expect(within(nav).getAllByRole('link')).toHaveLength(NAV_ITEMS.length);
    expect(within(nav).getByRole('link', { name: 'Visión general' })).toHaveAttribute('aria-current', 'page');
  });

  it('every route renders without crashing', () => {
    for (const item of NAV_ITEMS) {
      const { unmount } = renderApp(item.path);
      expect(screen.getAllByRole('heading', { level: 1 }).length).toBeGreaterThan(0);
      unmount();
    }
  });

  it('mobile drawer opens, navigates and closes with Escape', async () => {
    const user = userEvent.setup();
    renderApp('/');
    await user.click(screen.getByRole('button', { name: 'Abrir menú' }));
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
    const box = screen.getByRole('combobox', { name: 'Buscar en la plataforma' });
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
    await user.click(screen.getByRole('button', { name: 'EN' }));
    expect(screen.getByRole('heading', { name: 'Take control of your business' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
    expect(window.localStorage.getItem('rc.lang')).toBe('en');
  });

  it('top-bar panels state honestly that features are pending', async () => {
    const user = userEvent.setup();
    renderApp('/');
    await user.click(screen.getByRole('button', { name: 'Perfil' }));
    expect(screen.getByRole('dialog', { name: 'Perfil' })).toHaveTextContent('Sesión no iniciada');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Perfil' })).not.toBeInTheDocument();
  });

  it('unknown routes show a not-found state', () => {
    renderApp('/does-not-exist');
    expect(screen.getByText('Página no encontrada')).toBeInTheDocument();
  });
});
