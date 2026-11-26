import { X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/auth';
import { usePreferences } from '../../app/preferences';
import { Button } from '../../components/ui/Button';
import { ErrorState } from '../../components/ui/States';
import { Card } from '../../components/ui/Card';
import { formatDate, greetingKey } from '../../lib/format';
import { DashboardSkeleton } from './DashboardSkeleton';
import { DemoDashboardView } from './DemoDashboardView';
import { EmptyDashboard } from './EmptyDashboard';
import { useDashboardData, type DashboardLoader } from './useDashboardData';

export function DashboardPage({ loader, now = new Date() }: { loader?: DashboardLoader; now?: Date }) {
  const { t, lang } = usePreferences();
  const { session } = useAuth();
  const firstName = session?.user.full_name.split(' ')[0];
  const [params, setParams] = useSearchParams();
  const demo = params.get('view') === 'demo';
  const { state, retry } = useDashboardData(demo, lang, loader);

  const toggleDemo = () => setParams(demo ? {} : { view: 'demo' });

  return (
    <>
      <section className="rc-hero" aria-labelledby="dash-title">
        <div className="rc-hero__copy">
          <p className="rc-eyebrow">{t.dashboard.eyebrow} · {formatDate(now, lang)}</p>
          <h1 id="dash-title" className="rc-page-title">{t.dashboard[greetingKey(now)]}{firstName ? `, ${firstName}` : ''}</h1>
          <p className="rc-page-lead">{demo ? t.dashboard.subtitleDemo : t.dashboard.subtitleEmpty}</p>
        </div>
        <p className="rc-hero__wordmark" aria-hidden="true">
          <span>REQUIEM</span>
          <span className="rc-hero__wordmark-glass">CONTROL</span>
        </p>
        {demo && (
          <div className="rc-hero__actions">
            <Button variant="glass" icon={<X size={16} />} onClick={toggleDemo}>{t.dashboard.hideDemo}</Button>
          </div>
        )}
      </section>

      {state.status === 'empty' && <EmptyDashboard onShowDemo={toggleDemo} />}
      {state.status === 'loading' && <DashboardSkeleton />}
      {state.status === 'error' && (
        <Card>
          <ErrorState title={t.dashboard.errorTitle} body={t.dashboard.errorBody} onRetry={retry} />
        </Card>
      )}
      {state.status === 'ready' && <DemoDashboardView data={state.data} />}
    </>
  );
}
