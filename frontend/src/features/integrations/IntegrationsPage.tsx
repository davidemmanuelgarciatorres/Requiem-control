import { Plug } from 'lucide-react';
import { usePreferences } from '../../app/preferences';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../modules/PageHeader';

const PROVIDERS = ['gmail', 'sheets', 'drive'] as const;

/** Ninguna integración se muestra como conectada: no existe ninguna conexión OAuth real. */
export function IntegrationsPage() {
  const { t } = usePreferences();
  return (
    <>
      <PageHeader eyebrow={t.nav.sectionPlatform} title={t.integrations.title} lead={t.integrations.description} />
      <ul className="rc-grid rc-grid--3">
        {PROVIDERS.map((p) => (
          <li key={p}>
            <Card as="article" title={<span className="rc-inline-icon"><Plug size={16} aria-hidden="true" />{t.integrations[p].name}</span>} actions={<Badge tone="outline">{t.common.notConnected}</Badge>}>
              <dl className="rc-kv">
                <div><dt>{t.integrations.permissions}</dt><dd>{t.integrations[p].scope}</dd></div>
                <div><dt>{t.integrations.lastSync}</dt><dd>{t.integrations.never}</dd></div>
              </dl>
              <Button variant="glass" size="sm" disabled title={t.integrations.connectDisabled} style={{ justifySelf: 'start' }}>
                {t.integrations.connect} · {t.integrations.connectDisabled}
              </Button>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
