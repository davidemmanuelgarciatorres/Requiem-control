import type { Language } from '../../app/preferences';
import type { Dictionary } from '../../i18n/es';
import { ApiError, type Recommendation } from '../../lib/api';
import { formatCurrency, formatNumber, formatPercent, interpolate } from '../../lib/format';
import { errorMessage } from '../auth/errors';

type Params = Record<string, unknown>;

function fmtParams(t: Dictionary, lang: Language, params: Params): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) out[k] = v.map((x) => (k === 'missing' ? (t.data.roles as Record<string, string>)[String(x)] ?? String(x) : String(x))).join(', ');
    else if (typeof v === 'number') {
      if (k === 'pct' || k === 'share') out[k] = formatPercent(v, lang, 1, k === 'pct');
      else if (['current', 'previous', 'total', 'value'].includes(k)) out[k] = formatCurrency(v, lang);
      else out[k] = formatNumber(v, lang);
    } else if (k === 'expected') out[k] = ((t.data.types as Record<string, string>)[String(v)] ?? String(v)).toLowerCase();
    else if (k === 'label' && v === '__other__') out[k] = t.ai.other;
    else if (k === 'category') out[k] = ((t.ai.emailCats as Record<string, string>)[String(v)] ?? String(v)).toLowerCase();
    else out[k] = String(v ?? '');
  }
  return out;
}

export function recText(t: Dictionary, lang: Language, rec: Recommendation) {
  const copy = (t.ai.rec as Record<string, { detected: string; why: string; action: string }>)[rec.code];
  const vars = fmtParams(t, lang, rec.params);
  if (!copy) return { detected: rec.code, why: '', action: '' };
  return { detected: interpolate(copy.detected, vars), why: copy.why, action: copy.action };
}

export function limitationText(t: Dictionary, lang: Language, code: string, params: Params): string {
  const copy = (t.ai.lim as Record<string, string>)[code];
  return copy ? interpolate(copy, fmtParams(t, lang, params)) : code;
}

export function approvalText(t: Dictionary, lang: Language, actionType: string, payload: Params): string {
  const copy = (t.ai.approvalAction as Record<string, string>)[actionType];
  return copy ? interpolate(copy, fmtParams(t, lang, payload)) : actionType;
}

/** Mensaje para errores de API y de ejecución de agentes, por código. */
export function aiErrorMessage(t: Dictionary, lang: Language, e: unknown): string {
  const code = e instanceof ApiError ? e.code : (e as { code?: string } | null)?.code;
  const params = e instanceof ApiError ? e.extra : ((e as { params?: Params } | null)?.params ?? {});
  const copy = code ? (t.ai.errors as Record<string, string>)[code] : undefined;
  if (copy) return interpolate(copy, fmtParams(t, lang, params as Params));
  return errorMessage(t, e);
}
