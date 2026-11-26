/** Indicador semicircular para una sola proporción (0–1). */
export function Gauge({ value, label, display, caption }: { value: number; label: string; display: string; caption?: string }) {
  const v = Math.max(0, Math.min(1, value));
  const size = 220;
  const stroke = 16;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const half = Math.PI * r;
  const arc = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  return (
    <div className="rc-gauge" role="img" aria-label={`${label}: ${display}`}>
      <svg viewBox={`0 0 ${size} ${size / 2 + stroke}`} aria-hidden="true">
        <path d={arc} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} strokeLinecap="round" />
        <path d={arc} fill="none" stroke="var(--rc-chart-1)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={half} strokeDashoffset={half * (1 - v)} />
      </svg>
      <div className="rc-gauge__center" aria-hidden="true">
        <span className="rc-gauge__value rc-tabular">{display}</span>
        {caption && <span className="rc-gauge__caption">{caption}</span>}
      </div>
    </div>
  );
}
