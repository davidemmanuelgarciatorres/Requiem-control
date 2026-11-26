import { describe, expect, it, vi } from 'vitest';
import { drawParticles, EFFECT_SHAPES, effectRadius, spawnCollision, spawnWall } from './effects';

function fakeCtx() {
  const fns = ['save', 'restore', 'translate', 'rotate', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'quadraticCurveTo',
    'bezierCurveTo', 'arc', 'ellipse', 'fill', 'stroke', 'fillText', 'strokeText'];
  const mocks = Object.fromEntries(fns.map((f) => [f, vi.fn()])) as Record<string, ReturnType<typeof vi.fn>>;
  return { ctx: mocks as unknown as CanvasRenderingContext2D, mocks };
}

describe('collision effects', () => {
  it('stay readable even with tiny images', () => {
    expect(effectRadius(32)).toBeGreaterThanOrEqual(46);
    expect(effectRadius(120)).toBeLessThanOrEqual(110);
  });

  it.each(EFFECT_SHAPES)('"%s" spawns visible particles that draw and then expire', (shape) => {
    const ps = spawnCollision(shape, '#ffd23f', 100, 100, 0, 64);
    expect(ps.length).toBeGreaterThan(0);
    const { ctx, mocks } = fakeCtx();
    const alive = drawParticles(ctx, ps, 120, 0.016);
    expect(alive.length).toBeGreaterThan(0);
    const drew = mocks.fill!.mock.calls.length + mocks.stroke!.mock.calls.length + mocks.fillText!.mock.calls.length;
    expect(drew).toBeGreaterThan(0);
    expect(drawParticles(ctx, alive, 5000, 0.016)).toHaveLength(0);
  });

  it('the comic effect prints an onomatopoeia', () => {
    const [p] = spawnCollision('comic', '#ffd23f', 0, 0, 0, 64);
    expect(p!.text).toMatch(/^¡[A-Z]+!$/);
  });

  it('wall bounces stay small and short', () => {
    const w = spawnWall('#fff', 0, 0, 0);
    expect(w.size).toBeLessThanOrEqual(14);
    expect(w.life).toBeLessThanOrEqual(400);
  });
});
