import { useEffect, useRef } from 'react';
import { usePreferences } from '../../app/preferences';
import { drawParticles, PREVIEW_EVENT, spawnCollision, spawnWall, type Particle } from './effects';
import { useFloaters } from './FloatersContext';
import { setSpeed, spawnBodies, SPEEDS, step, type Body } from './physics';

const COLLIDE_COOLDOWN_MS = 300;
const WALL_COOLDOWN_MS = 400;

function reducedMotion(): boolean {
  if (document.documentElement.dataset.motion === 'reduced') return true;
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Capa de imágenes que rebotan. No captura toques ni clics (`pointer-events: none`). */
export function FloatersLayer() {
  const { images, preferences: prefs } = useFloaters();
  const { motion } = usePreferences();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prefsRef = useRef(prefs);
  // Las preferencias se leen en cada cuadro sin reiniciar la animación.
  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);
  const visible = prefs.enabled && images.length > 0;
  const key = images.map((i) => i.id).join(',');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!visible || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const loaded = new Map<string, HTMLImageElement>();
    images.forEach((im) => {
      const el = new Image();
      el.decoding = 'async';
      el.src = im.url;
      loaded.set(im.id, el);
    });

    let width = 0;
    let height = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    let size = prefsRef.current.size;
    let speed = SPEEDS[prefsRef.current.speed];
    const bodies: Body[] = spawnBodies(images.map((i) => i.id), size, width, height, speed);
    let particles: Particle[] = [];
    const cooldown = new Map<string, number>();
    let last = performance.now();
    let raf = 0;

    const drawBodies = () => {
      for (const b of bodies) {
        const img = loaded.get(b.id);
        if (!img || !img.complete || !img.naturalWidth) continue;
        const s = b.r * 2;
        const x = b.x - b.r;
        const y = b.y - b.r;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.45)';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.roundRect(x, y, s, s, s * 0.18);
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.clip();
        ctx.drawImage(img, x, y, s, s);
        ctx.restore();
      }
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const p = prefsRef.current;
      if (p.size !== size) {
        size = p.size;
        for (const b of bodies) b.r = size / 2;
      }
      if (SPEEDS[p.speed] !== speed) {
        speed = SPEEDS[p.speed];
        setSpeed(bodies, speed);
      }
      for (const ev of step(bodies, dt, width, height)) {
        const lastAt = cooldown.get(ev.key) ?? 0;
        const wait = ev.type === 'collide' ? COLLIDE_COOLDOWN_MS : WALL_COOLDOWN_MS;
        if (now - lastAt < wait) continue;
        cooldown.set(ev.key, now);
        if (ev.type === 'collide') particles.push(...spawnCollision(p.effect_shape, p.effect_color, ev.x, ev.y, now, size));
        else particles.push(spawnWall(p.effect_color, ev.x, ev.y, now));
      }
      ctx.clearRect(0, 0, width, height);
      drawBodies();
      particles = drawParticles(ctx, particles, now, dt);
    };

    const staticFrame = () => {
      ctx.clearRect(0, 0, width, height);
      drawBodies();
    };

    const start = () => {
      cancelAnimationFrame(raf);
      if (document.hidden) return;
      if (reducedMotion()) {
        staticFrame();
        loaded.forEach((img) => img.addEventListener('load', staticFrame, { once: true }));
      } else {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    const onResize = () => {
      resize();
      for (const b of bodies) {
        b.x = Math.min(Math.max(b.r, b.x), Math.max(b.r, width - b.r));
        b.y = Math.min(Math.max(b.r, b.y), Math.max(b.r, height - b.r));
      }
      if (reducedMotion()) staticFrame();
    };
    const onPreview = () => {
      if (reducedMotion()) return;
      const p = prefsRef.current;
      particles.push(...spawnCollision(p.effect_shape, p.effect_color, width / 2, height / 2, performance.now(), size));
    };
    window.addEventListener('resize', onResize);
    window.addEventListener(PREVIEW_EVENT, onPreview);
    document.addEventListener('visibilitychange', start);
    start();
    return () => {
      window.removeEventListener(PREVIEW_EVENT, onPreview);
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', start);
    };
    // `images` cambia junto con `key`; las preferencias se leen en vivo desde prefsRef.
  }, [visible, key, motion, images]);

  if (!visible) return null;
  return (
    <canvas
      ref={canvasRef}
      className={`rc-floaters rc-floaters--${prefs.layer}`}
      aria-hidden="true"
      data-testid="floaters-layer"
      data-count={images.length}
    />
  );
}
