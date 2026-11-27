import { usePreferences } from '../../app/preferences';
import { LogoMark } from './LogoMark';

export function Brand() {
  const { t } = usePreferences();
  return (
    <div className="rc-brand">
      <LogoMark />
      <span className="rc-brand__text">
        <span className="rc-brand__name">REQUIEM</span>
        <span className="rc-brand__tag">CONTROL · {t.meta.tagline}</span>
      </span>
    </div>
  );
}
