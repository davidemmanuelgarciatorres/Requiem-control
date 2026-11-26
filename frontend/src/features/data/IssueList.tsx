import { CircleCheck, Info, TriangleAlert } from 'lucide-react';
import { usePreferences } from '../../app/preferences';
import type { QualityIssue } from '../../lib/api';
import { issueText } from './dataText';

export function IssueList({ issues }: { issues: QualityIssue[] }) {
  const { t, lang } = usePreferences();
  if (issues.length === 0) {
    return (
      <p className="rc-issue rc-issue--ok"><CircleCheck size={16} aria-hidden="true" /> {t.data.noIssues}</p>
    );
  }
  return (
    <ul className="rc-issues">
      {issues.map((issue, i) => {
        const x = issueText(t, lang, issue);
        const Icon = issue.severity === 'warning' ? TriangleAlert : Info;
        return (
          <li key={`${issue.code}-${issue.column ?? ''}-${i}`} className={`rc-issue rc-issue--${issue.severity}`}>
            <Icon size={16} aria-label={issue.severity === 'warning' ? t.status.warning : t.status.info} />
            <div className="rc-issue__body">
              <p className="rc-issue__title">{x.title}</p>
              <p>{x.body}</p>
              {x.evidence && <p className="rc-list__meta">{x.evidence}</p>}
              <dl className="rc-issue__explain">
                <div><dt>{t.data.whyLabel}</dt><dd>{x.why}</dd></div>
                <div><dt>{t.data.actionLabel}</dt><dd>{x.action}</dd></div>
              </dl>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
