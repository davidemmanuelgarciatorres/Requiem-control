import { useEffect, useId, useMemo, useRef, useState } from 'react';

export type SeriesPoint = { label: string; value: number };

type AreaChartProps = {
  data: SeriesPoint[];
  /** Descripción accesible (qué muestra, unidades y periodo). */
  ariaLabel: string;
  formatValue: (v: number) => string;
  formatAxis?: (v: number) => string;
  height?: number;
  /** Encabezados de la tabla accesible. */
  tableHeaders: [string, string];
};

const PAD = { top: 16, right: 12, bottom: 28, left: 52 };

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  const n = v / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * mag;
}

/**
 * Gráfica de área de una serie en SVG puro (sin dependencias).
 * Incluye retícula recesiva, cruz + tooltip al pasar el cursor/teclado y una
 * tabla de datos para lectores de pantalla.
 */
export function AreaChart({ data, ariaLabel, formatValue, formatAxis = formatValue, height = 260, tableHeaders }: AreaChartProps) {
  const gradientId = useId();
  const [active, setActive] = useState<number | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  // Se dibuja al ancho real en píxeles para que el texto de los ejes no se escale.
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = plotRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry?.contentRect.width ?? 0);
      if (w > 0) setW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = height;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const { points, max, ticks } = useMemo(() => {
    const maxV = niceMax(Math.max(...data.map((d) => d.value)) * 1.08);
    const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;
    const pts = data.map((d, i) => ({ x: PAD.left + i * stepX, y: PAD.top + innerH - (d.value / maxV) * innerH, ...d }));
    return { points: pts, max: maxV, ticks: [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxV) };
  }, [data, innerW, innerH]);
  const labelEvery = W < 420 ? 3 : W < 640 ? 2 : 1;

  if (points.length === 0) return null;
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const area = `${line} L${last.x.toFixed(1)},${PAD.top + innerH} L${first.x.toFixed(1)},${PAD.top + innerH} Z`;
  const activePoint = active !== null ? points[active] : undefined;

  const onMove = (clientX: number, rect: DOMRect) => {
    const x = ((clientX - rect.left) / rect.width) * W;
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(p.x - x) < Math.abs(points[best]!.x - x)) best = i;
    });
    setActive(best);
  };

  return (
    <figure className="rc-chart">
      <div className="rc-chart__plot" ref={plotRef}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={ariaLabel}
          tabIndex={0}
          onPointerMove={(e) => onMove(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerLeave={() => setActive(null)}
          onBlur={() => setActive(null)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') setActive((a) => Math.min(points.length - 1, (a ?? -1) + 1));
            if (e.key === 'ArrowLeft') setActive((a) => Math.max(0, (a ?? points.length) - 1));
          }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--rc-chart-1)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--rc-chart-1)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((tv) => {
            const y = PAD.top + innerH - (tv / max) * innerH;
            return (
              <g key={tv}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="var(--rc-chart-grid)" />
                <text x={PAD.left - 10} y={y + 4} textAnchor="end" className="rc-chart__axis">{formatAxis(tv)}</text>
              </g>
            );
          })}
          {points.map((p, i) =>
            i % labelEvery === 0 || i === points.length - 1 ? (
              <text key={p.label} x={p.x} y={H - 8} textAnchor="middle" className="rc-chart__axis">{p.label}</text>
            ) : null,
          )}
          <path d={area} fill={`url(#${gradientId})`} />
          <path d={line} fill="none" stroke="var(--rc-chart-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {activePoint ? (
            <g>
              <line x1={activePoint.x} x2={activePoint.x} y1={PAD.top} y2={PAD.top + innerH} stroke="rgba(255,255,255,0.25)" strokeDasharray="3 3" />
              <circle cx={activePoint.x} cy={activePoint.y} r={5} fill="var(--rc-chart-1)" stroke="var(--rc-bg)" strokeWidth={2} />
            </g>
          ) : (
            <circle cx={last.x} cy={last.y} r={4.5} fill="var(--rc-chart-1)" stroke="var(--rc-bg)" strokeWidth={2} />
          )}
        </svg>
        {activePoint && (
          <div
            className="rc-chart__tooltip rc-glass rc-glass--strong"
            style={{ left: `${(activePoint.x / W) * 100}%`, top: `${(activePoint.y / H) * 100}%` }}
            aria-hidden="true"
          >
            <span className="rc-chart__tooltip-label">{activePoint.label}</span>
            <strong className="rc-tabular">{formatValue(activePoint.value)}</strong>
          </div>
        )}
      </div>
      <table className="sr-only">
        <thead><tr><th scope="col">{tableHeaders[0]}</th><th scope="col">{tableHeaders[1]}</th></tr></thead>
        <tbody>{data.map((d) => <tr key={d.label}><th scope="row">{d.label}</th><td>{formatValue(d.value)}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}
