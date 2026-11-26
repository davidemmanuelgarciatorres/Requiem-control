import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../app/auth';
import { usePreferences } from '../../app/preferences';
import { AmbientBackground } from '../../components/layout/AmbientBackground';
import { Card } from '../../components/ui/Card';
import { ErrorState, Skeleton } from '../../components/ui/States';

/** Protege las rutas de la aplicación. La autorización real ocurre siempre en el servidor. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { state, refresh } = useAuth();
  const { t } = usePreferences();
  const location = useLocation();

  if (state.status === 'loading') {
    return (
      <div className="rc-auth" role="status" aria-label={t.common.loading}>
        <AmbientBackground />
        <div style={{ width: 'min(420px, 100%)', display: 'grid', gap: 12, position: 'relative' }}>
          <Skeleton height={20} width="40%" />
          <Skeleton height={120} />
        </div>
      </div>
    );
  }
  if (state.status === 'unreachable') {
    return (
      <div className="rc-auth">
        <AmbientBackground />
        <Card variant="strong" className="rc-auth__card">
          <ErrorState title={t.auth.apiUnreachableTitle} body={t.auth.apiUnreachableBody} onRetry={() => void refresh()} />
        </Card>
      </div>
    );
  }
  if (state.status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <>{children}</>;
}

/** Para /login y /register: si ya hay sesión, ir al panel. */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const location = useLocation();
  if (state.status === 'authenticated') {
    // Solo rutas internas: evita redirecciones abiertas a otros sitios.
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from.startsWith('/') && !from.startsWith('//') ? from : '/'} replace />;
  }
  return <>{children}</>;
}
