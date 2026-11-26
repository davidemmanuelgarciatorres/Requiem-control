import type { ReactNode } from 'react';
import { CircleAlert, RefreshCw } from 'lucide-react';
import { Button } from './Button';
import { usePreferences } from '../../app/preferences';

export function Skeleton({ width = '100%', height = 16, radius }: { width?: number | string; height?: number | string; radius?: number }) {
  return <span className="rc-skeleton" aria-hidden="true" style={{ display: 'block', width, height, borderRadius: radius }} />;
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="rc-state" role="status">
      <span className="rc-state__icon" aria-hidden="true">{icon}</span>
      <p className="rc-state__title">{title}</p>
      {body && <p className="rc-state__body">{body}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ title, body, onRetry }: { title: string; body?: string; onRetry?: () => void }) {
  const { t } = usePreferences();
  return (
    <div className="rc-state rc-state--error" role="alert">
      <span className="rc-state__icon" aria-hidden="true"><CircleAlert size={22} /></span>
      <p className="rc-state__title">{title}</p>
      {body && <p className="rc-state__body">{body}</p>}
      {onRetry && (
        <Button variant="glass" size="sm" icon={<RefreshCw size={14} />} onClick={onRetry}>
          {t.common.retry}
        </Button>
      )}
    </div>
  );
}
