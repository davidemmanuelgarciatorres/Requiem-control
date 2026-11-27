import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { AgentsInfo, Execution } from '../../lib/api';
import { json, mockSignedIn, session } from '../../test/mockApi';
import { renderApp } from '../../test/renderApp';

const PERMS = ['org.read', 'data.read', 'agents.run', 'agents.manage', 'approvals.decide', 'billing.read'];
const base = { read_only: true, requires_approval: false, required_permissions: [], timeout_seconds: 120, phase: 4, version: '1.0.0' };

function agents(active: string[] = []): AgentsInfo {
  return {
    agents: [
      { ...base, id: 'data-analyst', status: 'available', read_only: false, requires_approval: true, allowed_tools: ['read_dataset', 'propose_action'], active: active.includes('data-analyst') },
      { ...base, id: 'financial-analyst', status: 'available', allowed_tools: ['read_dataset', 'summarize'], active: active.includes('financial-analyst') },
      { ...base, id: 'email-ops', status: 'planned', allowed_tools: [], phase: 7, active: false },
    ],
    active_count: active.length, active_limit: 2, monthly_executions: 3, monthly_limit: 100,
  };
}

const EXECUTION: Execution = {
  id: 'ex-1', agent_id: 'data-analyst', agent_version: '1.0.0', status: 'awaiting_approval', input: { dataset_id: 'ds-1' },
  error: null, created_at: '2026-11-26T10:00:00Z', queued_at: null, started_at: null, completed_at: null,
  usage: { provider: 'mock', model: 'template-v1', simulated: true, input_tokens: 0, output_tokens: 0, cost_usd: 0 },
  output: {
    dataset: { id: 'ds-1', name: 'Ventas', row_count: 17 }, period: null,
    metrics: [{ key: 'rows', value: 17, format: 'number' }, { key: 'completeness', value: 0.97, format: 'percent' }],
    recommendations: [{ code: 'remove_duplicates', severity: 'warning', params: { count: 1 }, evidence: { rows: [18] }, approval_id: 'ap-1' }],
    limitations: [{ code: 'dataset_only', params: {} }],
    summary: { text: 'Resumen generado con una plantilla (proveedor simulado, sin IA real). 17 filas.', provider: 'mock', model: 'template-v1', simulated: true },
  },
  approvals: [{ id: 'ap-1', execution_id: 'ex-1', action_type: 'dataset.remove_duplicates', payload: { count: 1, dataset_name: 'Ventas' }, status: 'pending', requested_at: '2026-11-26T10:00:00Z', decided_at: null, result: null }],
};

const common = {
  'GET /api/agents/provider': json(200, { provider: 'mock', model: 'template-v1', simulated: true, configured: false, note: null }),
  'GET /api/datasets': json(200, [{ id: 'ds-1', name: 'Ventas', row_count: 17, column_count: 3, completeness: 1, issue_count: 0, source_filename: 'v.csv', created_at: '2026-11-26T00:00:00Z' }]),
  'GET /api/agents/executions?limit=10': json(200, []),
  'GET /api/approvals?status=pending': json(200, []),
};

describe('AI agents', () => {
  it('shows the simulated provider honestly, the plan counters and planned agents', async () => {
    mockSignedIn({ ...common, 'GET /api/agents': json(200, agents()) }, session({ permissions: PERMS }));
    renderApp('/agents');
    expect(await screen.findByText('Agentes activos: 0 de 2')).toBeInTheDocument();
    expect(screen.queryByText(/Proveedor de IA/)).not.toBeInTheDocument(); // aviso técnico solo para administradores
    expect(screen.getByText('Agentes activos: 0 de 2')).toBeInTheDocument();
    expect(screen.getByText('Ejecuciones este mes: 3 de 100')).toBeInTheDocument();
    const email = screen.getByRole('article', { name: /Operaciones de correo/ });
    expect(within(email).getByText('Disponible en la Fase 7')).toBeInTheDocument();
    expect(within(email).queryByRole('button')).not.toBeInTheDocument();
  });

  it('activates an agent and runs it with an idempotency key', async () => {
    const user = userEvent.setup();
    let active: string[] = [];
    const fetchMock = mockSignedIn({
      ...common,
      'GET /api/agents': () => ({ status: 200, body: agents(active) }),
      'PUT /api/agents/data-analyst/activation': () => { active = ['data-analyst']; return { status: 204 }; },
      'POST /api/agents/data-analyst/executions': json(202, { ...EXECUTION, status: 'queued', output: null }),
      'GET /api/agents/executions/ex-1': json(200, EXECUTION),
    }, session({ permissions: PERMS }));
    renderApp('/agents');
    const card = await screen.findByRole('article', { name: /Analista de datos/ });
    await user.click(within(card).getByRole('button', { name: 'Activar' }));
    await waitFor(() => expect(within(screen.getByRole('article', { name: /Analista de datos/ })).getByRole('button', { name: 'Ejecutar' })).toBeInTheDocument());
    await user.click(within(screen.getByRole('article', { name: /Analista de datos/ })).getByRole('button', { name: 'Ejecutar' }));
    expect(await screen.findByRole('heading', { level: 1, name: /Analista de datos · Ventas/ })).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([u]) => u === '/api/agents/data-analyst/executions')!;
    const body = JSON.parse(String(call[1]?.body));
    expect(body.dataset_id).toBe('ds-1');
    expect(body.idempotency_key).toMatch(/^ui-/);
  });

  it('labels simulated summaries and lets an admin approve a proposed action', async () => {
    const user = userEvent.setup();
    let status: 'pending' | 'executed' = 'pending';
    const fetchMock = mockSignedIn({
      ...common,
      'GET /api/agents/executions/ex-1': () => ({
        status: 200,
        body: { ...EXECUTION, status: status === 'pending' ? 'awaiting_approval' : 'completed',
          approvals: [{ ...EXECUTION.approvals[0], status, result: status === 'executed' ? { removed_rows: 1, remaining_rows: 16 } : null }] },
      }),
      'POST /api/approvals/ap-1/decision': () => { status = 'executed'; return { status: 200, body: {} }; },
    }, session({ permissions: PERMS }));
    renderApp('/agents/runs/ex-1');
    expect(await screen.findByText('Resumen automático')).toBeInTheDocument();
    expect(screen.getByText('Hay 1 fila duplicada exacta.')).toBeInTheDocument();
    expect(screen.getByText('Filas: 18')).toBeInTheDocument();
    expect(screen.getByText('Eliminar 1 fila duplicada de «Ventas»')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Aprobar' }));
    expect(await screen.findByText('Se eliminó 1 fila; quedan 16.')).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([u]) => u === '/api/approvals/ap-1/decision')!;
    expect(JSON.parse(String(call[1]?.body))).toEqual({ decision: 'approve' });
    expect((call[1]?.headers as Record<string, string>)['X-CSRF-Token']).toBe('csrf-123');
  });

  it('roles without approvals.decide cannot approve', async () => {
    mockSignedIn({ ...common, 'GET /api/agents/executions/ex-1': json(200, EXECUTION) }, session({ role: 'member', permissions: ['org.read', 'data.read', 'agents.run'] }));
    renderApp('/agents/runs/ex-1');
    expect(await screen.findByText('Tu rol no permite aprobar acciones.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument();
  });

  it('explains failed runs by error code', async () => {
    mockSignedIn({
      ...common,
      'GET /api/agents/executions/ex-1': json(200, { ...EXECUTION, status: 'failed', output: null, approvals: [], usage: {},
        error: { code: 'agent.missing_roles', message: 'x', params: { missing: ['amount'] } } }),
    }, session({ permissions: PERMS }));
    renderApp('/agents/runs/ex-1');
    expect(await screen.findByRole('alert')).toHaveTextContent('no tiene columnas con rol Importe');
  });

  it('shows pending approvals in the top bar', async () => {
    const user = userEvent.setup();
    mockSignedIn({ ...common, 'GET /api/approvals?status=pending': json(200, EXECUTION.approvals), 'GET /api/agents': json(200, agents()) }, session({ permissions: PERMS }));
    renderApp('/agents');
    const button = await screen.findByRole('button', { name: 'Aprobaciones pendientes: 1' });
    await user.click(button);
    expect(within(screen.getByRole('dialog', { name: 'Aprobaciones pendientes' })).getByRole('link', { name: /Eliminar 1 fila duplicada/ })).toHaveAttribute('href', '/agents/runs/ex-1');
  });
});
