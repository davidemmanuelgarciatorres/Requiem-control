import type { ReactNode } from 'react';
import { usePreferences } from '../../app/preferences';

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'outline';

export function Badge({ tone = 'neutral', dot = false, children }: { tone?: Tone; dot?: boolean; children: ReactNode }) {
  const toneClass = tone === 'neutral' ? '' : ` rc-badge--${tone}`;
  return (
    <span className={`rc-badge${toneClass}`}>
      {dot && <span className="rc-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

/** Insignia obligatoria para cualquier dato ficticio. */
export function DemoBadge() {
  const { t } = usePreferences();
  return (
    <span className="rc-badge rc-badge--demo" title={t.common.demoData} data-demo-badge="">
      {t.common.demo}
    </span>
  );
}
