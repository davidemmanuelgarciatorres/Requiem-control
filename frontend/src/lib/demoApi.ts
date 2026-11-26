/**
 * API SIMULADA para la demostración sin servidor.
 *
 * Reproduce en el navegador las reglas principales de la API real (roles y
 * permisos, último propietario, límite de miembros del plan gratuito, auditoría)
 * para que la interfaz se pueda probar en un teléfono sin backend. NO es segura
 * ni sustituye al servidor: todo vive en este dispositivo (localStorage) y
 * cualquiera con acceso al navegador puede modificarlo. Solo se incluye en
 * `npm run build:demo`.
 */
import { ApiError, type AuditEntry, type Member, type Organization, type RoleCode, type SessionInfo, type SubscriptionInfo } from './api';

type DemoUser = { id: string; email: string; full_name: string; password_hash: string; preferred_language: 'es' | 'en' };
type DemoMember = { id: string; organization_id: string; user_id: string; role: RoleCode; created_at: string };
type DemoState = {
  version: 1;
  users: DemoUser[];
  orgs: Organization[];
  members: DemoMember[];
  audit: (AuditEntry & { organization_id: string | null })[];
  session: { user_id: string; active_org: string | null; csrf: string } | null;
  seq: number;
};

const KEY = 'rc.demo.v1';
export const DEMO_EMAIL = 'demo@requiem.mx';
export const DEMO_PASSWORD = 'requiem-demo';

const PERMS: Record<RoleCode, string[]> = {
  owner: ['org.read', 'org.update', 'org.delete', 'org.export', 'members.read', 'members.manage', 'billing.read', 'billing.manage', 'audit.read', 'data.read', 'data.write', 'agents.run', 'agents.manage', 'approvals.decide'],
  admin: ['org.read', 'org.update', 'org.export', 'members.read', 'members.manage', 'billing.read', 'audit.read', 'data.read', 'data.write', 'agents.run', 'agents.manage', 'approvals.decide'],
  member: ['org.read', 'members.read', 'billing.read', 'data.read', 'data.write', 'agents.run'],
  viewer: ['org.read', 'members.read', 'data.read'],
};
const RANK: Record<RoleCode, number> = { owner: 100, admin: 80, member: 50, viewer: 10 };
const FREE_PLAN = { code: 'free', name: 'Gratis', price_cents: 0, currency: 'MXN', interval: 'month', max_active_agents: 2, max_monthly_executions: 100, max_storage_mb: 50, max_members: 3 };


/** Reporte de EJEMPLO para la demostración (cifras ficticias, etiquetado como simulado). */
const DEMO_REPORT_ID = 'demo-report';
function demoReport(orgName: string) {
  const series = [
    { period: '2026-08', total: 182400, count: 212 }, { period: '2026-09', total: 176900, count: 205 },
    { period: '2026-10', total: 194300, count: 228 }, { period: '2026-11', total: 168200, count: 197 },
  ];
  return {
    id: DEMO_REPORT_ID, title: 'Análisis financiero · Ventas (ejemplo de demostración)', agent_id: 'financial-analyst',
    dataset_id: null, period_from: '2026-08-01', period_to: '2026-11-30', created_at: '2026-11-26T15:00:00Z',
    comparison: null,
    content: {
      organization: orgName, agent_id: 'financial-analyst', agent_version: '1.0.0',
      sources: [{ type: 'dataset', id: null, name: 'Ventas (demo)', rows: 842 }],
      columns_used: { amount: 'Monto', date: 'Fecha', group: 'Categoría' },
      metrics: [
        { key: 'total', value: 721800, format: 'currency' }, { key: 'transactions', value: 842, format: 'number' },
        { key: 'average', value: 857.24, format: 'currency' }, { key: 'median', value: 640, format: 'currency' },
        { key: 'change', value: -0.1343, format: 'percent' },
      ],
      series,
      breakdown: { dimension: 'Categoría', role: 'category', items: [
        { label: 'Herramienta', total: 361200, share: 0.5004 }, { label: 'Pintura', total: 201400, share: 0.279 },
        { label: 'Eléctrico', total: 159200, share: 0.2206 },
      ] },
      unusual: [{ row_number: 417, date: '2026-10-14', amount: 18500, label: 'Herramienta' }],
      recommendations: [
        { code: 'revenue_change', severity: 'warning', evidence: { periods: ['2026-10', '2026-11'] },
          params: { current_period: '2026-11', previous_period: '2026-10', pct: -0.1343, previous: 194300, current: 168200 } },
        { code: 'concentration', severity: 'info', evidence: {}, params: { label: 'Herramienta', share: 0.5004, dimension: 'Categoría' } },
        { code: 'unusual_transactions', severity: 'warning', evidence: { rows: [417] }, params: { count: 1 } },
      ],
      limitations: [{ code: 'not_accounting_advice', params: {} }, { code: 'dataset_only', params: {} }],
      summary: { text: 'Resumen de ejemplo (simulado): las ventas bajaron 13 % en noviembre frente a octubre; Herramienta concentra la mitad del total.', provider: 'mock', model: 'mock', simulated: true },
      generated_by: { provider: 'mock', model: 'mock', simulated: true, cost_usd: 0 },
      execution: { id: 'demo', completed_at: '2026-11-26T15:00:00Z' },
    },
  };
}

let memory: DemoState | null = null;

const now = () => new Date().toISOString();
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `id-${Math.random().toString(36).slice(2)}${Date.now()}`);

async function hash(password: string): Promise<string> {
  const data = new TextEncoder().encode(`requiem-demo:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function slugify(name: string): string {
  const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'org';
  return `${base}-${Math.random().toString(16).slice(2, 8)}`;
}

async function seed(): Promise<DemoState> {
  const pw = await hash(DEMO_PASSWORD);
  const other = await hash('requiem-demo-equipo');
  const users: DemoUser[] = [
    { id: 'u-ana', email: DEMO_EMAIL, full_name: 'Ana Demo', password_hash: pw, preferred_language: 'es' },
    { id: 'u-beto', email: 'beto@ejemplo.mx', full_name: 'Beto Ruiz', password_hash: other, preferred_language: 'es' },
    { id: 'u-carla', email: 'carla@ejemplo.mx', full_name: 'Carla Méndez', password_hash: other, preferred_language: 'es' },
    { id: 'u-dario', email: 'dario@ejemplo.mx', full_name: 'Darío Torres', password_hash: other, preferred_language: 'es' },
    { id: 'u-elena', email: 'elena@ejemplo.mx', full_name: 'Elena Vargas', password_hash: other, preferred_language: 'es' },
  ];
  const org: Organization = { id: 'org-demo', name: 'Ferretería del Centro', slug: 'ferreteria-del-centro-d3m0', country: 'MX', currency: 'MXN', created_at: now() };
  const org2: Organization = { id: 'org-demo-2', name: 'Distribuidora Norte', slug: 'distribuidora-norte-d3m0', country: 'MX', currency: 'MXN', created_at: now() };
  return {
    version: 1,
    users,
    orgs: [org, org2],
    members: [
      { id: 'm-1', organization_id: org.id, user_id: 'u-ana', role: 'owner', created_at: now() },
      { id: 'm-2', organization_id: org.id, user_id: 'u-beto', role: 'admin', created_at: now() },
      { id: 'm-3', organization_id: org2.id, user_id: 'u-dario', role: 'owner', created_at: now() },
      { id: 'm-4', organization_id: org2.id, user_id: 'u-ana', role: 'viewer', created_at: now() },
    ],
    audit: [
      { id: 1, organization_id: org.id, action: 'org.create', user_id: 'u-ana', created_at: now(), details: {} },
      { id: 2, organization_id: org.id, action: 'members.add', user_id: 'u-ana', created_at: now(), details: { role: 'admin' } },
    ],
    session: null,
    seq: 3,
  };
}

async function load(): Promise<DemoState> {
  if (memory) return memory;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DemoState;
      if (parsed.version === 1) return (memory = parsed);
    }
  } catch {
    /* almacenamiento no disponible: la demo vive en memoria */
  }
  return (memory = await seed());
}

function save(s: DemoState): void {
  memory = s;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* sin almacenamiento: los cambios duran hasta recargar */
  }
}

export async function resetDemo(): Promise<void> {
  memory = null;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nada */
  }
  save(await seed());
}

const fail = (status: number, code: string, message: string, extra: Record<string, unknown> = {}): never => {
  throw new ApiError(status, code, message, extra);
};

function audit(s: DemoState, action: string, organization_id: string | null, user_id: string | null, details: Record<string, unknown> = {}) {
  s.audit.push({ id: s.seq++, organization_id, user_id, action, created_at: now(), details });
}

function sessionOut(s: DemoState): SessionInfo {
  const sess = s.session!;
  const user = s.users.find((u) => u.id === sess.user_id)!;
  const memberships = s.members.filter((m) => m.user_id === user.id);
  let active = memberships.find((m) => m.organization_id === sess.active_org) ?? null;
  if (!active) {
    sess.active_org = null;
    active = null;
  }
  const org = (id: string) => s.orgs.find((o) => o.id === id)!;
  return {
    user: { id: user.id, email: user.email, full_name: user.full_name, preferred_language: user.preferred_language },
    active_organization: active ? org(active.organization_id) : null,
    role: active?.role ?? null,
    permissions: active ? [...PERMS[active.role]].sort() : [],
    memberships: memberships.map((m) => ({ organization: org(m.organization_id), role: m.role })),
    csrf_token: sess.csrf,
  };
}

function requireAuth(s: DemoState) {
  if (!s.session) fail(401, 'auth.required', 'Autenticación requerida.');
  return sessionOut(s);
}

function requirePerm(s: DemoState, perm: string) {
  const out = requireAuth(s);
  if (!out.active_organization) fail(409, 'org.none_active', 'No hay una organización activa.');
  if (!out.permissions.includes(perm)) fail(403, 'auth.forbidden', 'No tienes permiso para esta acción.');
  const me = s.members.find((m) => m.user_id === out.user.id && m.organization_id === out.active_organization!.id)!;
  return { out, org: out.active_organization!, me };
}

function memberOut(s: DemoState, m: DemoMember): Member {
  const u = s.users.find((x) => x.id === m.user_id)!;
  return { id: m.id, user_id: u.id, email: u.email, full_name: u.full_name, role: m.role, created_at: m.created_at };
}

function createOrg(s: DemoState, userId: string, name: string): Organization {
  const org: Organization = { id: uid(), name, slug: slugify(name), country: 'MX', currency: 'MXN', created_at: now() };
  s.orgs.push(org);
  s.members.push({ id: uid(), organization_id: org.id, user_id: userId, role: 'owner', created_at: now() });
  audit(s, 'org.create', org.id, userId);
  return org;
}

/** Enrutador de la API simulada. Misma forma de respuestas y errores que la API real. */
export async function handleDemo(method: string, path: string, body: unknown): Promise<unknown> {
  await new Promise((r) => setTimeout(r, 120)); // latencia simulada
  const s = await load();
  const b = (body ?? {}) as Record<string, string>;
  const [route, query] = path.split('?');
  const key = `${method} ${route}`;

  try {
    switch (key) {
      case 'GET /datasets':
      case 'GET /datasets/uploads':
        requireAuth(s);
        return [];
      case 'GET /health':
        return { status: 'ok', database: 'ok', version: 'demo' };
      case 'GET /reports': {
        const { org } = requirePerm(s, 'data.read');
        const { content: _c, comparison: _cmp, ...summary } = demoReport(org.name);
        void _c; void _cmp;
        return [summary];
      }
      case `GET /reports/${DEMO_REPORT_ID}`:
        return demoReport(requirePerm(s, 'data.read').org.name);
      case `DELETE /reports/${DEMO_REPORT_ID}`:
        requirePerm(s, 'data.write');
        return fail(403, 'demo.read_only', 'El reporte de ejemplo no se puede eliminar en la demostración.');
      case 'GET /dashboard/summary':
        requirePerm(s, 'data.read');
        return { generated_at: now(), datasets: 0, storage_bytes: 0, active_agents: 0, pending_approvals: 0, financial: null, recent_executions: [], recommendations: [], reports: [] };
      case 'GET /plans':
        return [FREE_PLAN];
      case 'GET /auth/me':
        return requireAuth(s);
      case 'POST /auth/login': {
        const user = s.users.find((u) => u.email.toLowerCase() === String(b.email ?? '').toLowerCase());
        if (!user || user.password_hash !== (await hash(String(b.password ?? '')))) {
          audit(s, 'auth.login_failed', null, user?.id ?? null);
          fail(401, 'auth.invalid_credentials', 'Correo o contraseña incorrectos.');
        }
        const first = s.members.find((m) => m.user_id === user!.id);
        s.session = { user_id: user!.id, active_org: first?.organization_id ?? null, csrf: uid() };
        audit(s, 'auth.login', first?.organization_id ?? null, user!.id);
        return sessionOut(s);
      }
      case 'POST /auth/register': {
        const email = String(b.email ?? '').trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(422, 'request.invalid', 'Datos inválidos.');
        if (String(b.password ?? '').length < 10) fail(422, 'auth.password_too_short', 'Contraseña demasiado corta.', { min_length: 10 });
        if (s.users.some((u) => u.email === email)) fail(409, 'auth.email_taken', 'Ya existe una cuenta con ese correo.');
        const user: DemoUser = { id: uid(), email, full_name: String(b.full_name).trim(), password_hash: await hash(String(b.password)), preferred_language: b.preferred_language === 'en' ? 'en' : 'es' };
        s.users.push(user);
        const org = createOrg(s, user.id, String(b.organization_name).trim());
        s.session = { user_id: user.id, active_org: org.id, csrf: uid() };
        audit(s, 'auth.register', org.id, user.id);
        return sessionOut(s);
      }
      case 'POST /auth/logout':
        requireAuth(s);
        s.session = null;
        return undefined;
      case 'PATCH /auth/me': {
        const out = requireAuth(s);
        const user = s.users.find((u) => u.id === out.user.id)!;
        if (b.full_name) user.full_name = String(b.full_name).trim();
        return sessionOut(s);
      }
      case 'POST /auth/switch-organization': {
        const out = requireAuth(s);
        const m = s.members.find((x) => x.user_id === out.user.id && x.organization_id === b.organization_id);
        if (!m) fail(403, 'org.not_member', 'No perteneces a esa organización.');
        s.session!.active_org = m!.organization_id;
        audit(s, 'org.switch', m!.organization_id, out.user.id);
        return sessionOut(s);
      }
      case 'GET /organizations': {
        const out = requireAuth(s);
        return out.memberships.map((m) => m.organization);
      }
      case 'POST /organizations': {
        const out = requireAuth(s);
        const org = createOrg(s, out.user.id, String(b.name).trim());
        s.session!.active_org = org.id;
        return sessionOut(s);
      }
      case 'PATCH /organizations/current': {
        const { org, out } = requirePerm(s, 'org.update');
        const target = s.orgs.find((o) => o.id === org.id)!;
        if (b.name) target.name = String(b.name).trim();
        audit(s, 'org.update', org.id, out.user.id, { fields: ['name'] });
        return target;
      }
      case 'DELETE /organizations/current': {
        const { org, out } = requirePerm(s, 'org.delete');
        if (b.confirm_slug !== org.slug) fail(422, 'org.confirmation_mismatch', 'La confirmación no coincide con el identificador.');
        s.orgs = s.orgs.filter((o) => o.id !== org.id);
        s.members = s.members.filter((m) => m.organization_id !== org.id);
        s.audit = s.audit.filter((a) => a.organization_id !== org.id);
        s.session!.active_org = null;
        audit(s, 'org.delete', null, out.user.id);
        return undefined;
      }
      case 'GET /organizations/current/members': {
        const { org } = requirePerm(s, 'members.read');
        return s.members.filter((m) => m.organization_id === org.id).map((m) => memberOut(s, m));
      }
      case 'POST /organizations/current/members': {
        const { org, me, out } = requirePerm(s, 'members.manage');
        const role = (b.role ?? 'member') as RoleCode;
        if (role === 'owner' || !(role in RANK)) fail(422, 'request.invalid', 'Datos inválidos.');
        if (RANK[role] > RANK[me.role]) fail(403, 'members.rank', 'No puedes gestionar a alguien con un rol superior al tuyo.');
        if (s.members.filter((m) => m.organization_id === org.id).length >= FREE_PLAN.max_members) {
          fail(402, 'plan.max_members', 'Tu plan no permite más miembros.', { limit: FREE_PLAN.max_members });
        }
        const user = s.users.find((u) => u.email === String(b.email ?? '').trim().toLowerCase());
        if (!user) fail(404, 'user.not_found', 'No encontrado. Prueba con dario@ejemplo.mx, carla@ejemplo.mx o elena@ejemplo.mx.');
        if (s.members.some((m) => m.organization_id === org.id && m.user_id === user!.id)) fail(409, 'members.exists', 'Esa persona ya es miembro.');
        const m: DemoMember = { id: uid(), organization_id: org.id, user_id: user!.id, role, created_at: now() };
        s.members.push(m);
        audit(s, 'members.add', org.id, out.user.id, { role });
        return memberOut(s, m);
      }
      case 'GET /organizations/current/subscription': {
        const { org } = requirePerm(s, 'billing.read');
        const info: SubscriptionInfo = {
          status: 'active',
          plan: FREE_PLAN,
          usage: { members: s.members.filter((m) => m.organization_id === org.id).length, active_agents: 0, monthly_executions: 0, storage_mb: 0 },
          billing_enabled: false,
        };
        return info;
      }
      case 'GET /organizations/current/audit-logs': {
        const { org } = requirePerm(s, 'audit.read');
        const limit = Number(new URLSearchParams(query).get('limit') ?? 50);
        return s.audit.filter((a) => a.organization_id === org.id).slice(-limit).reverse();
      }
      case 'GET /organizations/current/export': {
        const { org } = requirePerm(s, 'org.export');
        return { format: 'requiem-control-export/1', organization: org, members: s.members.filter((m) => m.organization_id === org.id).map((m) => memberOut(s, m)) };
      }
    }

    const memberMatch = route!.match(/^\/organizations\/current\/members\/([^/]+)$/);
    if (memberMatch && (method === 'PATCH' || method === 'DELETE')) {
      const { org, me, out } = requirePerm(s, 'members.manage');
      const m = s.members.find((x) => x.id === memberMatch[1] && x.organization_id === org.id);
      if (!m) fail(404, 'member.not_found', 'No encontrado.');
      const owners = s.members.filter((x) => x.organization_id === org.id && x.role === 'owner').length;
      if (method === 'DELETE') {
        if (RANK[m!.role] > RANK[me.role]) fail(403, 'members.rank', 'No puedes gestionar a alguien con un rol superior al tuyo.');
        if (m!.role === 'owner' && owners <= 1) fail(409, 'members.last_owner', 'La organización debe conservar al menos un propietario.');
        s.members = s.members.filter((x) => x.id !== m!.id);
        audit(s, 'members.remove', org.id, out.user.id);
        return undefined;
      }
      const role = b.role as RoleCode;
      if (!(role in RANK)) fail(422, 'request.invalid', 'Datos inválidos.');
      if (Math.max(RANK[m!.role], RANK[role]) > RANK[me.role]) fail(403, 'members.rank', 'No puedes gestionar a alguien con un rol superior al tuyo.');
      if (m!.role === 'owner' && role !== 'owner' && owners <= 1) fail(409, 'members.last_owner', 'La organización debe conservar al menos un propietario.');
      audit(s, 'members.role_change', org.id, out.user.id, { from: m!.role, to: role });
      m!.role = role;
      return memberOut(s, m!);
    }
    return fail(404, 'http.error', 'Not Found');
  } finally {
    save(s);
  }
}
