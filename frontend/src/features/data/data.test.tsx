import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Dataset, UploadPreview } from '../../lib/api';
import { json, mockSignedIn, session } from '../../test/mockApi';
import { renderApp } from '../../test/renderApp';

const DATA_PERMS = ['org.read', 'members.read', 'billing.read', 'data.read', 'data.write'];

const PREVIEW: UploadPreview = {
  id: 'up-1', filename: 'ventas.csv', format: 'csv', size_bytes: 120, status: 'validated', created_at: '2026-11-26T00:00:00Z',
  options: { encoding: 'utf-8-sig', delimiter: ';' }, sheets: [], row_count: 3,
  preview_rows: [['01/10/2026', 'Ana', '$1,200'], ['02/10/2026', '', '$900'], ['fecha mala', 'Eva', '$90']],
  duplicate_of: null,
  report: {
    row_count: 3, column_count: 3, completeness: 0.8889, duplicate_rows: 0, skipped_empty_rows: 0,
    columns: [
      { key: 'c0', name: 'Fecha', type: 'date', suggested_role: 'date', non_missing: 3, missing: 0, missing_pct: 0, distinct: 3, examples: ['01/10/2026'] },
      { key: 'c1', name: 'Cliente', type: 'text', suggested_role: 'customer', non_missing: 2, missing: 1, missing_pct: 0.3333, distinct: 2, examples: ['Ana', 'Eva'] },
      { key: 'c2', name: 'Monto', type: 'number', suggested_role: 'amount', non_missing: 3, missing: 0, missing_pct: 0, distinct: 3, examples: ['$1,200'] },
    ],
    issues: [
      { code: 'missing_values', severity: 'warning', column: 'Cliente', count: 1, pct: 0.3333, rows: [3] },
      { code: 'mixed_types', severity: 'warning', column: 'Fecha', count: 1, expected: 'date', examples: ['fecha mala'], rows: [4] },
    ],
  },
};

const DATASET: Dataset = {
  id: 'ds-1', name: 'Ventas octubre', row_count: 3, column_count: 3, completeness: 0.8889, issue_count: 2,
  source_filename: 'ventas.csv', created_at: '2026-11-26T00:00:00Z', report: PREVIEW.report,
  columns: [
    { key: 'c0', name: 'Fecha', source: 'Fecha', type: 'date', role: 'date', conversion_failures: 1 },
    { key: 'c1', name: 'Cliente', source: 'Cliente', type: 'text', role: 'customer', conversion_failures: 0 },
    { key: 'c2', name: 'Importe', source: 'Monto', type: 'number', role: 'amount', conversion_failures: 0 },
  ],
};

const ROWS = { total: 3, offset: 0, limit: 50, rows: [{ row_number: 2, data: { c0: '2026-10-01', c1: 'Ana', c2: 1200 } }, { row_number: 3, data: { c0: '2026-10-02', c1: null, c2: 900 } }] };

function dataApi(extra = {}) {
  return mockSignedIn(
    {
      'GET /api/datasets': json(200, []),
      'GET /api/datasets/uploads': json(200, []),
      'POST /api/datasets/uploads': json(201, PREVIEW),
      'POST /api/datasets/uploads/up-1/confirm': json(201, DATASET),
      'GET /api/datasets/ds-1/rows?offset=0&limit=50': json(200, ROWS),
      ...extra,
    },
    session({ permissions: DATA_PERMS }),
  );
}

describe('Data Analyst', () => {
  it('uploads, explains findings, maps columns, confirms and shows the report', async () => {
    const user = userEvent.setup();
    const fetchMock = dataApi();
    renderApp('/data');
    expect(await screen.findByText('Todavía no has importado datos.')).toBeInTheDocument();

    const file = new File(['Fecha;Cliente;Monto\n'], 'ventas.csv', { type: 'text/csv' });
    await user.upload(screen.getByLabelText(/Elegir archivo/), file);

    // Revisión: hallazgos explicados con evidencia, por qué importa y qué hacer.
    expect(await screen.findByRole('heading', { level: 1, name: 'ventas.csv' })).toBeInTheDocument();
    expect(screen.getByText('Valores faltantes en «Cliente»')).toBeInTheDocument();
    expect(screen.getByText('Filas de ejemplo: 4')).toBeInTheDocument();
    expect(screen.getAllByText('Por qué importa').length).toBe(2);

    // Mapeo: renombrar Monto → Importe.
    const name = screen.getByLabelText('Nombre: Monto');
    await user.clear(name);
    await user.type(name, 'Importe');
    await user.click(screen.getByRole('button', { name: 'Confirmar importación' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Ventas octubre' })).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([u]) => u === '/api/datasets/uploads/up-1/confirm')!;
    const body = JSON.parse(String(call[1]?.body));
    expect(body.name).toBe('ventas');
    expect(body.columns[2]).toEqual({ key: 'c2', name: 'Importe', type: 'number', role: 'amount', include: true });
    expect((call[1]?.headers as Record<string, string>)['X-CSRF-Token']).toBe('csrf-123');

    // Reporte: fallos de conversión visibles y filas con su número de fila original.
    expect(screen.getByText(/Valores sin convertir: 1/)).toBeInTheDocument();
    const cell = await screen.findByText('1,200');
    const table = cell.closest('table')!;
    expect(within(table).getAllByText('—').length).toBeGreaterThan(0);
  });

  it('sends the file as multipart with the CSRF header', async () => {
    const user = userEvent.setup();
    const fetchMock = dataApi();
    renderApp('/data');
    await user.upload(await screen.findByLabelText(/Elegir archivo/), new File(['a'], 'v.csv'));
    await screen.findByRole('heading', { level: 1, name: 'ventas.csv' });
    const call = fetchMock.mock.calls.find(([u, i]) => u === '/api/datasets/uploads' && i?.method === 'POST')!;
    expect(call[1]?.body).toBeInstanceOf(FormData);
    expect((call[1]?.headers as Record<string, string>)['X-CSRF-Token']).toBe('csrf-123');
  });

  it('rejects wrong file types and oversized files before uploading', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const fetchMock = dataApi();
    renderApp('/data');
    await user.upload(await screen.findByLabelText(/Elegir archivo/), new File(['%PDF'], 'reporte.pdf'));
    expect(screen.getByRole('alert')).toHaveTextContent('Solo se aceptan archivos .csv o .xlsx.');
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'grande.csv');
    await user.upload(screen.getByLabelText(/Elegir archivo/), big);
    expect(screen.getByRole('alert')).toHaveTextContent('más de 10 MB');
    expect(fetchMock.mock.calls.some(([u, i]) => u === '/api/datasets/uploads' && i?.method === 'POST')).toBe(false);
  });

  it('translates server rejections', async () => {
    const user = userEvent.setup();
    dataApi({ 'POST /api/datasets/uploads': json(422, { error: { code: 'upload.macros_not_allowed', message: 'x' } }) });
    renderApp('/data');
    await user.upload(await screen.findByLabelText(/Elegir archivo/), new File(['x'], 'libro.xlsx'));
    expect(await screen.findByRole('alert')).toHaveTextContent('no aceptamos libros con macros');
  });

  it('read-only roles cannot upload', async () => {
    mockSignedIn({ 'GET /api/datasets': json(200, []), 'GET /api/datasets/uploads': json(200, []) }, session({ role: 'viewer', permissions: ['org.read', 'data.read'] }));
    renderApp('/data');
    expect(await screen.findByText('Tu rol permite consultar datos, pero no importarlos.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Elegir archivo/)).toBeDisabled();
  });

  it('history lists datasets with completeness and links to the report', async () => {
    dataApi({ 'GET /api/datasets': json(200, [DATASET]), 'GET /api/datasets/ds-1': json(200, DATASET) });
    const user = userEvent.setup();
    renderApp('/data');
    const list = await screen.findByRole('list', { name: 'Conjuntos de datos' });
    expect(within(list).getByText('Completitud 88.9%')).toBeInTheDocument();
    await user.click(within(list).getByRole('link', { name: 'Ventas octubre' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Ventas octubre' })).toBeInTheDocument());
  });
});
