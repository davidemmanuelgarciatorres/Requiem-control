import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { usePreferences } from '../../app/preferences';
import { Button } from '../../components/ui/Button';

export const OUTPUT_SIZE = 256; // px: la imagen final se reduce siempre a este tamaño
const PREVIEW_MAX = 1024; // px: la foto se reduce UNA vez al abrir; recortar y mover ya no maneja 12 MP

type Source = { canvas: HTMLCanvasElement; url: string; naturalWidth: number; naturalHeight: number };

async function decode(file: File): Promise<CanvasImageSource & { width: number; height: number; close?: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file); // decodifica fuera del hilo principal y respeta la orientación EXIF
    } catch {
      /* formato no soportado por createImageBitmap: se intenta con <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const el = new Image();
    await new Promise<void>((resolve, reject) => {
      el.onload = () => resolve();
      el.onerror = () => reject(new Error('decode'));
      el.src = url;
    });
    return Object.assign(el, { width: el.naturalWidth, height: el.naturalHeight });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function prepare(file: File): Promise<Source> {
  const bmp = await decode(file);
  const k = Math.min(1, PREVIEW_MAX / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bmp.width * k));
  canvas.height = Math.max(1, Math.round(bmp.height * k));
  canvas.getContext('2d')?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.9));
  if (!blob) throw new Error('encode');
  return { canvas, url: URL.createObjectURL(blob), naturalWidth: canvas.width, naturalHeight: canvas.height };
}

type Props = { file: File; onCancel: () => void; onDone: (blob: Blob) => void };

/** Recorte cuadrado: arrastrar para mover, deslizador o pellizco para acercar, flechas y +/− con teclado. */
export function CropDialog({ file, onCancel, onDone }: Props) {
  const { t } = usePreferences();
  const [img, setImg] = useState<Source | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const viewRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<number | null>(null);
  const [view, setView] = useState(280);

  useEffect(() => {
    let cancelled = false;
    let made: Source | null = null;
    prepare(file)
      .then((src) => {
        made = src;
        if (cancelled) URL.revokeObjectURL(src.url);
        else setImg(src);
      })
      .catch(() => !cancelled && setError(t.floaters.notImage));
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made.url);
    };
  }, [file, t.floaters.notImage]);

  useEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    const measure = () => setView(el.clientWidth || 280);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [img]);

  const base = img ? Math.max(view / img.naturalWidth, view / img.naturalHeight) : 1;
  const scale = base * zoom;

  const clamp = (o: { x: number; y: number }, z = zoom) => {
    if (!img) return o;
    const s = base * z;
    const mx = Math.max(0, (img.naturalWidth * s - view) / 2);
    const my = Math.max(0, (img.naturalHeight * s - view) / 2);
    return { x: Math.min(mx, Math.max(-mx, o.x)), y: Math.min(my, Math.max(-my, o.y)) };
  };

  const setZoomClamped = (z: number) => {
    const nz = Math.min(4, Math.max(1, z));
    setZoom(nz);
    setOffset((o) => clamp(o, nz));
  };

  const onPointerDown = (e: PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onPointerMove = (e: PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (pinch.current) setZoomClamped(zoom * (d / pinch.current));
      pinch.current = d;
    } else {
      setOffset((o) => clamp({ x: o.x + e.clientX - prev.x, y: o.y + e.clientY - prev.y }));
    }
  };
  const onPointerUp = (e: PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };
  const onKey = (e: KeyboardEvent) => {
    const step = 12;
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key]) {
      e.preventDefault();
      const [dx, dy] = moves[e.key]!;
      setOffset((o) => clamp({ x: o.x + dx, y: o.y + dy }));
    } else if (e.key === '+' || e.key === '=') setZoomClamped(zoom + 0.2);
    else if (e.key === '-') setZoomClamped(zoom - 0.2);
    else if (e.key === 'Escape') onCancel();
  };

  const confirm = async () => {
    if (!img) return;
    setBusy(true);
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const src = view / scale;
    const sx = img.naturalWidth / 2 - (view / 2 + offset.x) / scale;
    const sy = img.naturalHeight / 2 - (view / 2 + offset.y) / scale;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img.canvas, sx, sy, src, src, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    const toBlob = (type: string, q: number) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, q));
    let blob = await toBlob('image/webp', 0.85);
    if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg', 0.9); // navegadores sin WebP
    setBusy(false);
    if (blob) onDone(blob);
  };

  // Portal al <body>: dentro de una tarjeta con backdrop-filter, `position: fixed` quedaría atrapado en ella.
  return createPortal(
    <div className="rc-modal-backdrop">
      <div className="rc-modal rc-glass rc-glass--strong" role="dialog" aria-modal="true" aria-label={t.floaters.cropTitle}>
        <h2 className="rc-card__title">{t.floaters.cropTitle}</h2>
        <p className="rc-list__meta">{t.floaters.cropHint}</p>
        {error ? <p className="rc-form__error" role="alert">{error}</p> : (
          <div
            ref={viewRef}
            className="rc-crop"
            tabIndex={0}
            role="img"
            aria-label={t.floaters.cropHint}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onKey}
            onWheel={(e) => setZoomClamped(zoom - e.deltaY * 0.002)}
          >
            {!img && <span className="rc-crop__loading" role="status" aria-label={t.common.loading}><span className="rc-btn__spinner" /></span>}
            {img && (
              <img
                src={img.url}
                alt=""
                draggable={false}
                style={{
                  width: img.naturalWidth * scale,
                  height: img.naturalHeight * scale,
                  transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                }}
              />
            )}
          </div>
        )}
        <label className="rc-field">
          <span className="rc-field__label">{t.floaters.zoom}</span>
          <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => setZoomClamped(Number(e.target.value))} className="rc-range" />
        </label>
        <div className="rc-row" style={{ justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onCancel}>{t.floaters.cancel}</Button>
          <Button variant="primary" onClick={() => void confirm()} loading={busy} disabled={!img || !!error}>{t.floaters.useImage}</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
