import type { FloaterShape } from './floaterStore';

/**
 * Efectos de los choques.
 * - Choque entre imágenes: efecto grande y claro (estilo anime/manga/cómic) con el color elegido.
 * - Rebote en la pared: una onda mínima y tenue, para que no moleste.
 *
 * Cada partícula guarda cómo dibujarse; el bucle solo la avanza y la llama.
 */
export type Particle = {
  kind: FloaterShape | 'wall' | 'drop' | 'shard';
  x: number; y: number; vx: number; vy: number;
  size: number; rot: number; vr: number;
  born: number; life: number; color: string; gravity: number;
  /** Datos propios del efecto (forma aleatoria, texto…). */
  seed: number;
  data?: number[];
  text?: string;
};

const INK = '#0b0b10';
const PAPER = '#ffffff';
const WORDS = ['¡POW!', '¡BAM!', '¡ZAS!', '¡PUM!', '¡CRASH!', '¡BONK!', '¡WHAM!'];

export const EFFECT_SHAPES: FloaterShape[] = [
  'impact', 'comic', 'anger', 'sparkle', 'lightning', 'sweat', 'scribble', 'splash', 'stars', 'hearts', 'ring', 'sparks',
];

/** Pide a la capa que muestre el efecto de choque en el centro de la pantalla (vista previa). */
export const PREVIEW_EVENT = 'rc:floater-preview';
export function previewEffect(): void {
  window.dispatchEvent(new Event(PREVIEW_EVENT));
}

/** Tamaño visible del efecto: siempre legible, aunque las imágenes sean pequeñas. */
export function effectRadius(imageSize: number): number {
  return Math.max(46, Math.min(110, imageSize * 0.95));
}

const rnd = (seed: number) => {
  let s = seed % 2147483647 || 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
};

function base(kind: Particle['kind'], x: number, y: number, now: number, color: string, size: number, life: number): Particle {
  return { kind, x, y, vx: 0, vy: 0, size, rot: 0, vr: 0, born: now, life, color, gravity: 0, seed: Math.floor(Math.random() * 1e9) + 1 };
}

export function spawnCollision(shape: FloaterShape, color: string, x: number, y: number, now: number, imageSize: number): Particle[] {
  const R = effectRadius(imageSize);
  const out: Particle[] = [];
  const burst = (n: number, speed: number, kind: Particle['kind'], size: () => number, life: number, gravity: number, upward = 0) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.6;
      const sp = speed * (0.55 + Math.random() * 0.9);
      const p = base(kind, x, y, now, color, size(), life + Math.random() * 250);
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp - upward;
      p.rot = a;
      p.vr = (Math.random() - 0.5) * 8;
      p.gravity = gravity;
      out.push(p);
    }
  };

  switch (shape) {
    case 'impact': {
      const p = base('impact', x, y, now, color, R, 520);
      p.rot = Math.random() * Math.PI;
      out.push(p);
      burst(6, R * 4, 'shard', () => R * 0.12, 380, 0);
      break;
    }
    case 'comic': {
      const p = base('comic', x, y, now, color, R, 900);
      p.text = WORDS[Math.floor(Math.random() * WORDS.length)];
      p.rot = (Math.random() - 0.5) * 0.5;
      out.push(p);
      break;
    }
    case 'anger': {
      const p = base('anger', x, y - R * 0.2, now, color, R * 0.75, 750);
      p.rot = (Math.random() - 0.5) * 0.6;
      out.push(p);
      break;
    }
    case 'sparkle': {
      for (let i = 0; i < 5; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = R * (0.25 + Math.random() * 0.85);
        const p = base('sparkle', x + Math.cos(a) * d, y + Math.sin(a) * d, now + i * 55, color, R * (0.22 + Math.random() * 0.25), 600);
        p.vy = -20;
        out.push(p);
      }
      break;
    }
    case 'lightning': {
      const p = base('lightning', x, y, now, color, R * 1.15, 480);
      p.rot = Math.random() * Math.PI * 2;
      out.push(p);
      break;
    }
    case 'sweat':
      burst(7, R * 3.2, 'drop', () => R * (0.13 + Math.random() * 0.1), 650, R * 9, R * 2.5);
      break;
    case 'scribble': {
      const p = base('scribble', x, y, now, color, R * 0.85, 800);
      out.push(p);
      burst(4, R * 2.4, 'stars', () => R * 0.11, 600, 0);
      break;
    }
    case 'ring':
      for (let i = 0; i < 2; i++) out.push(base('ring', x, y, now + i * 110, color, R, 650 + i * 200));
      break;
    case 'splash':
      burst(18, R * 3.2, 'splash', () => R * (0.06 + Math.random() * 0.12), 700, R * 6);
      break;
    case 'hearts':
      burst(9, R * 1.6, 'hearts', () => R * (0.12 + Math.random() * 0.1), 900, -R * 0.6, R);
      break;
    case 'stars':
      burst(10, R * 2.8, 'stars', () => R * (0.1 + Math.random() * 0.1), 750, R);
      break;
    case 'sparks':
      burst(14, R * 4.2, 'sparks', () => R * (0.12 + Math.random() * 0.1), 450, R * 1.5);
      break;
  }
  return out;
}

/** Rebote con la pared: una sola onda pequeña y tenue (para que no moleste). */
export function spawnWall(color: string, x: number, y: number, now: number): Particle {
  return base('wall', x, y, now, color, 14, 320);
}

// --- Dibujo -------------------------------------------------------------------

function star(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 ? r * 0.45 : r;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  ctx.closePath();
}

function sparkle4(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.quadraticCurveTo(r * 0.12, -r * 0.12, r, 0);
  ctx.quadraticCurveTo(r * 0.12, r * 0.12, 0, r);
  ctx.quadraticCurveTo(-r * 0.12, r * 0.12, -r, 0);
  ctx.quadraticCurveTo(-r * 0.12, -r * 0.12, 0, -r);
  ctx.closePath();
}

function heart(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath();
  ctx.moveTo(0, r * 0.35);
  ctx.bezierCurveTo(-r * 1.1, -r * 0.35, -r * 0.45, -r * 1.05, 0, -r * 0.45);
  ctx.bezierCurveTo(r * 0.45, -r * 1.05, r * 1.1, -r * 0.35, 0, r * 0.35);
}

function drop(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath();
  ctx.moveTo(0, -r * 1.6);
  ctx.bezierCurveTo(r * 0.9, -r * 0.3, r, r, 0, r);
  ctx.bezierCurveTo(-r, r, -r * 0.9, -r * 0.3, 0, -r * 1.6);
  ctx.closePath();
}

/** Contorno de tinta + relleno, como un dibujo de manga. */
function inked(ctx: CanvasRenderingContext2D, fill: string, line: number) {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = line;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Escala de "golpe": crece rápido, rebota un poco y se asienta. */
function pop(t: number): number {
  if (t < 0.18) return (t / 0.18) * 1.18;
  if (t < 0.32) return 1.18 - ((t - 0.18) / 0.14) * 0.18;
  return 1;
}

function drawImpact(ctx: CanvasRenderingContext2D, p: Particle, t: number) {
  const r = rnd(p.seed);
  const R = p.size * pop(t);
  ctx.rotate(p.rot);
  ctx.globalAlpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
  // Líneas de velocidad radiales (manga), blancas para que se vean sobre el fondo oscuro.
  ctx.strokeStyle = PAPER;
  ctx.lineCap = 'round';
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + r() * 0.2;
    const r0 = R * (1.05 + r() * 0.2);
    const r1 = R * (1.5 + r() * 0.5);
    ctx.lineWidth = 1.5 + r() * 2.5;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    ctx.stroke();
  }
  // Estallido dentado: color elegido con centro blanco.
  const spikes = 11;
  const pts: [number, number][] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const rad = i % 2 ? R * (0.45 + r() * 0.12) : R * (0.85 + r() * 0.3);
    pts.push([Math.cos(a) * rad, Math.sin(a) * rad]);
  }
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.closePath();
  inked(ctx, p.color, Math.max(3, R * 0.07));
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(px * 0.45, py * 0.45) : ctx.moveTo(px * 0.45, py * 0.45)));
  ctx.closePath();
  ctx.fillStyle = PAPER;
  ctx.fill();
}

function halftone(ctx: CanvasRenderingContext2D, R: number, color: string) {
  ctx.fillStyle = color;
  const step = Math.max(6, R / 8);
  for (let gy = -R; gy <= R; gy += step) {
    for (let gx = -R; gx <= R; gx += step) {
      const d = Math.hypot(gx, gy) / R;
      if (d > 1) continue;
      ctx.beginPath();
      ctx.arc(gx, gy, (step / 2) * (1 - d * 0.85), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawComic(ctx: CanvasRenderingContext2D, p: Particle, t: number) {
  // Animación "en dos" (12 cuadros por segundo) y desfase de color, como impresión de cómic.
  const stepped = Math.floor((t * p.life) / 83) * 83 / p.life;
  const R = p.size * pop(stepped);
  const jitter = stepped < 0.5 ? ((Math.floor(stepped * 12) % 2) * 2 - 1) * R * 0.04 : 0;
  ctx.globalAlpha = stepped > 0.75 ? 1 - (stepped - 0.75) / 0.25 : 1;
  ctx.translate(jitter, -jitter);
  halftone(ctx, R * 1.25, p.color);
  ctx.rotate(p.rot);
  const word = p.text ?? '¡POW!';
  ctx.font = `italic 900 ${Math.round(R * 0.62)}px "Inter Variable", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const off = R * 0.06;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#00e5ff';
  ctx.fillText(word, -off, off * 0.6);
  ctx.fillStyle = '#ff2bd6';
  ctx.fillText(word, off, -off * 0.6);
  ctx.lineWidth = Math.max(3, R * 0.1);
  ctx.strokeStyle = INK;
  ctx.strokeText(word, 0, 0);
  ctx.fillStyle = '#fff36b';
  ctx.fillText(word, 0, 0);
}

function drawAnger(ctx: CanvasRenderingContext2D, p: Particle, t: number) {
  // Vena de enojo (╬): cuatro esquinas curvas que laten.
  const pulse = 1 + Math.sin(t * Math.PI * 6) * 0.1;
  const R = p.size * pop(t) * pulse;
  ctx.rotate(p.rot);
  ctx.globalAlpha = t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
  ctx.lineCap = 'round';
  for (const [w, color] of [[0.26, PAPER], [0.19, INK], [0.12, p.color]] as const) {
    ctx.lineWidth = Math.max(2, R * w);
    ctx.strokeStyle = color;
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 2);
      ctx.beginPath();
      ctx.moveTo(R * 0.14, -R * 0.62);
      ctx.quadraticCurveTo(R * 0.14, -R * 0.14, R * 0.62, -R * 0.14);
      ctx.stroke();
      ctx.restore();
    }
  }
}

function drawLightning(ctx: CanvasRenderingContext2D, p: Particle, t: number) {
  const r = rnd(p.seed + Math.floor(t * 8)); // el rayo "parpadea" cambiando de forma
  const R = p.size;
  ctx.globalAlpha = t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1;
  for (let b = 0; b < 4; b++) {
    const a = p.rot + (b / 4) * Math.PI * 2 + r() * 0.4;
    ctx.save();
    ctx.rotate(a);
    ctx.beginPath();
    let x = R * 0.15;
    ctx.moveTo(x, 0);
    for (let k = 0; k < 4; k++) {
      x += R * 0.22;
      ctx.lineTo(x, (k % 2 ? -1 : 1) * R * (0.08 + r() * 0.1));
    }
    ctx.lineWidth = Math.max(6, R * 0.12);
    ctx.strokeStyle = PAPER;
    ctx.lineJoin = 'miter';
    ctx.stroke();
    ctx.lineWidth = Math.max(3, R * 0.06);
    ctx.strokeStyle = p.color;
    ctx.stroke();
    ctx.restore();
  }
}

function drawScribble(ctx: CanvasRenderingContext2D, p: Particle, t: number) {
  // Nube de pelea: garabato enredado que se dibuja y se desvanece.
  const r = rnd(p.seed);
  const R = p.size * pop(t);
  ctx.globalAlpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
  const total = 26;
  const shown = Math.max(2, Math.floor(total * Math.min(1, t / 0.35)));
  ctx.beginPath();
  let a = 0;
  for (let i = 0; i < shown; i++) {
    a += 1.9 + r() * 0.9;
    const rad = R * (0.35 + r() * 0.65);
    const px = Math.cos(a) * rad;
    const py = Math.sin(a) * rad * 0.8;
    if (i) ctx.quadraticCurveTo(px * 0.3, py * 0.3, px, py);
    else ctx.moveTo(px, py);
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(4, R * 0.09);
  ctx.strokeStyle = PAPER;
  ctx.stroke();
  ctx.lineWidth = Math.max(2, R * 0.045);
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.lineWidth = Math.max(1.5, R * 0.025);
  ctx.strokeStyle = p.color;
  ctx.stroke();
}

/** Avanza y dibuja; devuelve las partículas que siguen vivas. */
export function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[], now: number, dt: number): Particle[] {
  const alive: Particle[] = [];
  for (const p of particles) {
    const age = now - p.born;
    if (age < 0) { alive.push(p); continue; }
    if (age > p.life) continue;
    const t = age / p.life;
    p.vx *= p.kind === 'shard' || p.kind === 'sparks' ? 0.9 : 0.985;
    p.vy = p.vy * (p.kind === 'shard' || p.kind === 'sparks' ? 0.9 : 0.985) + p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = p.color;
    ctx.strokeStyle = p.color;
    switch (p.kind) {
      case 'wall':
        ctx.globalAlpha = 0.35 * (1 - t);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, p.size * (0.3 + t), 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'ring':
        ctx.globalAlpha = 0.9 * (1 - t);
        ctx.lineWidth = 6 * (1 - t) + 2;
        ctx.beginPath();
        ctx.arc(0, 0, p.size * (0.2 + t * 1.3), 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'impact': drawImpact(ctx, p, t); break;
      case 'comic': drawComic(ctx, p, t); break;
      case 'anger': drawAnger(ctx, p, t); break;
      case 'lightning': drawLightning(ctx, p, t); break;
      case 'scribble': drawScribble(ctx, p, t); break;
      case 'sparkle': {
        const s = p.size * Math.sin(Math.min(1, t * 1.6) * Math.PI);
        ctx.rotate(t * 1.2);
        sparkle4(ctx, Math.max(0.1, s));
        inked(ctx, p.color, Math.max(1.5, p.size * 0.08));
        break;
      }
      case 'drop':
        ctx.globalAlpha = 1 - t * t;
        ctx.rotate(Math.atan2(p.vy, p.vx) + Math.PI / 2 + Math.PI);
        drop(ctx, p.size);
        inked(ctx, p.color, Math.max(1.5, p.size * 0.18));
        break;
      case 'shard':
        ctx.globalAlpha = 1 - t;
        ctx.rotate(Math.atan2(p.vy, p.vx));
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(2, p.size * 0.5);
        ctx.strokeStyle = PAPER;
        ctx.beginPath();
        ctx.moveTo(-p.size * 2, 0);
        ctx.lineTo(p.size * 2, 0);
        ctx.stroke();
        break;
      case 'splash':
        ctx.globalAlpha = 1 - t * t;
        // Gota alargada en la dirección del movimiento, como pintura salpicada.
        ctx.rotate(Math.atan2(p.vy, p.vx));
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size * 1.9 * (1 - t * 0.4), p.size * (1 - t * 0.4), 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'stars':
        ctx.globalAlpha = 1 - t * t;
        ctx.rotate(p.rot);
        star(ctx, p.size);
        inked(ctx, p.color, Math.max(1.5, p.size * 0.15));
        break;
      case 'hearts':
        ctx.globalAlpha = 1 - t * t;
        ctx.rotate(Math.sin(p.rot) * 0.3);
        heart(ctx, p.size);
        inked(ctx, p.color, Math.max(1.5, p.size * 0.12));
        break;
      case 'sparks':
        ctx.globalAlpha = 1 - t;
        ctx.rotate(Math.atan2(p.vy, p.vx));
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(2, p.size * 0.25);
        ctx.beginPath();
        ctx.moveTo(-p.size * 1.6, 0);
        ctx.lineTo(p.size * 1.2, 0);
        ctx.stroke();
        break;
    }
    ctx.restore();
    alive.push(p);
  }
  return alive;
}
