import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/auth';
import type { DashboardSummary } from '../../lib/api';
import { useApiResource } from '../../lib/useApi';
import { LiveDashboard } from './LiveDashboard';
import { usePreferences } from '../../app/preferences';
import { ErrorState } from '../../components/ui/States';
import { Card } from '../../components/ui/Card';
import { DashboardHero } from './DashboardHero';
import { DashboardSkeleton } from './DashboardSkeleton';
import { DemoDashboardView } from './DemoDashboardView';
import { EmptyDashboard } from './EmptyDashboard';
import { useDashboardData, type DashboardLoader } from './useDashboardData';

import { PlanCard } from '../settings/PlanWidgets';
export function DashboardPage({ loader }: { loader?: DashboardLoader }) {
  const { t, lang } = usePreferences();
  const [params, setParams] = useSearchParams();
  const demo = params.get('view') === 'demo';
  const { state, retry } = useDashboardData(demo, lang, loader);
  const { session, can } = useAuth();
  // Datos reales de la organización; si aún no hay análisis, se muestra la incorporación.
  const live = useApiResource<DashboardSummary>(!demo && can('data.read') ? '/dashboard/summary' : null, session?.active_organization?.id);
  const hasLive = !!live.data && (live.data.financial !== null || live.data.recent_executions.length > 0 || live.data.reports.length > 0);

  const toggleDemo = () => setParams(demo ? {} : { view: 'demo' });

  return (
    <>
      <DashboardHero demo={demo} onToggleDemo={toggleDemo} hasData={hasLive} />
      <PlanCard />

      {state.status === 'empty' && (hasLive ? <LiveDashboard data={live.data!} /> : <EmptyDashboard />)}
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
