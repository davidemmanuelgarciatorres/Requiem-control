import { usePreferences } from '../../app/preferences';
import { formatDate } from '../../lib/format';
import { useApiResource } from '../../lib/useApi';
import { legalDoc, type LegalInfo } from './legalContent';
import { PublicLayout } from './PublicLayout';

export function LegalPage({ kind }: { kind: 'privacy' | 'terms' }) {
  const { t, lang } = usePreferences();
  const info = useApiResource<LegalInfo>('/legal');
  const doc = legalDoc(kind, lang, info.data);
  const updated = info.data?.updated_on;
  return (
    <PublicLayout>
      <article className="rc-legal rc-glass rc-glass--strong">
        <h1 className="rc-page-title">{doc.title}</h1>
        <p className="rc-list__meta">
          {t.landing.updated}: {updated ? formatDate(new Date(`${updated}T12:00:00`), lang, { dateStyle: 'long' }) : lang === 'es' ? '[FECHA]' : '[DATE]'}
        </p>
        <p>{doc.intro}</p>
        {doc.sections.map((s) => (
          <section key={s.title}>
            <h2 className="rc-legal__h2">{s.title}</h2>
            {s.body.map((p) => <p key={p}>{p}</p>)}
          </section>
        ))}
      </article>
    </PublicLayout>
  );
}
