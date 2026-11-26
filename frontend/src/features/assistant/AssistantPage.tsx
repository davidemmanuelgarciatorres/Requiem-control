import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MessageSquarePlus, Send, Trash2 } from 'lucide-react';
import { useAuth } from '../../app/auth';
import { usePreferences } from '../../app/preferences';
import { Badge, type Tone } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { api, type AssistantConversation, type AssistantMessage, type AssistantPart, type ProviderInfo } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useApiResource } from '../../lib/useApi';
import { aiErrorMessage } from '../agents/aiText';
import { PageHeader } from '../modules/PageHeader';

const KIND_TONE: Record<AssistantPart['kind'], Tone> = { verified: 'success', estimate: 'warning', suggestion: 'accent' };

function Answer({ m }: { m: AssistantMessage }) {
  const { t } = usePreferences();
  const a = t.assistant;
  const parts = m.parts ?? [{ kind: 'estimate' as const, text: m.content }];
  return (
    <div className="rc-chat__answer">
      <ul className="rc-chat__parts">
        {parts.map((p, i) => (
          <li key={i} className={`rc-chat__part rc-chat__part--${p.kind}`}>
            <Badge tone={KIND_TONE[p.kind]}>{a.kinds[p.kind]}</Badge>
            <span>{p.text}</span>
          </li>
        ))}
      </ul>
      <p className="rc-list__meta">
        {m.meta.simulated ? a.simulatedNote : a.aiNote}
        {m.meta.provider_error ? ` · ${a.fallbackNote}` : ''}
      </p>
    </div>
  );
}

export function AssistantPage() {
  const { t, lang } = usePreferences();
  const { session, can } = useAuth();
  const a = t.assistant;
  const orgKey = session?.active_organization?.id;
  const provider = useApiResource<ProviderInfo>('/agents/provider');
  const list = useApiResource<AssistantConversation[]>('/assistant/conversations', orgKey);
  const [conv, setConv] = useState<string | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end', behavior: 'smooth' });
  }, [messages.length, busy]);

  const open = async (id: string) => {
    setError(null);
    try {
      setMessages(await api<AssistantMessage[]>(`/assistant/conversations/${id}`));
      setConv(id);
    } catch (e) {
      setError(aiErrorMessage(t, lang, e));
    }
  };
  const fresh = () => { setConv(null); setMessages([]); setError(null); };
  const remove = async (id: string) => {
    await api(`/assistant/conversations/${id}`, { method: 'DELETE' }).catch(() => undefined);
    if (conv === id) fresh();
    list.reload();
  };

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    setQuestion('');
    try {
      const r = await api<{ question: AssistantMessage; answer: AssistantMessage }>('/assistant/messages', {
        method: 'POST', body: conv ? { question: q, conversation_id: conv } : { question: q },
      });
      setMessages((ms) => [...ms, r.question, r.answer]);
      if (!conv) { setConv(r.question.conversation_id); list.reload(); }
    } catch (e) {
      setQuestion(q);
      setError(aiErrorMessage(t, lang, e));
    } finally {
      setBusy(false);
    }
  };
  const onSubmit = (e: FormEvent) => { e.preventDefault(); void send(question); };

  return (
    <>
      <PageHeader eyebrow={a.eyebrow} title={a.title} lead={a.lead} />
      {provider.data && can('org.update') && (
        <p className={`rc-notice${provider.data.simulated ? ' rc-notice--warning' : ''}`} role="note">
          <span>{provider.data.simulated ? a.providerMock : `${a.providerReal} ${provider.data.model}.`}{provider.data.note ? ` ${provider.data.note}` : ''}</span>
        </p>
      )}
      <div className="rc-chat-layout">
        <Card title={a.historyTitle} className="rc-chat-history"
          actions={<Button size="sm" variant="ghost" icon={<MessageSquarePlus size={14} />} onClick={fresh}>{a.newChat}</Button>}>
          {(list.data ?? []).length === 0 ? <p className="rc-list__meta">{a.noHistory}</p> : (
            <ul className="rc-list">
              {list.data!.map((c) => (
                <li key={c.id} className={`rc-list__item${c.id === conv ? ' is-active' : ''}`}>
                  <button type="button" className="rc-list__main rc-link-btn" onClick={() => void open(c.id)} aria-current={c.id === conv || undefined}>
                    <span className="rc-list__title">{c.title}</span>
                    <span className="rc-list__meta">{formatDate(new Date(c.updated_at), lang, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                  </button>
                  <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} aria-label={`${a.delete}: ${c.title}`} onClick={() => void remove(c.id)} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="rc-chat">
          <div className="rc-chat__log" aria-live="polite">
            {messages.length === 0 && (
              <div className="rc-chat__empty">
                <p>{a.intro}</p>
                <div className="rc-row rc-wrap">
                  {a.suggestions.map((s) => (
                    <button key={s} type="button" className="rc-chip-btn" onClick={() => void send(s)} disabled={busy}>{s}</button>
                  ))}
                </div>
                <p className="rc-list__meta">{a.legend}</p>
              </div>
            )}
            {messages.map((m) => m.role === 'user'
              ? <p key={m.id} className="rc-chat__question">{m.content}</p>
              : <Answer key={m.id} m={m} />)}
            {busy && <p className="rc-list__meta" role="status"><span className="rc-btn__spinner" aria-hidden="true" /> {a.thinking}</p>}
            <div ref={endRef} />
          </div>
          {error && <p className="rc-form__error" role="alert">{error}</p>}
          <form className="rc-chat__form" onSubmit={onSubmit}>
            <label className="sr-only" htmlFor="assistant-q">{a.placeholder}</label>
            <textarea id="assistant-q" className="rc-input" rows={2} maxLength={1000} value={question} placeholder={a.placeholder}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(question); } }} />
            <Button type="submit" variant="primary" icon={<Send size={15} />} loading={busy} disabled={!question.trim()}>{a.send}</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
