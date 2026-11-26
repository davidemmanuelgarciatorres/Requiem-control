import { ArrowLeft, CircleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePreferences } from '../../app/preferences';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/States';

export function NotFoundPage() {
  const { t } = usePreferences();
  return (
    <Card>
      <EmptyState
        icon={<CircleAlert size={20} />}
        title={t.notFound.title}
        body={t.notFound.body}
        action={<Link to="/" className="rc-btn rc-btn--glass rc-btn--sm"><ArrowLeft size={14} aria-hidden="true" />{t.common.back}</Link>}
      />
    </Card>
  );
}
