import { describe, expect, it } from 'vitest';
import { centerLongitude, nightFactor, rotationAt } from '../components/earth/earthMath';
import { AMBIENT_CYCLE_MS, AMBIENT_CYCLE_SECONDS, SUN_DIRECTION } from './ambient';

describe('Earth background — 120-second rotation', () => {
  it('one full rotation lasts exactly 120 s', () => {
    expect(AMBIENT_CYCLE_SECONDS).toBe(120);
    expect(AMBIENT_CYCLE_MS).toBe(120_000);
  });

  it('rotation is periodic: the globe returns to its original state after 120 s', () => {
    for (const t of [0, 1234, 59_999, 1_700_000_000_123]) {
      expect(rotationAt(t + AMBIENT_CYCLE_MS)).toBeCloseTo(rotationAt(t), 10);
    }
    expect(rotationAt(0)).toBe(0);
    expect(rotationAt(30_000)).toBeCloseTo(Math.PI / 2, 10); // un cuarto de vuelta en 30 s
    expect(rotationAt(60_000)).toBeCloseTo(Math.PI, 10);
  });

  it('every longitude passes through the centre during one cycle (all continents are shown)', () => {
    const seen = new Set<number>();
    for (let t = 0; t < AMBIENT_CYCLE_MS; t += 500) seen.add(Math.floor((centerLongitude(rotationAt(t)) + 180) / 10) % 36);
    expect(seen.size).toBe(36); // 36 franjas de 10°
  });

  it('city lights only at night: night factor is 0 in daylight and 1 in darkness', () => {
    expect(nightFactor(1)).toBe(0); // sol en el cenit
    expect(nightFactor(0.2)).toBe(0);
    expect(nightFactor(-0.5)).toBe(1);
    expect(nightFactor(-0.05)).toBeGreaterThan(0);
    expect(nightFactor(-0.05)).toBeLessThan(1); // crepúsculo gradual
  });

  it('sun direction is a unit vector', () => {
    expect(Math.hypot(...SUN_DIRECTION)).toBeCloseTo(1, 10);
  });
});

describe('EarthGlobe without WebGL', () => {
  it('falls back to a static background instead of crashing', async () => {
    const { render } = await import('@testing-library/react');
    const { AmbientBackground } = await import('../components/layout/AmbientBackground');
    const { container } = render(<AmbientBackground />);
    const earth = container.querySelector('.rc-earth')!;
    await new Promise((r) => setTimeout(r, 0));
    expect(earth.getAttribute('data-status')).toBe('fallback');
    expect(container.querySelector('.rc-earth__fallback')).not.toBeNull();
  });
});
