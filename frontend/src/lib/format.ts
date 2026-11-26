import type { Language } from '../app/preferences';

const LOCALE: Record<Language, string> = { es: 'es-MX', en: 'en-US' };

export const localeFor = (lang: Language): string => LOCALE[lang];

/** Sustituye marcadores `{clave}` en una cadena traducida. */
export function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}

export function formatCurrency(value: number, lang: Language, currency = 'MXN', compact = false): string {
  return new Intl.NumberFormat(localeFor(lang), {
    style: 'currency',
    currency,
    maximumFractionDigits: compact ? 1 : 0,
    notation: compact ? 'compact' : 'standard',
  }).format(value);
}

export function formatNumber(value: number, lang: Language): string {
  return new Intl.NumberFormat(localeFor(lang)).format(value);
}

/** `value` es una fracción (0.124 → 12.4 %). */
export function formatPercent(value: number, lang: Language, digits = 1, signed = false): string {
  return new Intl.NumberFormat(localeFor(lang), {
    style: 'percent',
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
    signDisplay: signed ? 'exceptZero' : 'auto',
  }).format(value);
}

export function formatDate(date: Date, lang: Language, opts: Intl.DateTimeFormatOptions = { dateStyle: 'full' }): string {
  return new Intl.DateTimeFormat(localeFor(lang), opts).format(date);
}

export function greetingKey(date: Date): 'greetingMorning' | 'greetingAfternoon' | 'greetingEvening' {
  const h = date.getHours();
  if (h < 12) return 'greetingMorning';
  if (h < 19) return 'greetingAfternoon';
  return 'greetingEvening';
}
