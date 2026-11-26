/** Física simple de rebote: cuerpos circulares, paredes y choques elásticos entre imágenes (misma masa). */

export type Body = { id: string; x: number; y: number; vx: number; vy: number; r: number };
export type PhysicsEvent = { type: 'wall' | 'collide'; x: number; y: number; key: string };

export const SPEEDS = { slow: 45, normal: 85, fast: 150 } as const; // px/s

/** Coloca los cuerpos sin superponerse y con direcciones variadas. */
export function spawnBodies(ids: string[], size: number, width: number, height: number, speed: number, seed = 7): Body[] {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const r = size / 2;
  return ids.map((id, i) => {
    const angle = (Math.PI / 4) + i * (Math.PI * 0.62) + rand() * 0.4;
    const x = r + ((i + 0.5) / ids.length) * Math.max(1, width - 2 * r);
    const y = r + (0.25 + 0.5 * rand()) * Math.max(1, height - 2 * r);
    return { id, x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r };
  });
}

/** Avanza la simulación `dt` segundos dentro de [0,width]×[0,height]. Devuelve los rebotes ocurridos. */
export function step(bodies: Body[], dt: number, width: number, height: number): PhysicsEvent[] {
  const events: PhysicsEvent[] = [];
  for (const b of bodies) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx); events.push({ type: 'wall', x: 0, y: b.y, key: `${b.id}:l` }); }
    else if (b.x + b.r > width) { b.x = width - b.r; b.vx = -Math.abs(b.vx); events.push({ type: 'wall', x: width, y: b.y, key: `${b.id}:r` }); }
    if (b.y - b.r < 0) { b.y = b.r; b.vy = Math.abs(b.vy); events.push({ type: 'wall', x: b.x, y: 0, key: `${b.id}:t` }); }
    else if (b.y + b.r > height) { b.y = height - b.r; b.vy = -Math.abs(b.vy); events.push({ type: 'wall', x: b.x, y: height, key: `${b.id}:b` }); }
  }
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i]!;
      const b = bodies[j]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 0.0001;
      const min = a.r + b.r;
      if (dist >= min) continue;
      const nx = dx / dist;
      const ny = dy / dist;
      // Separar para que no queden encimadas.
      const push = (min - dist) / 2;
      a.x -= nx * push; a.y -= ny * push;
      b.x += nx * push; b.y += ny * push;
      const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (rel <= 0) continue; // ya se alejan
      // Choque elástico entre masas iguales: intercambian la componente normal.
      a.vx -= rel * nx; a.vy -= rel * ny;
      b.vx += rel * nx; b.vy += rel * ny;
      events.push({ type: 'collide', x: a.x + nx * a.r, y: a.y + ny * a.r, key: `${a.id}|${b.id}` });
    }
  }
  return events;
}

/** Ajusta la rapidez de todos los cuerpos conservando su dirección. */
export function setSpeed(bodies: Body[], speed: number) {
  for (const b of bodies) {
    const m = Math.hypot(b.vx, b.vy) || 1;
    b.vx = (b.vx / m) * speed;
    b.vy = (b.vy / m) * speed;
  }
}
