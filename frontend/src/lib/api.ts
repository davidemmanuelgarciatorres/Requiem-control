/**
 * Cliente HTTP de la API de REQUIEM CONTROL.
 * - Misma origen (`/api`, el servidor de desarrollo hace de proxy): la cookie de
 *   sesión HttpOnly viaja sola y nunca es accesible desde JavaScript.
 * - Toda petición que cambia estado envía el token CSRF ligado a la sesión.
 */

import { IS_DEMO } from './env';

export type RoleCode = 'owner' | 'admin' | 'member' | 'viewer';

export type Organization = { id: string; name: string; slug: string; country: string; currency: string; created_at: string };
export type User = { id: string; email: string; full_name: string; preferred_language: 'es' | 'en' };
export type SessionInfo = {
  user: User;
  active_organization: Organization | null;
  role: RoleCode | null;
  permissions: string[];
  memberships: { organization: Organization; role: RoleCode }[];
  csrf_token: string;
};
export type Member = { id: string; user_id: string; email: string; full_name: string; role: RoleCode; created_at: string };
export type Plan = {
  code: string; name: string; price_cents: number; currency: string; interval: string;
  max_active_agents: number; max_monthly_executions: number; max_storage_mb: number; max_members: number;
};
export type SubscriptionInfo = { status: string; plan: Plan; usage: Record<string, number>; billing_enabled: boolean };
export type AuditEntry = { id: number; action: string; user_id: string | null; created_at: string; details: Record<string, unknown> };
export type Health = { status: 'ok' | 'degraded'; database: 'ok' | 'unavailable'; version: string };

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let csrfToken: string | null = null;
export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const method = init.method ?? 'GET';
  if (IS_DEMO) {
    // Compilación de demostración: API simulada en el navegador (carga diferida).
    const { handleDemo } = await import('./demoApi');
    return (await handleDemo(method, path, init.body)) as T;
  }
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken;

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError(0, 'network.unreachable', 'Network error');
  }
  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } } | null)?.error;
    const { code, message, ...extra } = (err ?? {}) as Record<string, unknown>;
    // Un proxy sin backend responde 502/503/504 sin el formato de la API.
    if (!err && res.status >= 500) throw new ApiError(0, 'network.unreachable', 'API unavailable');
    throw new ApiError(res.status, String(code ?? 'http.error'), String(message ?? res.statusText), extra);
  }
  return data as T;
}
