import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { json, mockSignedIn, session } from '../../test/mockApi';
import { renderApp } from '../../test/renderApp';

const PERMS = ['org.read', 'data.read', 'data.write', 'integrations.manage'];
const google = (over = {}) => ({ google: {
  configured: true, missing: [], plan_allows: true, can_manage: true, status: 'connected', services: ['sheets'],
  account_email: 'dueno@ejemplo.mx', connected_at: '2026-11-26T10:00:00Z', last_sync_at: null, last_error: null,
  available_services: ['sheets', 'drive', 'gmail'], scopes: { sheets: [], drive: [], gmail: [] }, ...over,
} });

describe('Integrations (connected)', () => {
  it('lists sheets and imports one into the normal review flow', async () => {
    const user = userEvent.setup();
    const preview = { id: 'up-9', filename: 'Ventas - Octubre.csv', format: 'csv', size_bytes: 10, status: 'validated', created_at: '2026-11-26T10:00:00Z',
      options: {}, sheets: [], report: { row_count: 1, column_count: 2, completeness: 1, duplicate_rows: 0, empty_rows_skipped: 0, columns: [], issues: [] }, preview: { headers: [], rows: [] } };
    const fetchMock = mockSignedIn({
      'GET /api/integrations': json(200, google()),
      'GET /api/integrations/google/sheets': json(200, [{ id: 'sheet1234567890', name: 'Ventas 2026', modified_at: '2026-11-20T10:00:00Z' }]),
      'POST /api/integrations/google/sheets/import': json(201, preview),
      'GET /api/datasets/uploads/up-9': json(200, preview),
    }, session({ permissions: PERMS }));
    renderApp('/integrations');
    expect(await screen.findByText('dueno@ejemplo.mx')).toBeInTheDocument();
    expect(screen.getAllByText('Conectado').length).toBeGreaterThanOrEqual(2); // estado general + Sheets
    await user.click(screen.getByRole('button', { name: 'Buscar hoja' }));
    await user.click(await screen.findByRole('button', { name: 'Importar' }));
    const post = fetchMock.mock.calls.find(([u, i]) => u === '/api/integrations/google/sheets/import' && i?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ spreadsheet_id: 'sheet1234567890' });
  });

  it('shows the reconnect state and the returned error message', async () => {
    mockSignedIn({ 'GET /api/integrations': json(200, google({ status: 'error', last_error: { code: 'integration.reauth_required', at: '' } })) },
      session({ permissions: PERMS }));
    renderApp('/integrations?error=integration.state_expired');
    expect(await screen.findByRole('button', { name: 'Volver a conectar' })).toBeEnabled();
    expect(screen.getByText('La solicitud de conexión caducó; vuelve a intentarlo.')).toBeInTheDocument();
    expect(screen.getByText(/caducó o se revocó/)).toBeInTheDocument();
  });

  it('members without integrations.manage cannot connect', async () => {
    mockSignedIn({ 'GET /api/integrations': json(200, google({ status: 'disconnected', services: [], can_manage: false })) },
      session({ permissions: ['org.read', 'data.read'] }));
    renderApp('/integrations');
    expect(await screen.findByText(/Solo el propietario o un administrador/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Conectar con Google' })).toBeDisabled();
  });
});
