import { usePreferences } from '../../app/preferences';

export function Brand() {
  const { t } = usePreferences();
  return (
    <div className="rc-brand">
      <span className="rc-brand__mark" aria-hidden="true">R</span>
      <span className="rc-brand__text">
        <span className="rc-brand__name">REQUIEM</span>
        <span className="rc-brand__tag">CONTROL · {t.meta.tagline}</span>
      </span>
    </div>
  );
}
