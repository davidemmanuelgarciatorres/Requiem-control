import { useState } from 'react';

type HeatmapProps = {
  /** Matriz [semana][día] con conteos. */
  weeks: number[][];
  rowLabels: string[];
  ariaLabel: string;
  weekLabel: string;
  lessLabel: string;
  moreLabel: string;
};

/** Escala secuencial de un solo tono (lima), de tenue a intenso. */
const LEVELS = ['rgba(255,255,255,0.05)', 'rgba(184,240,204,0.22)', 'rgba(184,240,204,0.45)', 'rgba(184,240,204,0.7)', 'rgba(184,240,204,0.95)'];

export function Heatmap({ weeks, rowLabels, ariaLabel, weekLabel, lessLabel, moreLabel }: HeatmapProps) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...weeks.flat());
  const level = (v: number) => (v === 0 ? 0 : Math.min(4, Math.ceil((v / max) * 4)));
  return (
    <figure className="rc-heatmap">
      <div className="rc-heatmap__grid" role="img" aria-label={ariaLabel} style={{ gridTemplateColumns: `auto repeat(${weeks.length}, minmax(0, 1fr))` }}>
        {rowLabels.map((day, d) => (
          <div key={`row-${d}`} className="rc-heatmap__row">
            <span className="rc-heatmap__label" aria-hidden="true">{day}</span>
            {weeks.map((week, w) => {
              const v = week[d] ?? 0;
              const tip = `${weekLabel} ${w + 1} · ${day}: ${v}`;
              return (
                <span
                  key={`${w}-${d}`}
                  className="rc-heatmap__cell"
                  style={{ background: LEVELS[level(v)] }}
                  title={tip}
                  onPointerEnter={() => setHover(tip)}
                  onPointerLeave={() => setHover(null)}
                />
              );
            })}
          </div>
        ))}
      </div>
      <figcaption className="rc-heatmap__legend">
        <span className="rc-heatmap__hover" aria-live="polite">{hover ?? ' '}</span>
        <span className="rc-heatmap__scale">
          {lessLabel}
          {LEVELS.map((c) => <span key={c} className="rc-heatmap__swatch" style={{ background: c }} />)}
          {moreLabel}
        </span>
      </figcaption>
    </figure>
  );
}
