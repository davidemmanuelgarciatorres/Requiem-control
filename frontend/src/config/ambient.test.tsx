/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AmbientBackground } from '../components/layout/AmbientBackground';
import { AMBIENT_CYCLE_MS, AMBIENT_CYCLE_SECONDS, AMBIENT_SEQUENCE } from './ambient';

const css = readFileSync(resolve(process.cwd(), 'src/styles/ambient.css'), 'utf8');


/** Extrae los fotogramas { porcentaje: opacidad } de un @keyframes. */
function keyframes(name: string): Record<number, number> {
  const block = css.match(new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n\\}`))?.[1];
  if (!block) throw new Error(`keyframes ${name} not found`);
  const out: Record<number, number> = {};
  for (const m of block.matchAll(/([\d.]+)% \{ opacity: ([\d.]+); \}/g)) out[Number(m[1])] = Number(m[2]);
  return out;
}

describe('ambient background — 120-second cycle', () => {
  it('cycle constant is exactly 120 s', () => {
    expect(AMBIENT_CYCLE_SECONDS).toBe(120);
    expect(AMBIENT_CYCLE_MS).toBe(120_000);
  });

  it('documents the required colour sequence returning to the start', () => {
    expect(AMBIENT_SEQUENCE.map((s) => s.id)).toEqual(['space', 'turquoise', 'teal', 'violet', 'space']);
    expect(AMBIENT_SEQUENCE.map((s) => s.at)).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });

  it('injects the duration as the --ambient-cycle CSS variable', () => {
    const { getByTestId } = render(<AmbientBackground />);
    expect(getByTestId('ambient').style.getPropertyValue('--ambient-cycle')).toBe('120s');
  });

  it('every ambient animation uses var(--ambient-cycle) and loops forever', () => {
    expect(css).toMatch(/\.rc-ambient__layer \{[^}]*animation-duration: var\(--ambient-cycle\);[^}]*animation-iteration-count: infinite;/);
    expect(css).toMatch(/\.rc-ambient__orb \{[^}]*animation: rc-ambient-drift var\(--ambient-cycle\) ease-in-out infinite/);
    // No hay duraciones codificadas en segundos dentro de las animaciones ambientales.
    expect(css.match(/animation[^;]*\d+s/g) ?? []).toEqual([]);
  });

  it('layer opacities produce blue → turquoise → teal → violet → blue', () => {
    const tq = keyframes('rc-ambient-turquoise');
    const te = keyframes('rc-ambient-teal');
    const vi = keyframes('rc-ambient-violet');
    // Visible top layer at each stop (space blue is the always-opaque base).
    const topAt = (p: number) => (vi[p] === 1 ? 'violet' : te[p] === 1 ? 'teal' : tq[p] === 1 ? 'turquoise' : 'space');
    expect([0, 25, 50, 75].map(topAt)).toEqual(['space', 'turquoise', 'teal', 'violet']);
    // At 100 % every overlay is transparent: identical to the 0 % state → seamless loop.
    expect([tq[0], te[0], vi[0]]).toEqual([0, 0, 0]);
    expect([tq[100], te[100], vi[100]]).toEqual([0, 0, 0]);
  });

  it('disables the animation for reduced motion (OS and in-app preference)', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.rc-ambient__layer,\s*\.rc-ambient__orb \{ animation: none !important; \}/);
    expect(css).toMatch(/:root\[data-motion='reduced'\] \.rc-ambient__layer/);
  });
});
