import { FileText } from 'lucide-react';
import { usePreferences } from '../../app/preferences';
import { AMBIENT_CYCLE_SECONDS } from '../../config/ambient';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States';
import { interpolate } from '../../lib/format';
import { PageHeader } from '../modules/PageHeader';

const SWATCHES = [
  ['--rc-bg', 'Background'], ['--rc-accent', 'Accent'], ['--rc-text', 'Text'], ['--rc-text-secondary', 'Text 2'],
  ['--rc-success', 'Success'], ['--rc-warning', 'Warning'], ['--rc-danger', 'Danger'], ['--rc-info', 'Info'],
] as const;

export function DesignSystemPage() {
  const { t } = usePreferences();
  const ds = t.designSystem;
  return (
    <>
      <PageHeader eyebrow={t.nav.sectionPlatform} title={ds.title} lead={ds.description} />
      <div className="rc-grid rc-grid--2">
        <Card title={ds.colors}>
          <ul className="rc-swatches">
            {SWATCHES.map(([token, name]) => (
              <li key={token}>
                <span className="rc-swatch" style={{ background: `var(${token})` }} aria-hidden="true" />
                <span className="rc-list__title">{name}</span>
                <code>{token}</code>
              </li>
            ))}
          </ul>
        </Card>
        <Card title={ds.ambient} subtitle={interpolate(ds.ambientBody, { s: AMBIENT_CYCLE_SECONDS })}>
          <div className="rc-ambient-strip" aria-hidden="true">
            <span className="rc-ambient-strip__day"><small>{t.designSystem.day}</small></span>
            <span className="rc-ambient-strip__night"><small>{t.designSystem.night}</small></span>
          </div>
        </Card>
        <Card title={ds.typography}>
          <p className="rc-hero__wordmark-demo" aria-hidden="true">CONTROL</p>
          <p className="rc-page-title">{t.dashboard.onboarding.title}</p>
          <p className="rc-card__title">{t.dashboard.charts.revenueTitle}</p>
          <p className="rc-highlight__value rc-tabular" style={{ color: 'var(--rc-text)' }}>1,284</p>
          <p className="rc-page-lead">{t.dashboard.onboarding.body}</p>
          <p className="rc-list__meta">{t.dashboard.charts.revenueSubtitle}</p>
        </Card>
        <Card title={ds.buttons}>
          <div className="rc-row">
            <Button variant="primary">{ds.primary}</Button>
            <Button variant="glass">{ds.secondary}</Button>
            <Button variant="ghost">{ds.ghost}</Button>
            <Button variant="glass" disabled>{ds.disabled}</Button>
            <Button variant="primary" loading>{ds.loadingButton}</Button>
          </div>
          <h3 className="rc-subheading">{ds.badges}</h3>
          <div className="rc-row">
            <Badge tone="accent">Accent</Badge>
            <Badge tone="success" dot>{t.status.success}</Badge>
            <Badge tone="warning" dot>{t.status.warning}</Badge>
            <Badge tone="danger" dot>{t.status.danger}</Badge>
            <Badge tone="info" dot>{t.status.info}</Badge>
            <Badge tone="outline">{t.common.upcoming}</Badge>
          </div>
        </Card>
        <Card title={`${ds.states} · ${ds.loadingState}`}>
          <div style={{ display: 'grid', gap: 10 }} aria-hidden="true">
            <Skeleton width="45%" height={14} />
            <Skeleton width="70%" height={28} />
            <Skeleton height={80} />
          </div>
        </Card>
        <Card title={`${ds.states} · ${ds.emptyState}`}>
          <EmptyState icon={<FileText size={20} />} title={ds.emptyTitle} body={ds.emptyBody} />
        </Card>
        <Card title={`${ds.states} · ${ds.errorState}`} className="rc-span-2">
          <ErrorState title={t.dashboard.errorTitle} body={t.dashboard.errorBody} onRetry={() => undefined} />
        </Card>
      </div>
    </>
  );
}
