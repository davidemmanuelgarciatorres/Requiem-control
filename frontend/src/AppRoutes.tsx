import { Route, Routes } from 'react-router-dom';
import { NAV_ITEMS } from './app/navigation';
import { AppShell } from './components/layout/AppShell';
import { AgentsPage } from './features/agents/AgentsPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { DesignSystemPage } from './features/design-system/DesignSystemPage';
import { IntegrationsPage } from './features/integrations/IntegrationsPage';
import { ModulePage } from './features/modules/ModulePage';
import { NotFoundPage } from './features/modules/NotFoundPage';
import { SettingsPage } from './features/settings/SettingsPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="agents" element={<AgentsPage />} />
        <Route path="integrations" element={<IntegrationsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="design-system" element={<DesignSystemPage />} />
        {NAV_ITEMS.filter((i) => i.module).map((i) => (
          <Route key={i.id} path={i.path.slice(1)} element={<ModulePage navId={i.id} moduleId={i.module!} />} />
        ))}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
