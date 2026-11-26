import { useEffect, useRef, useState } from 'react';
import { AMBIENT_CYCLE_MS, EARTH_AXIAL_TILT_RAD, EARTH_MAX_FPS, EARTH_VIEW_PITCH_RAD, SUN_DIRECTION } from '../../config/ambient';
import { assetUrl } from '../../lib/env';
import { rotationAt } from './earthMath';
import { FRAGMENT_SHADER, VERTEX_SHADER } from './earthShader';

const TEXTURES = { day: assetUrl('earth/earth-day.webp'), night: assetUrl('earth/earth-night.webp'), masks: assetUrl('earth/earth-masks.webp') } as const;
/** Fracción del lado menor del lienzo que ocupa el radio del globo (el resto es halo). */
const RADIUS_FRACTION = 0.44;
const MAX_DPR = 1.5;

type Status = 'loading' | 'ready' | 'fallback';

function prefersReducedMotion(): boolean {
  if (document.documentElement.dataset.motion === 'reduced') return true;
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`texture ${src}`));
    img.src = src;
  });
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'shader');
  return shader;
}

/**
 * Globo terrestre en WebGL2. Gira una vez cada 120 s (fase derivada del reloj de pared),
 * dibuja como máximo a 30 fps, se pausa con la pestaña oculta y respeta el movimiento
 * reducido (un único fotograma fijo). Si WebGL2 o las texturas fallan, muestra un
 * respaldo estático en CSS.
 */
export function EarthGlobe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      // Solo en navegadores automatizados (pruebas e2e) para poder leer los píxeles.
      preserveDrawingBuffer: typeof navigator !== 'undefined' && navigator.webdriver === true,
      powerPreference: 'low-power',
    });
    if (!gl) {
      setStatus('fallback');
      return;
    }

    let disposed = false;
    let raf = 0;
    let lastDraw = 0;
    let program: WebGLProgram | null = null;
    const textures: WebGLTexture[] = [];
    let uniforms: Record<string, WebGLUniformLocation | null> = {};

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const w = Math.round(canvas.clientWidth * dpr);
      const h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };

    const draw = (now: number) => {
      if (!program) return;
      resize();
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(uniforms.uResolution!, canvas.width, canvas.height);
      gl.uniform1f(uniforms.uRadius!, Math.min(canvas.width, canvas.height) * RADIUS_FRACTION);
      gl.uniform1f(uniforms.uRotation!, rotationAt(now, AMBIENT_CYCLE_MS));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = Date.now();
      // abs(): si el reloj del sistema retrocede, se vuelve a dibujar igualmente.
      if (Math.abs(now - lastDraw) < 1000 / EARTH_MAX_FPS) return;
      lastDraw = now;
      draw(now);
    };

    const start = () => {
      cancelAnimationFrame(raf);
      if (disposed || document.hidden) return;
      if (prefersReducedMotion()) draw(Date.now());
      else loop();
    };

    const init = async () => {
      try {
        const [day, night, masks] = await Promise.all([loadImage(TEXTURES.day), loadImage(TEXTURES.night), loadImage(TEXTURES.masks)]);
        if (disposed) return;
        program = gl.createProgram()!;
        gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
        gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'link');
        gl.useProgram(program);

        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(program, 'aPos');
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

        [day, night, masks].forEach((img, i) => {
          const tex = gl.createTexture()!;
          textures.push(tex);
          gl.activeTexture(gl.TEXTURE0 + i);
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
          gl.generateMipmap(gl.TEXTURE_2D);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        });

        const names = ['uDay', 'uNight', 'uMasks', 'uResolution', 'uRadius', 'uRotation', 'uTilt', 'uPitch', 'uSun'];
        uniforms = Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(program!, n)]));
        gl.uniform1i(uniforms.uDay!, 0);
        gl.uniform1i(uniforms.uNight!, 1);
        gl.uniform1i(uniforms.uMasks!, 2);
        gl.uniform1f(uniforms.uTilt!, EARTH_AXIAL_TILT_RAD);
        gl.uniform1f(uniforms.uPitch!, EARTH_VIEW_PITCH_RAD);
        gl.uniform3f(uniforms.uSun!, ...SUN_DIRECTION);

        setStatus('ready');
        start();
      } catch (e) {
        console.warn('Earth background disabled:', e);
        if (!disposed) setStatus('fallback');
      }
    };

    const onVisibility = () => start();
    const motionQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    const motionObserver = new MutationObserver(() => start());
    document.addEventListener('visibilitychange', onVisibility);
    motionQuery?.addEventListener?.('change', start);
    motionObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => program && prefersReducedMotion() && draw(Date.now())) : null;
    ro?.observe(canvas);
    void init();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
      motionQuery?.removeEventListener?.('change', start);
      motionObserver.disconnect();
      ro?.disconnect();
      textures.forEach((t) => gl.deleteTexture(t));
      if (program) gl.deleteProgram(program);
    };
  }, []);

  return (
    <div className="rc-earth" data-status={status}>
      <canvas ref={canvasRef} className="rc-earth__canvas" data-testid="earth-canvas" data-cycle-ms={AMBIENT_CYCLE_MS} />
      {status !== 'ready' && <div className="rc-earth__fallback" />}
      <div className="rc-earth__sun" />
    </div>
  );
}
