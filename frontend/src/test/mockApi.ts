import { vi } from 'vitest';
import type { Member, SessionInfo, SubscriptionInfo } from '../lib/api';

/** Datos de prueba (solo para pruebas unitarias; la app real siempre consulta la API). */
export const ORG = { id: 'org-1', name: 'Ferretería Ana', slug: 'ferreteria-ana-abc123', country: 'MX', currency: 'MXN', created_at: '2026-11-26T00:00:00Z' };
export const ORG2 = { ...ORG, id: 'org-2', name: 'Segunda', slug: 'segunda-def456' };
export const OWNER_PERMS = ['org.read', 'org.update', 'org.delete', 'org.export', 'members.read', 'members.manage', 'billing.read', 'audit.read'];

export function session(overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    user: { id: 'u-1', email: 'ana@example.com', full_name: 'Ana López', preferred_language: 'es' },
    active_organization: ORG,
    role: 'owner',
    permissions: OWNER_PERMS,
    memberships: [{ organization: ORG, role: 'owner' }, { organization: ORG2, role: 'viewer' }],
    csrf_token: 'csrf-123',
    ...overrides,
  };
}

export const MEMBERS: Member[] = [
  { id: 'm-1', user_id: 'u-1', email: 'ana@example.com', full_name: 'Ana López', role: 'owner', created_at: ORG.created_at },
  { id: 'm-2', user_id: 'u-2', email: 'beto@example.com', full_name: 'Beto Ruiz', role: 'member', created_at: ORG.created_at },
];

export const SUBSCRIPTION: SubscriptionInfo = {
  status: 'active',
  billing_enabled: false,
  usage: { members: 2, active_agents: 0 },
  plan: { code: 'free', name: 'Gratis', price_cents: 0, currency: 'MXN', interval: 'month', max_active_agents: 2, max_monthly_executions: 100, max_storage_mb: 50, max_members: 3 },
};

type Handler = (body: unknown, init: RequestInit) => { status: number; body?: unknown } | Promise<{ status: number; body?: unknown }>;
export type Routes = Record<string, Handler>;

export const json = (status: number, body?: unknown) => () => ({ status, body });

/** Sustituye `fetch` por un enrutador "MÉTODO /ruta" → respuesta. Devuelve el mock para inspeccionar llamadas. */
export function mockApi(routes: Routes) {
  const all: Routes = {
    'GET /api/health': json(200, { status: 'ok', database: 'ok', version: 'test' }),
    'GET /api/organizations/current/audit-logs?limit=8': json(200, []),
    ...routes,
  };
  const fn = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const key = `${init.method ?? 'GET'} ${String(input)}`;
    const handler = all[key];
    if (!handler) return new Response(JSON.stringify({ error: { code: 'test.unmocked', message: key } }), { status: 404 });
    const res = await handler(typeof init.body === 'string' ? JSON.parse(init.body) : init.body, init);
    if (res.status === 204) return new Response(null, { status: 204 });
    return new Response(JSON.stringify(res.body ?? {}), { status: res.status, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

/** API con una sesión iniciada (caso por defecto de las pruebas de la app). */
export function mockSignedIn(extra: Routes = {}, s: SessionInfo = session()) {
  return mockApi({ 'GET /api/auth/me': json(200, s), ...extra });
}
