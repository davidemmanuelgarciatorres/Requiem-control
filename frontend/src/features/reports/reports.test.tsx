import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { DashboardSummary, Execution, Report } from '../../lib/api';
import { json, mockSignedIn, session } from '../../test/mockApi';
import { renderApp } from '../../test/renderApp';

const PERMS = ['org.read', 'data.read', 'data.write', 'agents.run', 'billing.read'];
const metrics = [
  { key: 'total', value: 1500, format: 'currency' as const },
  { key: 'transactions', value: 12, format: 'number' as const },
];
const REPORT: Report = {
  id: 'rep-2', title: 'Análisis financiero · Ventas', agent_id: 'financial-analyst', dataset_id: 'ds-1',
  period_from: '2026-10-01', period_to: '2026-11-06', created_at: '2026-11-26T10:00:00Z',
  content: {
    organization: 'Ferretería Ana', agent_id: 'financial-analyst', agent_version: '1.0.0',
    sources: [{ type: 'dataset', id: 'ds-1', name: 'Ventas', rows: 17 }], metrics,
    recommendations: [], limitations: [{ code: 'dataset_only', params: {} }],
    summary: { text: 'Resumen simulado.', provider: 'mock', model: 'template-v1', simulated: true },
    generated_by: { provider: 'mock', simulated: true }, execution: { id: 'ex-1', completed_at: null },
  },
  comparison: {
    previous_id: 'rep-1', previous_title: 'Octubre', previous_created_at: '2026-11-01T00:00:00Z',
    previous_period: { from: '2026-10-01', to: '2026-10-31' },
    metrics: [{ key: 'total', format: 'currency', current: 1500, previous: 1000, delta: 500, delta_pct: 0.5 }],
  },
};

describe('Reports', () => {
  it('lists reports and shows an honest empty state', async () => {
    mockSignedIn({ 'GET /api/reports': json(200, []) }, session({ permissions: PERMS }));
    renderApp('/reports');
    expect(await screen.findByText('Todavía no hay reportes')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a Agentes' })).toHaveAttribute('href', '/agents');
  });

  it('shows the report with comparison, CSV export and print', async () => {
    const user = userEvent.setup();
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    mockSignedIn({ 'GET /api/reports/rep-2': json(200, REPORT) }, session({ permissions: PERMS }));
    renderApp('/reports/rep-2');
    expect(await screen.findByRole('heading', { name: 'Análisis financiero · Ventas' })).toBeInTheDocument();
    const table = screen.getByRole('table');
    const row = within(table).getByRole('row', { name: /Total/ });
    expect(row).toHaveTextContent('+50.0');
    expect(screen.getByText(/Frente a “Octubre”/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Exportar CSV' })).toHaveAttribute('href', '/api/reports/rep-2/export.csv');
    expect(screen.getAllByText('Simulado · sin IA real').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Imprimir / PDF' }));
    expect(print).toHaveBeenCalled();
  });

  it('deletes a report after confirmation', async () => {
    const user = userEvent.setup();
    const fetchMock = mockSignedIn({
      'GET /api/reports/rep-2': json(200, { ...REPORT, comparison: null }),
      'DELETE /api/reports/rep-2': json(204),
      'GET /api/reports': json(200, []),
    }, session({ permissions: PERMS }));
    renderApp('/reports/rep-2');
    expect(await screen.findByText(/primer reporte de este agente/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Eliminar reporte' }));
    const alert = screen.getByRole('alert');
    await user.click(within(alert).getByRole('button', { name: 'Eliminar reporte' }));
    expect(await screen.findByText('Todavía no hay reportes')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([u, i]) => String(u) === '/api/reports/rep-2' && i?.method === 'DELETE')).toBe(true);
  });

  it('generates a report from a completed execution', async () => {
    const user = userEvent.setup();
    const ex: Execution = {
      id: 'ex-1', agent_id: 'financial-analyst', agent_version: '1.0.0', status: 'completed', input: { dataset_id: 'ds-1' },
      error: null, created_at: '2026-11-26T10:00:00Z', queued_at: null, started_at: null, completed_at: '2026-11-26T10:00:01Z',
      usage: { provider: 'mock', simulated: true }, approvals: [],
      output: { dataset: { id: 'ds-1', name: 'Ventas', row_count: 17 }, period: null, metrics, recommendations: [], limitations: [], summary: null },
    };
    const fetchMock = mockSignedIn({
      'GET /api/agents/executions/ex-1': json(200, ex),
      'POST /api/reports': json(201, REPORT),
    }, session({ permissions: PERMS }));
    renderApp('/agents/runs/ex-1');
    await user.click(await screen.findByRole('button', { name: 'Generar reporte' }));
    expect(await screen.findByRole('heading', { name: 'Análisis financiero · Ventas' })).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([u, i]) => String(u) === '/api/reports' && i?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ execution_id: 'ex-1' });
  });
});

describe('Live dashboard', () => {
  it('shows real figures when the organization has analyses', async () => {
    const summary: DashboardSummary = {
      generated_at: '2026-11-26T10:00:00Z', datasets: 1, storage_bytes: 100, active_agents: 1, pending_approvals: 0,
      financial: { execution_id: 'ex-1', dataset: { id: 'ds-1', name: 'Ventas', row_count: 17 }, period: { from: '2026-10-01', to: '2026-11-06' }, metrics, series: null, completed_at: null },
      recent_executions: [{ id: 'ex-1', agent_id: 'financial-analyst', status: 'completed', created_at: '2026-11-26T10:00:00Z', dataset: 'Ventas' }],
      recommendations: [], reports: [{ id: 'rep-2', title: 'Reporte de noviembre', created_at: '2026-11-26T10:00:00Z' }],
    };
    mockSignedIn({ 'GET /api/dashboard/summary': json(200, summary), 'GET /api/datasets': json(200, []) }, session({ permissions: PERMS }));
    renderApp('/');
    const live = await screen.findByTestId('live-dashboard');
    expect(within(live).getByText('Último análisis financiero')).toBeInTheDocument();
    expect(within(live).getByText('Ventas · 2026-10-01 → 2026-11-06')).toBeInTheDocument();
    expect(within(live).getByRole('link', { name: 'Reporte de noviembre' })).toHaveAttribute('href', '/reports/rep-2');
    expect(within(live).getByText(/no son de demostración/)).toBeInTheDocument();
  });

  it('keeps the onboarding when there is no activity yet', async () => {
    mockSignedIn({
      'GET /api/dashboard/summary': json(200, { generated_at: '', datasets: 0, storage_bytes: 0, active_agents: 0, pending_approvals: 0, financial: null, recent_executions: [], recommendations: [], reports: [] }),
      'GET /api/datasets': json(200, []),
    }, session({ permissions: PERMS }));
    renderApp('/');
    await screen.findByText('Controla.');
    expect(screen.queryByTestId('live-dashboard')).not.toBeInTheDocument();
  });
});
