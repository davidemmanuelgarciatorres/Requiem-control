import type { Language } from '../../app/preferences';
import type { Dictionary } from '../../i18n/es';
import type { QualityIssue } from '../../lib/api';
import { ApiError } from '../../lib/api';
import { formatNumber, formatPercent, interpolate } from '../../lib/format';
import { errorMessage } from '../auth/errors';

/** Mensaje para un error de importación (traducido por código; si no, el genérico). */
export function dataErrorMessage(t: Dictionary, e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'demo.unavailable') return t.data.demoUnavailable;
    const known = (t.data.errors as Record<string, string>)[e.code];
    if (known) {
      const limit = e.extra.limit;
      return typeof limit === 'number' ? `${known} (${limit.toLocaleString()})` : known;
    }
  }
  return errorMessage(t, e);
}

/** Textos explicables de un hallazgo: qué, evidencia, por qué importa y qué hacer. */
export function issueText(t: Dictionary, lang: Language, issue: QualityIssue) {
  const copy = t.data.issue[issue.code];
  const vars = {
    column: issue.column ?? '',
    count: formatNumber(issue.count, lang),
    pct: issue.pct !== undefined ? formatPercent(issue.pct, lang, 1) : '',
    expected: issue.expected ? t.data.types[issue.expected].toLowerCase() : '',
    examples: (issue.examples ?? []).map((e) => `«${e}»`).join(', '),
    low: issue.low !== undefined && issue.low !== null ? formatNumber(Math.round(issue.low * 100) / 100, lang) : '',
    high: issue.high !== undefined ? formatNumber(Math.round(issue.high * 100) / 100, lang) : '',
  };
  return {
    title: interpolate(copy.title, vars),
    body: interpolate(issue.code === 'outliers' && (issue.low === undefined || issue.low === null) ? t.data.issue.outliers.bodyHigh : copy.body, vars),
    why: copy.why,
    action: copy.action,
    evidence: issue.rows?.length ? interpolate(t.data.evidence, { rows: issue.rows.join(', ') }) : null,
  };
}
