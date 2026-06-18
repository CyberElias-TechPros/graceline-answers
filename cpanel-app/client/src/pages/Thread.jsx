import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, fmt } from '../lib/api';

export default function Thread() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const lastIdRef = useRef(0);

  async function load() {
    try {
      const r = await api(`/questions/by-token/${token}`);
      setData(r);
      lastIdRef.current = r.messages.length ? r.messages[r.messages.length - 1].id : 0;
    } catch (e) { setErr(e.message); }
  }

  useEffect(() => { load(); }, [token]);

  useEffect(() => {
    if (!data) return;
    const t = setInterval(async () => {
      try {
        const r = await api(`/messages/poll?token=${encodeURIComponent(token)}&since=${lastIdRef.current}`);
        if (r.messages.length) {
          setData((d) => ({ ...d, messages: [...d.messages, ...r.messages] }));
          lastIdRef.current = r.messages[r.messages.length - 1].id;
        }
      } catch {}
    }, 3000);
    return () => clearInterval(t);
  }, [data, token]);

  async function send(e) {
    e.preventDefault();
    if (!draft.trim()) return;
    setSending(true);
    try {
      await api('/messages/seeker', { method: 'POST', body: { token, content: draft } });
      setDraft('');
      await load();
    } catch (e2) { setErr(e2.message); } finally { setSending(false); }
  }

  if (err) return <p style={{ color: 'var(--warn)' }}>{err}</p>;
  if (!data) return <p>Loading…</p>;

  const q = data.question;
  return (
    <>
      <p className="muted">Private link — bookmark this page to come back.</p>
      <h1>{q.title}</h1>
      <div>
        {q.category && <span className="tag">{q.category}</span>}
        {q.is_urgent ? <span className="tag urgent">Urgent</span> : null}
        <span className="muted"> · {fmt(q.created_at)}</span>
      </div>

      {data.crisis?.isCrisis && (
        <div className="crisis">
          <strong>{data.crisis.banner.title}</strong>
          {data.crisis.banner.lines.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <p style={{ whiteSpace: 'pre-wrap' }}>{q.content}</p>
      </div>

      <h2>Conversation</h2>
      {data.messages.length === 0 && (
        <p className="muted">A counselor will respond soon. Check back — or save this link to come back later.</p>
      )}
      {data.messages.map((m) => (
        <div key={m.id} className={`msg ${m.sender_type}`}>
          <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
          <div className="muted" style={{ marginTop: 4 }}>{m.sender_type === 'counselor' ? 'Counselor' : 'You'} · {fmt(m.created_at)}</div>
        </div>
      ))}

      <form onSubmit={send} className="card" style={{ marginTop: 16 }}>
        <label>Reply</label>
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a follow-up…" />
        <div style={{ marginTop: 10 }}>
          <button disabled={sending || !draft.trim()}>{sending ? 'Sending…' : 'Send'}</button>
        </div>
      </form>
    </>
  );
}
