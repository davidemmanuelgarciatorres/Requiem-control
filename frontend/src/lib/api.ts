/**
 * Cliente HTTP de la API de REQUIEM CONTROL.
 * - Misma origen (`/api`, el servidor de desarrollo hace de proxy): la cookie de
 *   sesión HttpOnly viaja sola y nunca es accesible desde JavaScript.
 * - Toda petición que cambia estado envía el token CSRF ligado a la sesión.
 */

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
export type ColumnType = 'integer' | 'number' | 'date' | 'boolean' | 'text' | 'empty';
export type ColumnRole = 'none' | 'date' | 'amount' | 'category' | 'customer' | 'product' | 'quantity' | 'identifier';
export type QualityIssue = {
  code: 'missing_values' | 'duplicate_rows' | 'mixed_types' | 'outliers' | 'empty_column' | 'ragged_rows';
  severity: 'warning' | 'info';
  column?: string;
  count: number;
  pct?: number;
  expected?: ColumnType;
  examples?: string[];
  rows?: number[];
  low?: number | null;
  high?: number;
};
export type ColumnReport = {
  key: string;
  name: string;
  type: ColumnType;
  suggested_role: ColumnRole;
  non_missing: number;
  missing: number;
  missing_pct: number;
  distinct: number;
  examples: string[];
  stats?: { min: number | string; max: number | string; mean?: number; median?: number; sum?: number };
  top_values?: { value: string; count: number }[];
};
export type QualityReport = {
  row_count: number;
  column_count: number;
  completeness: number;
  duplicate_rows: number;
  skipped_empty_rows: number;
  columns: ColumnReport[];
  issues: QualityIssue[];
};
export type UploadSummary = { id: string; filename: string; format: 'csv' | 'xlsx'; size_bytes: number; status: 'validated' | 'imported' | 'discarded'; created_at: string };
export type UploadPreview = UploadSummary & {
  options: { encoding?: string; delimiter?: string; sheet?: string };
  sheets: string[];
  row_count: number;
  preview_rows: string[][];
  report: QualityReport;
  duplicate_of: { dataset_id: string; name: string } | null;
};
export type DatasetColumn = { key: string; name: string; source: string; type: ColumnType; role: ColumnRole; conversion_failures?: number };
export type DatasetSummary = { id: string; name: string; row_count: number; column_count: number; completeness: number; issue_count: number; source_filename: string | null; created_at: string };
export type Dataset = DatasetSummary & { columns: DatasetColumn[]; report: QualityReport };
export type DatasetRows = { total: number; offset: number; limit: number; rows: { row_number: number; data: Record<string, string | number | boolean | null> }[] };
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
  if (__DEMO__) {
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

/** Sube un archivo (multipart). La cookie de sesión viaja sola; el token CSRF va en la cabecera. */
export async function uploadFile<T>(path: string, file: File, fields: Record<string, string> = {}): Promise<T> {
  if (__DEMO__) throw new ApiError(0, 'demo.unavailable', 'Not available in the demo');
  const form = new FormData();
  form.append('file', file);
  Object.entries(fields).forEach(([k, v]) => form.append(k, v));
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: 'POST',
      body: form,
      credentials: 'same-origin',
      headers: csrfToken ? { 'X-CSRF-Token': csrfToken, Accept: 'application/json' } : { Accept: 'application/json' },
    });
  } catch {
    throw new ApiError(0, 'network.unreachable', 'Network error');
  }
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (data as { error?: Record<string, unknown> } | null)?.error;
    if (!err && res.status >= 500) throw new ApiError(0, 'network.unreachable', 'API unavailable');
    const { code, message, ...extra } = err ?? {};
    throw new ApiError(res.status, String(code ?? 'http.error'), String(message ?? res.statusText), extra);
  }
  return data as T;
}
