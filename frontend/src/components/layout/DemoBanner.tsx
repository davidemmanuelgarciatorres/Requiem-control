import { useState } from 'react';
import { FlaskConical, RotateCcw } from 'lucide-react';
import { useAuth } from '../../app/auth';
import { usePreferences } from '../../app/preferences';
import { IS_DEMO } from '../../lib/env';

/** Aviso permanente en la compilación de demostración (nunca aparece en la app real). */
export function DemoBanner() {
  const { t } = usePreferences();
  const { refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!IS_DEMO) return null;
  const reset = async () => {
    setBusy(true);
    const { resetDemo } = await import('../../lib/demoApi');
    await resetDemo();
    await refresh();
    setBusy(false);
  };
  return (
    <div className="rc-demo-strip" role="note">
      <FlaskConical size={14} aria-hidden="true" />
      <span><strong>{t.demo.banner}.</strong> <span className="rc-demo-strip__body">{t.demo.bannerBody}</span></span>
      <button type="button" className="rc-demo-strip__btn" onClick={() => void reset()} disabled={busy}>
        <RotateCcw size={12} aria-hidden="true" /> {t.demo.reset}
      </button>
    </div>
  );
}
