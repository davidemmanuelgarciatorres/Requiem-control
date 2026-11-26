import type { FloaterShape } from './floaterStore';

/** Partículas de los efectos. Choque entre imágenes: efecto grande con forma y color elegidos. Pared: onda mínima. */
export type Particle = {
  kind: FloaterShape | 'wall';
  x: number; y: number; vx: number; vy: number;
  size: number; rot: number; vr: number;
  born: number; life: number; color: string; gravity: number;
};

export function spawnCollision(shape: FloaterShape, color: string, x: number, y: number, now: number, scale: number): Particle[] {
  const out: Particle[] = [];
  const base = { x, y, born: now, color, rot: 0, vr: 0, gravity: 0 };
  if (shape === 'ring') {
    for (let i = 0; i < 2; i++) out.push({ ...base, kind: 'ring', vx: 0, vy: 0, size: scale * 0.9, life: 650 + i * 200, born: now + i * 110 });
    return out;
  }
  const count = shape === 'splash' ? 16 : 11;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
    const sp = (shape === 'hearts' ? 60 : 140) * (0.5 + Math.random()) * (scale / 64);
    out.push({
      ...base,
      kind: shape,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - (shape === 'hearts' ? 50 : 0),
      size: (shape === 'splash' ? 3 + Math.random() * 6 : 5 + Math.random() * 5) * (scale / 64),
      rot: a,
      vr: (Math.random() - 0.5) * 6,
      life: 650 + Math.random() * 350,
      gravity: shape === 'splash' ? 320 : shape === 'hearts' ? -40 : 60,
    });
  }
  return out;
}

/** Rebote con la pared: una sola onda pequeña y tenue (para que no moleste). */
export function spawnWall(color: string, x: number, y: number, now: number): Particle {
  return { kind: 'wall', x, y, vx: 0, vy: 0, size: 14, rot: 0, vr: 0, born: now, life: 320, color, gravity: 0 };
}

function star(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 ? r * 0.45 : r;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fill();
}

function heart(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath();
  ctx.moveTo(0, r * 0.35);
  ctx.bezierCurveTo(-r * 1.1, -r * 0.35, -r * 0.45, -r * 1.05, 0, -r * 0.45);
  ctx.bezierCurveTo(r * 0.45, -r * 1.05, r * 1.1, -r * 0.35, 0, r * 0.35);
  ctx.fill();
}

/** Avanza y dibuja; devuelve las partículas que siguen vivas. */
export function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[], now: number, dt: number): Particle[] {
  const alive: Particle[] = [];
  for (const p of particles) {
    const age = now - p.born;
    if (age < 0) { alive.push(p); continue; }
    if (age > p.life) continue;
    const t = age / p.life;
    p.vy += p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = p.color;
    ctx.strokeStyle = p.color;
    if (p.kind === 'wall') {
      ctx.globalAlpha = 0.35 * (1 - t);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, p.size * (0.3 + t), 0, Math.PI * 2);
      ctx.stroke();
    } else if (p.kind === 'ring') {
      ctx.globalAlpha = 0.85 * (1 - t);
      ctx.lineWidth = 3 * (1 - t) + 1;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(0, 0, p.size * (0.2 + t * 1.3), 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.globalAlpha = 1 - t * t;
      ctx.rotate(p.rot);
      const s = p.size * (p.kind === 'splash' ? 1 - t * 0.5 : 1);
      if (p.kind === 'splash') {
        // Gota alargada en la dirección del movimiento, como pintura salpicada.
        ctx.rotate(Math.atan2(p.vy, p.vx) - p.rot);
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 1.8, s, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'stars') star(ctx, s);
      else if (p.kind === 'hearts') heart(ctx, s);
      else {
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-s, 0);
        ctx.lineTo(s * 1.4, 0);
        ctx.stroke();
      }
    }
    ctx.restore();
    alive.push(p);
  }
  return alive;
}
