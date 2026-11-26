import { Route, Routes } from 'react-router-dom';
import { NAV_ITEMS } from './app/navigation';
import { AppShell } from './components/layout/AppShell';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { RedirectIfAuthenticated, RequireAuth } from './features/auth/RequireAuth';
import { AgentsPage } from './features/agents/AgentsPage';
import { ExecutionPage } from './features/agents/ExecutionPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { DataPage } from './features/data/DataPage';
import { DatasetPage } from './features/data/DatasetPage';
import { ImportReviewPage } from './features/data/ImportReviewPage';
import { DesignSystemPage } from './features/design-system/DesignSystemPage';
import { IntegrationsPage } from './features/integrations/IntegrationsPage';
import { ModulePage } from './features/modules/ModulePage';
import { NotFoundPage } from './features/modules/NotFoundPage';
import { ReportPage } from './features/reports/ReportPage';
import { ReportsPage } from './features/reports/ReportsPage';
import { SettingsPage } from './features/settings/SettingsPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="login" element={<RedirectIfAuthenticated><LoginPage /></RedirectIfAuthenticated>} />
      <Route path="register" element={<RedirectIfAuthenticated><RegisterPage /></RedirectIfAuthenticated>} />
      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route index element={<DashboardPage />} />
        <Route path="agents" element={<AgentsPage />} />
        <Route path="agents/runs/:executionId" element={<ExecutionPage />} />
        <Route path="data" element={<DataPage />} />
        <Route path="data/import/:uploadId" element={<ImportReviewPage />} />
        <Route path="data/:datasetId" element={<DatasetPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="reports/:reportId" element={<ReportPage />} />
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
