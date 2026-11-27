import { describe, expect, it } from 'vitest';
import { interpolate } from './format';

describe('interpolate', () => {
  it('fills placeholders and picks singular/plural', () => {
    const tpl = '{count} {count|producto tiene|productos tienen} existencia negativa.';
    expect(interpolate(tpl, { count: 1 })).toBe('1 producto tiene existencia negativa.');
    expect(interpolate(tpl, { count: 3 })).toBe('3 productos tienen existencia negativa.');
    expect(interpolate(tpl, { count: '1,250' })).toBe('1,250 productos tienen existencia negativa.');
    expect(interpolate('Hola {name}', {})).toBe('Hola {name}');
  });
});
