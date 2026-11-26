import { describe, expect, it } from 'vitest';
import { en } from './en';
import { es } from './es';
import { interpolate } from '../lib/format';

function shape(obj: unknown, prefix = ''): string[] {
  if (Array.isArray(obj)) return [`${prefix}[${obj.length}]`];
  if (obj && typeof obj === 'object') return Object.entries(obj).flatMap(([k, v]) => shape(v, prefix ? `${prefix}.${k}` : k));
  return [prefix];
}

describe('i18n', () => {
  it('es and en dictionaries have identical keys (and array lengths)', () => {
    expect(shape(en).sort()).toEqual(shape(es).sort());
  });
  it('has no empty strings', () => {
    const values = (o: unknown): string[] => (typeof o === 'string' ? [o] : Object.values(o as object).flatMap(values));
    expect(values(es).filter((s) => !s.trim())).toEqual([]);
    expect(values(en).filter((s) => !s.trim())).toEqual([]);
  });
  it('interpolates placeholders', () => {
    expect(interpolate(es.common.phase, { n: 3 })).toBe('Fase 3');
    expect(interpolate('{a} {missing}', { a: 1 })).toBe('1 {missing}');
  });
});
