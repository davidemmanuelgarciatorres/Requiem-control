/** Mini tendencia decorativa; el valor y su contexto se comunican en texto junto a ella. */
export function Sparkline({ values, tone = 'accent', width = 120, height = 36 }: { values: number[]; tone?: 'accent' | 'neutral' | 'danger'; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(height - 3 - ((v - min) / span) * (height - 6)).toFixed(1)}`).join(' ');
  const color = tone === 'accent' ? 'var(--rc-chart-1)' : tone === 'danger' ? 'var(--rc-danger)' : 'var(--rc-text-secondary)';
  return (
    <svg className="rc-sparkline" viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true" preserveAspectRatio="none">
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
