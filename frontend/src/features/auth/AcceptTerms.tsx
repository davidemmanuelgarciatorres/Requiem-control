import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { usePreferences } from '../../app/preferences';

export function AcceptTerms() {
  const { t } = usePreferences();
  const l = t.landing;
  const parts = l.acceptRegister.split(/(\{terms\}|\{privacy\})/);
  return (
    <p className="rc-list__meta rc-accept">
      {parts.map((p, i) =>
        p === '{terms}' ? <Link key={i} className="rc-link" to="/terms" target="_blank">{l.terms}</Link>
          : p === '{privacy}' ? <Link key={i} className="rc-link" to="/privacy" target="_blank">{l.privacy}</Link>
            : <Fragment key={i}>{p}</Fragment>)}
    </p>
  );
}
