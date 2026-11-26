import { Link } from 'react-router-dom';
import { useAuth } from '../../app/auth';
import { usePreferences } from '../../app/preferences';
import { Badge } from '../../components/ui/Badge';
import type { IntegrationsInfo } from '../../lib/api';
import { useApiResource } from '../../lib/useApi';
import { AgentModulePage } from './AgentModulePage';

export function InventoryPage() {
  return <AgentModulePage agentId="inventory-analyst" moduleKey="inventory" />;
}

export function CustomersPage() {
  return <AgentModulePage agentId="customer-ops" moduleKey="customers" />;
}

export function EmailPage() {
  const { t } = usePreferences();
  const { session } = useAuth();
  const info = useApiResource<IntegrationsInfo>('/integrations', session?.active_organization?.id);
  const g = info.data?.google;
  const gmail = !!g && g.status === 'connected' && g.services.includes('gmail');
  const drafts = !!g && g.status === 'connected' && g.services.includes('gmail_drafts');
  return (
    <AgentModulePage agentId="email-ops" moduleKey="email">
      {g && (
        <div className="rc-row rc-wrap" style={{ marginTop: 12 }}>
          <Badge tone={gmail ? 'success' : 'outline'} dot={gmail}>Gmail: {gmail ? t.integrations.status.connected : t.integrations.status.disconnected}</Badge>
          <Badge tone={drafts ? 'success' : 'outline'} dot={drafts}>{t.integrations.gmail_drafts.name}: {drafts ? t.integrations.status.connected : t.integrations.status.disconnected}</Badge>
          {(!gmail || !drafts) && <Link className="rc-btn rc-btn--glass rc-btn--sm" to="/integrations">{t.integrations.title}</Link>}
        </div>
      )}
    </AgentModulePage>
  );
}
