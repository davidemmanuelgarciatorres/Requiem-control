type ProgressRingProps = {
  /** Fracción 0–1. */
  value: number;
  size?: number;
  stroke?: number;
  label: string;
  caption?: string;
  /** Texto central (por defecto el porcentaje). */
  display?: string;
  tone?: 'accent' | 'dark';
};

export function ProgressRing({ value, size = 132, stroke = 12, label, caption, display, tone = 'accent' }: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(1, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const text = display ?? `${Math.round(clamped * 100)}%`;
  return (
    <div className={`rc-ring rc-ring--${tone}`} style={{ width: size, height: size }} role="img" aria-label={`${label}: ${text}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="rc-ring__track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
        <circle
          className="rc-ring__value"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="rc-ring__center" aria-hidden="true">
        <span className="rc-ring__value-text rc-tabular">{text}</span>
        {caption && <span className="rc-ring__caption">{caption}</span>}
      </div>
    </div>
  );
}
