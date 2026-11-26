import { useEffect } from 'react';
import { ListChecks } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../app/auth';
import { usePreferences } from '../../app/preferences';
import { approvalText } from '../../features/agents/aiText';
import type { ApprovalInfo } from '../../lib/api';
import { IS_DEMO } from '../../lib/env';
import { useApiResource } from '../../lib/useApi';
import { Popover } from '../ui/Popover';

const APPROVALS_EVENT = 'rc:approvals-changed';

/** Avisa a la barra superior de que cambiaron las aprobaciones pendientes. */
export function notifyApprovalsChanged(): void {
  window.dispatchEvent(new Event(APPROVALS_EVENT));
}

/** Aprobaciones pendientes de la organización activa (reales; en la demo, solo el aviso). */
export function ApprovalsMenu() {
  const { t, lang } = usePreferences();
  const { session, can } = useAuth();
  const enabled = !IS_DEMO && can('data.read');
  const pending = useApiResource<ApprovalInfo[]>(enabled ? '/approvals?status=pending' : null, session?.active_organization?.id);
  const { reload } = pending;
  useEffect(() => {
    window.addEventListener(APPROVALS_EVENT, reload);
    return () => window.removeEventListener(APPROVALS_EVENT, reload);
  }, [reload]);
  const items = pending.data ?? [];
  const count = items.length;

  return (
    <Popover
      title={t.topbar.approvals}
      trigger={(p) => (
        <button
          type="button"
          className="rc-icon-btn"
          aria-label={`${t.topbar.approvals}: ${count}`}
          {...p}
          onClick={() => {
            if (!p['aria-expanded']) pending.reload();
            p.onClick();
          }}
        >
          <ListChecks size={18} aria-hidden="true" />
          {count > 0 && <span className="rc-icon-btn__count rc-icon-btn__count--alert">{count}</span>}
        </button>
      )}
    >
      {(close) => (
        <>
          {count === 0 && <p>{t.topbar.approvalsEmpty}</p>}
          {count > 0 && (
            <ul className="rc-org-list">
              {items.map((a) => (
                <li key={a.id}>
                  <Link to={`/agents/runs/${a.execution_id}`} className="rc-org-option" onClick={close}>
                    <span>{approvalText(t, lang, a.action_type, a.payload)}</span>
                    <span className="rc-link">{t.ai.openExecution}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="rc-popover__hint">{IS_DEMO ? t.topbar.approvalsHint : t.ai.approvalHint}</p>
        </>
      )}
    </Popover>
  );
}
