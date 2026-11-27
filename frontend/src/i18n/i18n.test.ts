import { describe, expect, it } from 'vitest';
import { en } from './en';
import { es } from './es';
import { interpolate } from '../lib/format';

function shape(obj: unknown, prefix = ''): string[] {
  if (Array.isArray(obj)) return [`${prefix}[${obj.length}]`];
  if (obj && typeof obj === 'object') return Object.entries(obj).flatMap(([k, v]) => shape(v, prefix ? `${prefix}.${k}` : k));
  return [prefix];
}

const values = (o: unknown): string[] => (typeof o === 'string' ? [o] : Object.values(o as object).flatMap(values));

describe('i18n', () => {
  it('es and en dictionaries have identical keys (and array lengths)', () => {
    expect(shape(en).sort()).toEqual(shape(es).sort());
  });
  it('has no empty strings', () => {
    expect(values(es).filter((s) => !s.trim())).toEqual([]);
    expect(values(en).filter((s) => !s.trim())).toEqual([]);
  });
  it('never shows the build process to users (phases, MVP, versions, servers)', () => {
    const forbidden = /\bFase\b|\bPhase\b|\bMVP\b|previst|Codespaces|sin servidor|PostgreSQL|0\.0\.0/;
    const visible = values(es).concat(values(en)).filter((s) => forbidden.test(s));
    expect(visible).toEqual([]);
  });

  it('interpolates placeholders', () => {
    expect(interpolate(es.auth.passwordHint, { n: 10 })).toBe('Mínimo 10 caracteres.');
    expect(interpolate('{a} {missing}', { a: 1 })).toBe('1 {missing}');
  });
});
