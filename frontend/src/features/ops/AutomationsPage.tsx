import { useState, type FormEvent } from 'react';
import { CalendarClock, Pause, Play, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../app/auth';
import { usePreferences } from '../../app/preferences';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState, Skeleton } from '../../components/ui/States';
import { api, type AgentsInfo, type DatasetSummary } from '../../lib/api';
import { formatDate, interpolate } from '../../lib/format';
import { useApiResource } from '../../lib/useApi';
import { agentName, DATASET_AGENTS } from '../agents/AgentsPage';
import { aiErrorMessage } from '../agents/aiText';
import { PageHeader } from '../modules/PageHeader';

type Frequency = 'daily' | 'weekly' | 'monthly';
type Automation = {
  id: string; name: string; agent_id: string; dataset_id: string | null; frequency: Frequency; hour: number;
  weekday: number | null; day_of_month: number | null; timezone: string; active: boolean;
  next_run_at: string | null; last_run_at: string | null; last_execution_id: string | null; last_error: { code: string } | null;
};

export function AutomationsPage() {
  const { t, lang } = usePreferences();
  const a = t.automations;
  const { session, can } = useAuth();
  const orgKey = session?.active_organization?.id ?? '';
  const list = useApiResource<Automation[]>('/automations', orgKey);
  const agents = useApiResource<AgentsInfo>('/agents', orgKey);
  const datasets = useApiResource<DatasetSummary[]>(can('data.read') ? '/datasets' : null, orgKey);
  const available = (agents.data?.agents ?? []).filter((x) => x.status === 'available');
  const [form, setForm] = useState({ name: '', agent_id: '', dataset_id: '', frequency: 'weekly' as Frequency, hour: 8, weekday: 0, day_of_month: 1 });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const agentId = form.agent_id || available[0]?.id || '';
  const needsDataset = DATASET_AGENTS.has(agentId);
  const datasetId = form.dataset_id || datasets.data?.[0]?.id || '';
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const manage = can('agents.manage');

  const payload = (x: { name: string; agent_id: string; dataset_id: string | null; frequency: Frequency; hour: number; weekday: number | null; day_of_month: number | null; active: boolean }) => ({
    name: x.name, agent_id: x.agent_id, dataset_id: x.dataset_id, frequency: x.frequency, hour: x.hour,
    weekday: x.frequency === 'weekly' ? x.weekday : null, day_of_month: x.frequency === 'monthly' ? x.day_of_month : null,
    timezone: 'America/Mexico_City', active: x.active,
  });

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy('create');
    setError(null);
    try {
      await api('/automations', { method: 'POST', body: payload({
        name: form.name.trim() || `${agentName(t, agentId)} · ${a.freq[form.frequency]}`, agent_id: agentId,
        dataset_id: needsDataset ? datasetId : null, frequency: form.frequency, hour: form.hour, weekday: form.weekday,
        day_of_month: form.day_of_month, active: true }) });
      set({ name: '' });
      list.reload();
    } catch (err) {
      setError(aiErrorMessage(t, lang, err));
    } finally {
      setBusy(null);
    }
  };
  const toggle = async (x: Automation) => {
    setBusy(x.id);
    try {
      await api(`/automations/${x.id}`, { method: 'PUT', body: payload({ ...x, active: !x.active }) });
      list.reload();
    } catch (err) {
      setError(aiErrorMessage(t, lang, err));
    } finally {
      setBusy(null);
    }
  };
  const remove = async (x: Automation) => {
    setBusy(x.id);
    try {
      await api(`/automations/${x.id}`, { method: 'DELETE' });
      list.reload();
    } finally {
      setBusy(null);
    }
  };
  const when = (x: Automation) => interpolate(a.when[x.frequency], {
    hour: `${String(x.hour).padStart(2, '0')}:00`,
    day: x.frequency === 'weekly' ? (a.weekdays[x.weekday ?? 0] ?? '') : String(x.day_of_month ?? 1),
  });

  return (
    <>
      <PageHeader eyebrow={t.nav.sectionOperate} title={a.title} lead={a.lead} />
      <div className="rc-grid rc-grid--2">
        <Card title={a.listTitle} className="rc-span-2">
          {list.loading && <Skeleton height={120} />}
          {list.data && list.data.length === 0 && <EmptyState icon={<CalendarClock size={22} />} title={a.empty} body={a.emptyBody} />}
          {list.data && list.data.length > 0 && (
            <ul className="rc-list">
              {list.data.map((x) => (
                <li key={x.id} className="rc-list__item">
                  <div className="rc-list__main">
                    <span className="rc-list__title">{x.name}</span>
                    <span className="rc-list__meta">{agentName(t, x.agent_id)} · {when(x)}</span>
                    <span className="rc-list__meta">
                      {x.active && x.next_run_at ? `${a.next}: ${formatDate(new Date(x.next_run_at), lang, { dateStyle: 'medium', timeStyle: 'short' })}` : a.paused}
                      {x.last_execution_id && <> · <Link className="rc-link" to={`/agents/runs/${x.last_execution_id}`}>{a.lastRun}</Link></>}
                    </span>
                    {x.last_error && <span className="rc-form__error">{aiErrorMessage(t, lang, { code: x.last_error.code })}</span>}
                  </div>
                  <Badge tone={x.active ? 'success' : 'outline'} dot={x.active}>{x.active ? a.active : a.pausedShort}</Badge>
                  {manage && (
                    <div className="rc-row">
                      <Button size="sm" variant="ghost" icon={x.active ? <Pause size={13} /> : <Play size={13} />} loading={busy === x.id}
                        onClick={() => void toggle(x)} aria-label={`${x.active ? a.pause : a.resume}: ${x.name}`}>{x.active ? a.pause : a.resume}</Button>
                      <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} disabled={busy === x.id}
                        onClick={() => void remove(x)} aria-label={`${a.delete}: ${x.name}`} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {manage && (
          <Card title={a.newTitle} subtitle={a.newHint} className="rc-span-2">
            <form className="rc-form rc-automation-form" onSubmit={(e) => void create(e)}>
              <label className="rc-field">
                <span className="rc-field__label">{a.name}</span>
                <input className="rc-input" maxLength={120} value={form.name} placeholder={a.namePlaceholder} onChange={(e) => set({ name: e.target.value })} />
              </label>
              <label className="rc-field">
                <span className="rc-field__label">{a.agent}</span>
                <select className="rc-select" value={agentId} onChange={(e) => set({ agent_id: e.target.value })}>
                  {available.map((x) => <option key={x.id} value={x.id}>{agentName(t, x.id)}</option>)}
                </select>
              </label>
              {needsDataset && (
                <label className="rc-field">
                  <span className="rc-field__label">{t.ai.chooseDataset}</span>
                  <select className="rc-select" value={datasetId} onChange={(e) => set({ dataset_id: e.target.value })}>
                    {(datasets.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </label>
              )}
              <label className="rc-field">
                <span className="rc-field__label">{a.frequency}</span>
                <select className="rc-select" value={form.frequency} onChange={(e) => set({ frequency: e.target.value as Frequency })}>
                  {(['daily', 'weekly', 'monthly'] as const).map((f) => <option key={f} value={f}>{a.freq[f]}</option>)}
                </select>
              </label>
              {form.frequency === 'weekly' && (
                <label className="rc-field">
                  <span className="rc-field__label">{a.weekday}</span>
                  <select className="rc-select" value={form.weekday} onChange={(e) => set({ weekday: Number(e.target.value) })}>
                    {a.weekdays.map((d, i) => <option key={d} value={i}>{d}</option>)}
                  </select>
                </label>
              )}
              {form.frequency === 'monthly' && (
                <label className="rc-field">
                  <span className="rc-field__label">{a.dayOfMonth}</span>
                  <select className="rc-select" value={form.day_of_month} onChange={(e) => set({ day_of_month: Number(e.target.value) })}>
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </label>
              )}
              <label className="rc-field">
                <span className="rc-field__label">{a.hour}</span>
                <select className="rc-select" value={form.hour} onChange={(e) => set({ hour: Number(e.target.value) })}>
                  {Array.from({ length: 24 }, (_, h) => h).map((h) => <option key={h} value={h}>{`${String(h).padStart(2, '0')}:00`}</option>)}
                </select>
              </label>
              {error && <p className="rc-form__error" role="alert">{error}</p>}
              <div>
                <Button type="submit" variant="primary" icon={<CalendarClock size={15} />} loading={busy === 'create'}
                  disabled={!agentId || (needsDataset && !datasetId)}>{a.create}</Button>
              </div>
              <p className="rc-list__meta">{a.approvalNote}</p>
            </form>
          </Card>
        )}
      </div>
    </>
  );
}
