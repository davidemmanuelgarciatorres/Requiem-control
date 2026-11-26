import { useSearchParams } from 'react-router-dom';
import { usePreferences } from '../../app/preferences';
import { ErrorState } from '../../components/ui/States';
import { Card } from '../../components/ui/Card';
import { DashboardHero } from './DashboardHero';
import { DashboardSkeleton } from './DashboardSkeleton';
import { DemoDashboardView } from './DemoDashboardView';
import { EmptyDashboard } from './EmptyDashboard';
import { useDashboardData, type DashboardLoader } from './useDashboardData';

export function DashboardPage({ loader }: { loader?: DashboardLoader }) {
  const { t, lang } = usePreferences();
  const [params, setParams] = useSearchParams();
  const demo = params.get('view') === 'demo';
  const { state, retry } = useDashboardData(demo, lang, loader);

  const toggleDemo = () => setParams(demo ? {} : { view: 'demo' });

  return (
    <>
      <DashboardHero demo={demo} onToggleDemo={toggleDemo} />

      {state.status === 'empty' && <EmptyDashboard />}
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
