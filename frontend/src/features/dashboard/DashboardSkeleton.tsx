import { usePreferences } from '../../app/preferences';
import { Skeleton } from '../../components/ui/States';

export function DashboardSkeleton() {
  const { t } = usePreferences();
  return (
    <div className="rc-dash" aria-busy="true" role="status" aria-label={t.common.loading}>
      <span className="sr-only">{t.common.loading}</span>
      {['highlight', 'agents', 'revenue', 'quality', 'k1', 'k2', 'k3'].map((area) => (
        <div key={area} className={`rc-card rc-glass rc-dash__${area}`}>
          <Skeleton width="40%" height={14} />
          <Skeleton width="65%" height={area === 'highlight' ? 56 : 28} />
          <Skeleton height={area === 'revenue' || area === 'agents' ? 160 : 40} />
        </div>
      ))}
    </div>
  );
}
