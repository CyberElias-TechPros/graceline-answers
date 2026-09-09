import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, fmt } from '../lib/api';
import { useSeo } from '../lib/seo';
import { Send, Copy, ShieldCheck, Phone, Bookmark } from 'lucide-react';

export default function Thread() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const lastIdRef = useRef(0);
  const scrollRef = useRef(null);

  useSeo({
    title: 'Your Conversation',
    description: 'Your private conversation with a GraceLine Answers counselor.',
    noindex: true,
  });

  async function load() {
    try {
      const r = await api(`/questions/by-token/${token}`);
      setData(r);
      lastIdRef.current = r.messages.length ? r.messages[r.messages.length - 1].id : 0;
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    setData(null);
    setErr(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!data) return;
    const t = setInterval(async () => {
      try {
        const r = await api(`/messages/poll?token=${encodeURIComponent(token)}&since=${lastIdRef.current}`);
        if (r.messages.length) {
          setData((d) => ({ ...d, messages: [...d.messages, ...r.messages] }));
          lastIdRef.current = r.messages[r.messages.length - 1].id;
        }
      } catch {
        /* transient poll failures are ignored */
      }
    }, 3000);
    return () => clearInterval(t);
  }, [data, token]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [data?.messages?.length]);

  async function send(e) {
    e.preventDefault();
    if (!draft.trim()) return;
    setSending(true);
    try {
      await api('/messages/seeker', { method: 'POST', body: { token, content: draft } });
      setDraft('');
      await load();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setSending(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may be unavailable */
    }
  }

  if (err)
    return (
      <div className="container container-narrow section">
        <div className="form-error">This private conversation could not be found. {err}</div>
      </div>
    );
  if (!data)
    return (
      <div className="container container-narrow section">
        <div className="state">
          <div className="state-icon">…</div>
          <p>Loading your conversation…</p>
        </div>
      </div>
    );

  const q = data.question;
  return (
    <div className="container container-narrow section" style={{ paddingBottom: '3rem' }}>
      <div className="spread" style={{ marginBottom: '1.4rem' }}>
        <span className="eyebrow">Your private thread</span>
        <button className="btn btn-ghost btn-sm" onClick={copyLink}>
          <Copy size={15} /> {copied ? 'Copied!' : 'Copy link'}
        </button>
      </div>

      <h1 style={{ marginBottom: '0.6rem' }}>{q.title}</h1>
      <div className="row wrap" style={{ marginBottom: '0.6rem' }}>
        {q.category && <span className="tag">{q.category}</span>}
        {q.is_urgent ? <span className="tag urgent">Urgent</span> : null}
        <span className="muted">Asked {fmt(q.created_at)}</span>
      </div>

      <div className="disclaimer" style={{ marginTop: '0.8rem' }}>
        <Bookmark size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />
        <strong>Save this link.</strong> It's the only way back to this conversation. Bookmark it or
        copy it somewhere safe.
      </div>

      {data.crisis?.isCrisis && (
        <div className="crisis" role="alert">
          <strong style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Phone size={16} /> {data.crisis.banner.title}
          </strong>
          {data.crisis.banner.lines.map((l, i) => (
            <div key={i} style={{ marginTop: 4 }}>
              {l}
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ marginTop: '1.4rem', background: 'var(--accent-softer)', borderColor: 'var(--line)' }}>
        <div style={{ whiteSpace: 'pre-wrap' }}>{q.content}</div>
      </div>

      <h3 style={{ margin: '2rem 0 0.6rem' }}>Conversation</h3>
      {data.messages.length === 0 && (
        <p className="muted">
          A counselor will respond soon. Check back — or save this link to come back later.
        </p>
      )}

      <div
        ref={scrollRef}
        style={{ maxHeight: '46vh', overflowY: 'auto', padding: '0.4rem 0.4rem 0.4rem 0', marginBottom: '0.4rem' }}
      >
        {data.messages.map((m) => (
          <div key={m.id} className={`msg ${m.sender_type}`}>
            <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
            <div className="meta">
              <span className="label">{m.sender_type === 'counselor' ? 'Counselor' : 'You'}</span>
              {' · '}
              {fmt(m.created_at)}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={send} className="panel" style={{ marginTop: '1.2rem' }}>
        <label htmlFor="reply">Reply</label>
        <textarea
          id="reply"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a follow-up…"
        />
        <div style={{ marginTop: '0.9rem' }}>
          <button className="btn btn-primary" disabled={sending || !draft.trim()}>
            <Send size={16} />
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </form>

      <div className="disclaimer" style={{ marginTop: '1.4rem' }}>
        <ShieldCheck size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />
        This conversation is private to you and the counselor. We never log your IP address for
        anonymous submissions.
      </div>
    </div>
  );
}
