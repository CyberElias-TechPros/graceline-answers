import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, fmt } from '../lib/api';
import { useSeo } from '../lib/seo';
import Reveal from '../components/Reveal';
import Particles from '../components/Particles';
import CrisisBanner from '../components/CrisisBanner';
import { Send, Copy, ShieldCheck, Bookmark, MessageCircleHeart } from 'lucide-react';

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
    if (!data) return undefined;
    const t = setInterval(async () => {
      try {
        const r = await api(
          `/messages/poll?token=${encodeURIComponent(token)}&since=${lastIdRef.current}`,
        );
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
      <div className="container container-narrow section" style={{ paddingTop: '7rem' }}>
        <div className="state">
          <div className="state-icon">
            <MessageCircleHeart size={22} />
          </div>
          <h3>Conversation not found</h3>
          <p>This private thread doesn't exist, or the link may be incomplete. {err}</p>
        </div>
      </div>
    );

  if (!data)
    return (
      <div className="container container-narrow section" style={{ paddingTop: '7rem' }}>
        <div className="skeleton" style={{ height: 34, width: '55%', margin: '0 auto 1.4rem' }} />
        <div className="skeleton" style={{ height: 200, margin: '0 auto' }} />
        <div className="skeleton" style={{ height: 60, width: '80%', margin: '1.4rem auto 0' }} />
      </div>
    );

  const q = data.question;

  return (
    <div className="section" style={{ paddingTop: '6.5rem', paddingBottom: '3.5rem' }}>
      <div className="container container-narrow" style={{ position: 'relative' }}>
        <Particles count={8} seed={9} />

        <Reveal variant="fade">
          <div className="spread" style={{ marginBottom: '1.1rem' }}>
            <span className="eyebrow" style={{ marginBottom: 0 }}>
              <i className="eyebrow-line" aria-hidden="true" />
              Your private thread
            </span>
            <button className="btn btn-ghost btn-sm" onClick={copyLink}>
              <Copy size={14} /> {copied ? 'Copied!' : 'Copy link'}
            </button>
          </div>

          <h1 style={{ fontSize: 'clamp(1.9rem, 4vw, 2.6rem)', marginBottom: '0.5rem' }}>
            {q.title}
          </h1>
          <div className="row wrap" style={{ marginBottom: '1rem' }}>
            {q.category && <span className="tag gold">{q.category}</span>}
            {q.is_urgent ? <span className="tag urgent">Urgent</span> : null}
            <span className="muted">Asked {fmt(q.created_at)}</span>
            {q.updated_at ? <span className="muted">· Active {fmt(q.updated_at)}</span> : null}
          </div>

          <div className="save-ribbon">
            <Bookmark size={16} />
            <span>
              <strong>Save this link.</strong> It's the only way back to this conversation —
              bookmark it or copy it somewhere safe.
            </span>
          </div>

          {data.crisis?.isCrisis && <CrisisBanner banner={data.crisis.banner} />}
        </Reveal>

        <Reveal variant="up" delay={120}>
          <div className="question-card" style={{ marginTop: '1.6rem' }}>
            {q.content}
          </div>
        </Reveal>

        <Reveal variant="up" delay={200}>
          <h3 style={{ margin: '2.4rem 0 0.4rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <MessageCircleHeart size={18} style={{ color: 'var(--gold)' }} /> Conversation
          </h3>

          {data.messages.length === 0 ? (
            <div className="empty-convo">
              <MessageCircleHeart size={26} />
              <p style={{ margin: 0 }}>
                A counselor will respond soon. Save this link and check back — we read every
                message with care.
              </p>
            </div>
          ) : (
            <div
              ref={scrollRef}
              className="conversation"
              role="log"
              aria-label="Conversation messages"
            >
              {data.messages.map((m) => (
                <div key={m.id} className={`msg ${m.sender_type}`}>
                  <div className="msg-bubble">{m.content}</div>
                  <div className="msg-meta">
                    <span className="msg-sender">
                      {m.sender_type === 'counselor' ? m.sender_name || 'Counselor' : 'You'}
                    </span>
                    <span>·</span>
                    <span>{fmt(m.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Reveal>

        <Reveal variant="up" delay={260}>
          <form onSubmit={send} className="panel" style={{ marginTop: '1.5rem' }}>
            <label htmlFor="reply">Write a follow-up</label>
            <textarea
              id="reply"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Write a follow-up…"
              style={{ minHeight: 100 }}
            />
            <div style={{ marginTop: '1rem' }}>
              <button className="btn btn-gold" disabled={sending || !draft.trim()}>
                <Send size={16} />
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </form>
        </Reveal>

        <Reveal variant="fade" delay={300}>
          <div className="disclaimer">
            <ShieldCheck size={15} />
            <span>
              This conversation is private to you and the counselor. We never log your IP address
              for anonymous submissions.
            </span>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
