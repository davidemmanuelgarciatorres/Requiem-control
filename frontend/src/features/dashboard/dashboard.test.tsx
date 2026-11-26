import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../app/auth';
import { mockSignedIn } from '../../test/mockApi';
import { PreferencesProvider } from '../../app/preferences';
import { renderApp } from '../../test/renderApp';
import { DashboardPage } from './DashboardPage';
import { buildDemoDashboard, deriveKpis } from './demoData';

describe('dashboard', () => {
  beforeEach(() => {
    mockSignedIn();
  });

  it('shows onboarding (no fabricated metrics) when there is no data', async () => {
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Pon tu negocio bajo control' })).toBeInTheDocument();
    expect(screen.queryByTestId('demo-banner')).not.toBeInTheDocument();
    expect(document.querySelectorAll('[data-demo-badge]')).toHaveLength(0);
    expect(screen.getByText('Estado del sistema')).toBeInTheDocument();
  });

  it('demo view shows a loading state, then data that is clearly labelled as demo', async () => {
    renderApp('/?view=demo');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByRole('status', { name: 'Cargando…' })).toBeInTheDocument();
    expect(await screen.findByTestId('demo-banner', {}, { timeout: 2000 })).toHaveTextContent('ficticias');
    // Each data panel carries a visible DEMO badge.
    expect(document.querySelectorAll('[data-demo-badge]').length).toBeGreaterThanOrEqual(9);
  });

  it('toggles between onboarding and demo', async () => {
    const user = userEvent.setup();
    renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Ver vista de demostración' }));
    expect(await screen.findByTestId('demo-banner', {}, { timeout: 2000 })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Salir de la demostración' }));
    expect(screen.queryByTestId('demo-banner')).not.toBeInTheDocument();
  });

  it('shows an error state with a working retry', async () => {
    const user = userEvent.setup();
    const loader = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(buildDemoDashboard('es'));
    render(
      <PreferencesProvider initialLang="es">
        <AuthProvider>
          <MemoryRouter initialEntries={['/?view=demo']}>
            <DashboardPage loader={loader} />
          </MemoryRouter>
        </AuthProvider>
      </PreferencesProvider>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el panel');
    await act(() => user.click(screen.getByRole('button', { name: 'Reintentar' })));
    await waitFor(() => expect(screen.getByTestId('demo-banner')).toBeInTheDocument());
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('derives KPIs from the demo series instead of hard-coding them', () => {
    const k = deriveKpis(buildDemoDashboard('es'));
    expect(k.revenue).toBe(254_300 + 236_500 + 241_700 + 232_100);
    expect(k.revenueChange).toBeCloseTo(964_600 / 844_200 - 1, 10);
    expect(k.quality).toBeCloseTo(45_368 / 48_213, 10);
  });

  it('approval and activation actions are disabled, not faked', async () => {
    renderApp('/?view=demo');
    await screen.findByTestId('demo-banner', {}, { timeout: 2000 });
    for (const b of screen.getAllByRole('button', { name: 'Revisar' })) expect(b).toBeDisabled();
  });
});
