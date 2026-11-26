import { useState, type FormEvent } from 'react';
import { CircleAlert, CircleCheck, FileSpreadsheet, HardDrive, Mail, PenLine, Plug } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/auth';
import { usePreferences } from '../../app/preferences';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ErrorState, Skeleton } from '../../components/ui/States';
import { api, ApiError, type GoogleService, type IntegrationsInfo, type UploadPreview } from '../../lib/api';
import { formatDate, interpolate } from '../../lib/format';
import { useApiResource } from '../../lib/useApi';
import { PageHeader } from '../modules/PageHeader';

const ICONS = { sheets: FileSpreadsheet, drive: HardDrive, gmail: Mail, gmail_drafts: PenLine } as const;

function useErrorText() {
  const { t } = usePreferences();
  return (e: unknown) => {
    const code = e instanceof ApiError ? e.code : String(e);
    return (t.integrations.errors as Record<string, string>)[code] ?? t.auth.errors.generic;
  };
}

function SheetsImport() {
  const { t, lang } = usePreferences();
  const i = t.integrations;
  const navigate = useNavigate();
  const errorText = useErrorText();
  const [q, setQ] = useState('');
  const [files, setFiles] = useState<{ id: string; name: string; modified_at: string | null }[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const search = async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy('search');
    setError(null);
    try {
      setFiles(await api(`/integrations/google/sheets${q ? `?q=${encodeURIComponent(q)}` : ''}`));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  };
  const importSheet = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      const p = await api<UploadPreview>('/integrations/google/sheets/import', { method: 'POST', body: { spreadsheet_id: id } });
      navigate(`/data/import/${p.id}`, { state: { preview: p } });
    } catch (err) {
      setError(errorText(err));
      setBusy(null);
    }
  };

  return (
    <Card title={i.sheetsTitle} subtitle={i.sheetsHint} className="rc-span-2">
      <form className="rc-row rc-wrap" onSubmit={(e) => void search(e)}>
        <label className="sr-only" htmlFor="sheet-q">{i.search}</label>
        <input id="sheet-q" className="rc-input" placeholder={i.search} value={q} onChange={(e) => setQ(e.target.value)} maxLength={100} />
        <Button type="submit" variant="glass" loading={busy === 'search'}>{i.search}</Button>
      </form>
      {error && <p className="rc-form__error" role="alert">{error}</p>}
      {files && files.length === 0 && <p className="rc-list__meta">{i.noSheets}</p>}
      {files && files.length > 0 && (
        <ul className="rc-list">
          {files.map((f) => (
            <li key={f.id} className="rc-list__item">
              <FileSpreadsheet size={16} aria-hidden="true" />
              <div className="rc-list__main">
                <span className="rc-list__title">{f.name}</span>
                {f.modified_at && <span className="rc-list__meta">{formatDate(new Date(f.modified_at), lang, { dateStyle: 'medium' })}</span>}
              </div>
              <Button size="sm" variant="primary" loading={busy === f.id} disabled={busy !== null} onClick={() => void importSheet(f.id)}>{i.importSheet}</Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RecentList({ kind }: { kind: 'drive' | 'gmail' }) {
  const { t, lang } = usePreferences();
  const i = t.integrations;
  const errorText = useErrorText();
  const [items, setItems] = useState<Record<string, string | boolean | null>[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      setItems(await api(`/integrations/google/${kind}/recent`));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title={kind === 'drive' ? i.driveTitle : i.gmailTitle} actions={<Button size="sm" variant="ghost" loading={busy} onClick={() => void load()}>{i.load}</Button>}>
      {error && <p className="rc-form__error" role="alert">{error}</p>}
      {items && items.length === 0 && <p className="rc-list__meta">{i.nothing}</p>}
      {items && items.length > 0 && (
        <ul className="rc-list">
          {items.map((it) => (
            <li key={String(it.id)} className="rc-list__item">
              <div className="rc-list__main">
                <span className="rc-list__title">{String(kind === 'drive' ? it.name : it.subject || '—')}</span>
                <span className="rc-list__meta">
                  {kind === 'drive'
                    ? (it.modified_at ? formatDate(new Date(String(it.modified_at)), lang, { dateStyle: 'medium', timeStyle: 'short' }) : '')
                    : `${String(it.from)} · ${String(it.date)}`}
                </span>
              </div>
              {kind === 'gmail' && it.unread === true && <Badge tone="accent" dot>●</Badge>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Integraciones reales: nunca se muestra "conectado" sin un intercambio de tokens exitoso en el servidor. */
export function IntegrationsPage() {
  const { t, lang } = usePreferences();
  const i = t.integrations;
  const { session } = useAuth();
  const [params] = useSearchParams();
  const info = useApiResource<IntegrationsInfo>('/integrations', session?.active_organization?.id);
  const errorText = useErrorText();
  const [chosen, setChosen] = useState<GoogleService[]>(['sheets']);
  const [busy, setBusy] = useState<'connect' | 'disconnect' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const returned = params.get('connected') ? i.connectedOk : null;
  const returnedError = params.get('error');

  const g = info.data?.google;
  const toggle = (s: GoogleService) => setChosen((c) => (c.includes(s) ? c.filter((x) => x !== s) : [...c, s]));
  const connect = async () => {
    setBusy('connect');
    setError(null);
    try {
      const r = await api<{ authorization_url: string }>('/integrations/google/connect', { method: 'POST', body: { services: chosen } });
      window.location.assign(r.authorization_url);
    } catch (e) {
      setError(errorText(e));
      setBusy(null);
    }
  };
  const disconnect = async () => {
    setBusy('disconnect');
    setError(null);
    try {
      await api('/integrations/google/disconnect', { method: 'POST' });
      setConfirming(false);
      info.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const tone = g?.status === 'connected' ? 'success' : g?.status === 'error' ? 'danger' : 'outline';
  const available = g ? g.configured && g.plan_allows && g.can_manage : false;

  return (
    <>
      <PageHeader eyebrow={t.nav.sectionPlatform} title={i.title} lead={i.description} />
      {returned && <p className="rc-notice" role="status"><CircleCheck size={16} aria-hidden="true" /><span>{returned}</span></p>}
      {returnedError && (
        <p className="rc-notice rc-notice--warning" role="alert"><CircleAlert size={16} aria-hidden="true" />
          <span>{(i.errors as Record<string, string>)[returnedError] ?? t.auth.errors.generic}</span></p>
      )}
      {info.loading && <Card><Skeleton height={200} /></Card>}
      {info.error != null && <Card><ErrorState title={t.auth.errors.generic} onRetry={info.reload} /></Card>}
      {g && (
        <div className="rc-grid rc-grid--2">
          <Card className="rc-span-2" title={<span className="rc-inline-icon"><Plug size={16} aria-hidden="true" />Google</span>}
            actions={<Badge tone={tone} dot>{i.status[g.status]}</Badge>}>
            {!g.configured && (
              <div className="rc-notice rc-notice--warning" role="note">
                <CircleAlert size={16} aria-hidden="true" />
                <span>{g.can_manage ? i.notConfiguredAdmin : i.notConfiguredUser}</span>
              </div>
            )}
            {g.configured && !g.plan_allows && <p className="rc-notice rc-notice--warning" role="note"><span>{i.planBlocked}</span></p>}
            {g.configured && !g.can_manage && <p className="rc-list__meta">{i.cannotManage}</p>}

            <dl className="rc-kv">
              {g.account_email && <div><dt>{i.account}</dt><dd>{g.account_email}</dd></div>}
              <div><dt>{i.lastSync}</dt><dd>{g.last_sync_at ? formatDate(new Date(g.last_sync_at), lang, { dateStyle: 'medium', timeStyle: 'short' }) : i.never}</dd></div>
              {g.last_error && <div><dt><CircleAlert size={14} aria-hidden="true" /></dt><dd>{interpolate(i.lastError, { code: (i.errors as Record<string, string>)[g.last_error.code] ?? g.last_error.code })}</dd></div>}
            </dl>

            <fieldset className="rc-services" disabled={!available || busy !== null}>
              <legend className="rc-field__label">{i.chooseServices}</legend>
              {g.available_services.map((s) => {
                const Icon = ICONS[s];
                const on = g.services.includes(s);
                return (
                  <label key={s} className="rc-service">
                    <input type="checkbox" checked={on || chosen.includes(s)} disabled={on} onChange={() => toggle(s)} />
                    <Icon size={16} aria-hidden="true" />
                    <span><strong>{i[s].name}</strong>{on && <> · <Badge tone="success">{i.status.connected}</Badge></>}<br />
                      <span className="rc-list__meta">{i[s].scope}</span></span>
                  </label>
                );
              })}
            </fieldset>

            {error && <p className="rc-form__error" role="alert">{error}</p>}
            <div className="rc-row rc-wrap">
              <Button variant="primary" loading={busy === 'connect'} disabled={!available || chosen.filter((s) => !g.services.includes(s)).length === 0 && g.status === 'connected' || chosen.length === 0}
                onClick={() => void connect()}>
                {busy === 'connect' ? i.redirecting : g.status === 'error' ? i.reconnect : i.connectGoogle}
              </Button>
              {g.status !== 'disconnected' && g.can_manage && !confirming && (
                <Button variant="ghost" onClick={() => setConfirming(true)}>{i.disconnect}</Button>
              )}
            </div>
            {confirming && (
              <div className="rc-notice rc-notice--warning" role="alert">
                <span>{i.confirmDisconnect}</span>
                <div className="rc-row">
                  <Button size="sm" variant="danger" loading={busy === 'disconnect'} onClick={() => void disconnect()}>{i.disconnect}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>{t.reports.cancel}</Button>
                </div>
              </div>
            )}
          </Card>

          {g.status === 'connected' && g.services.includes('sheets') && <SheetsImport />}
          {g.status === 'connected' && g.services.includes('drive') && <RecentList kind="drive" />}
          {g.status === 'connected' && g.services.includes('gmail') && <RecentList kind="gmail" />}
        </div>
      )}
    </>
  );
}
