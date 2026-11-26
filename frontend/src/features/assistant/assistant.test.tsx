import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { AssistantMessage, FinanceOverview } from '../../lib/api';
import { json, mockSignedIn, session } from '../../test/mockApi';
import { renderApp } from '../../test/renderApp';

const PERMS = ['org.read', 'data.read', 'data.write', 'agents.run', 'billing.read'];
const provider = json(200, { provider: 'mock', model: 'template-v1', simulated: true, configured: false, note: null });

describe('AI assistant', () => {
  it('asks a suggested question and shows labeled parts', async () => {
    const user = userEvent.setup();
    const msg = (role: 'user' | 'assistant', content: string, parts: AssistantMessage['parts'] = null): AssistantMessage =>
      ({ id: `${role}-1`, conversation_id: 'c-1', role, content, parts, meta: { provider: 'mock', simulated: true }, created_at: '2026-11-26T10:00:00Z' });
    const fetchMock = mockSignedIn({
      'GET /api/agents/provider': provider,
      'GET /api/assistant/conversations': json(200, []),
      'POST /api/assistant/messages': json(201, {
        question: msg('user', '¿Cómo van mis ventas?'),
        answer: msg('assistant', 'x', [
          { kind: 'verified', text: 'Ingresos $95,090.00 MXN.' },
          { kind: 'suggestion', text: 'Revisa la renta.' },
        ]),
      }),
    }, session({ permissions: PERMS }));
    renderApp('/assistant');
    expect(await screen.findByText(/Modo simulado/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '¿Cómo van mis ventas?' }));
    const part = (await screen.findByText('Ingresos $95,090.00 MXN.')).closest('li')!;
    expect(within(part).getByText('Verificado')).toBeInTheDocument();
    expect(screen.getByText('Sugerencia')).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([u, i]) => u === '/api/assistant/messages' && i?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ question: '¿Cómo van mis ventas?' });
  });

  it('shows the hourly limit error and keeps the question', async () => {
    const user = userEvent.setup();
    mockSignedIn({
      'GET /api/agents/provider': provider,
      'GET /api/assistant/conversations': json(200, []),
      'POST /api/assistant/messages': json(429, { error: { code: 'assistant.rate_limited', message: 'x' } }),
    }, session({ permissions: PERMS }));
    renderApp('/assistant');
    const box = await screen.findByLabelText('Escribe tu pregunta…');
    await user.type(box, 'hola{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('límite de preguntas por hora');
    expect(box).toHaveValue('hola');
  });
});

describe('Financial intelligence', () => {
  it('shows an honest empty state without eligible data', async () => {
    mockSignedIn({ 'GET /api/finance/overview': json(200, { datasets: [], dataset: null }) }, session({ permissions: PERMS }));
    renderApp('/finance');
    expect(await screen.findByText('Aún no hay datos financieros')).toBeInTheDocument();
  });

  it('shows metrics with their formula, comparison and observations', async () => {
    const o: FinanceOverview = {
      datasets: [{ id: 'ds-1', name: 'Movimientos', row_count: 11 }], dataset: { id: 'ds-1', name: 'Movimientos', row_count: 11 },
      source: { dataset: 'Movimientos', amount: 'Monto', date: 'Fecha' }, period: { from: '2026-10-01', to: '2026-11-28' },
      periods: ['2026-10', '2026-11'], group_name: 'Concepto',
      metrics: [
        { key: 'income', value: 2500, format: 'currency', formula: 'income', rows: 2 },
        { key: 'expenses', value: 1400, format: 'currency', formula: 'expenses', rows: 2 },
        { key: 'net', value: 1100, format: 'currency', formula: 'net' },
      ],
      monthly: [
        { period: '2026-10', income: 2500, expenses: 1400, net: 1100, cumulative: 1100, count: 4 },
        { period: '2026-11', income: 500, expenses: 900, net: -400, cumulative: 700, count: 2 },
      ],
      comparison: { previous: '2026-10', current: '2026-11', metrics: [{ key: 'income', previous: 2500, current: 500, delta: -2000, delta_pct: -0.8 }] },
      expense_categories: [{ label: 'Renta', total: 1600, share: 0.69 }], income_categories: [],
      observations: [{ code: 'negative_months', severity: 'warning', params: { count: 1, periods: ['2026-11'] } }],
      unusual: [], limitations: [{ code: 'sign_convention', params: {} }],
    };
    mockSignedIn({ 'GET /api/finance/overview': json(200, o) }, session({ permissions: PERMS }));
    renderApp('/finance');
    expect(await screen.findByText('Ingresos − gastos')).toBeInTheDocument();
    expect(screen.getByText('Comparación 2026-10 → 2026-11')).toBeInTheDocument();
    expect(screen.getByText('Meses con resultado negativo (1): 2026-11.')).toBeInTheDocument();
    expect(screen.getByText(/importes negativos son gastos/)).toBeInTheDocument();
    expect(screen.getByText('Gastos por «Concepto»')).toBeInTheDocument();
  });
});
