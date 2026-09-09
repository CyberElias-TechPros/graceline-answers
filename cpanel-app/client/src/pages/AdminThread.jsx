import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, fmt } from '../lib/api';
import { useSeo } from '../lib/seo';
import { AlertTriangle, Send, StickyNote, Globe, ArrowLeft } from 'lucide-react';

export default function AdminThread() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [reply, setReply] = useState('');
  const [note, setNote] = useState('');
  const [pub, setPub] = useState({ public_title: '', public_content: '', public_answer: '', is_public: false });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const lastIdRef = useRef(0);

  useSeo({ title: 'Counselor Thread', noindex: true });

  async function load() {
    try {
      const r = await api(`/admin/questions/${id}`);
      setData(r);
      lastIdRef.current = r.messages.length ? r.messages[r.messages.length - 1].id : 0;
      setPub({
        public_title: r.question.public_title || r.question.raw_title,
        public_content: r.question.public_content || '',
        public_answer: r.question.public_answer || '',
        is_public: !!r.question.is_public,
      });
    } catch (e) {
      setErr(e.message);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!data) return;
    const t = setInterval(async () => {
      try {
        const r = await api(`/messages/poll?question_id=${id}&since=${lastIdRef.current}`);
        if (r.messages.length) {
          setData((d) => ({ ...d, messages: [...d.messages, ...r.messages] }));
          lastIdRef.current = r.messages[r.messages.length - 1].id;
        }
      } catch {
        /* ignore */
      }
    }, 3000);
    return () => clearInterval(t);
  }, [data, id]);

  async function sendReply(e) {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    try {
      await api('/messages/counselor', { method: 'POST', body: { question_id: Number(id), content: reply } });
      setReply('');
      await load();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }
  async function addNote(e) {
    e.preventDefault();
    if (!note.trim()) return;
    await api(`/admin/questions/${id}/note`, { method: 'POST', body: { content: note } });
    setNote('');
    await load();
  }
  async function setStatus(status) {
    await api(`/admin/questions/${id}/status`, { method: 'POST', body: { status } });
    await load();
  }
  async function savePublish(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/admin/questions/${id}/publish`, { method: 'POST', body: pub });
      await load();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  if (err && !data)
    return (
      <div className="container container-narrow section">
        <div className="form-error">{err}</div>
      </div>
    );
  if (!data)
    return (
      <div className="container container-narrow section">
        <div className="state">
          <div className="skeleton" style={{ height: 34, width: '50%', margin: '0 auto 1rem' }} />
          <div className="skeleton" style={{ height: 220 }} />
        </div>
      </div>
    );

  const q = data.question;
  return (
    <div>
      <p style={{ margin: '0 0 1.2rem' }}>
        <Link to="/admin/inbox" className="btn btn-ghost btn-sm" style={{ marginLeft: '-0.7rem' }}>
          <ArrowLeft size={15} /> Inbox
        </Link>
      </p>

      <div className="row wrap">
        <h1 style={{ fontSize: '1.8rem', margin: 0 }}>{q.raw_title}</h1>
        {q.is_urgent ? (
          <span className="tag urgent">
            <AlertTriangle size={13} /> Urgent
          </span>
        ) : null}
      </div>
      <div className="row wrap" style={{ margin: '0.5rem 0 1rem' }}>
        {q.category && <span className="tag outline">{q.category}</span>}
        <span className="muted">
          {q.seeker_email || 'anonymous'} · status: <strong>{q.status}</strong> · {fmt(q.created_at)}
        </span>
      </div>

      <div className="card">
        <div style={{ whiteSpace: 'pre-wrap' }}>{q.raw_content}</div>
      </div>

      <div className="row wrap" style={{ margin: '1.2rem 0 1.6rem' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => setStatus('active')}>
          Mark Active
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => setStatus('resolved')}>
          Mark Resolved
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setStatus('new')}>
          Mark New
        </button>
      </div>

      <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        Conversation
      </h3>
      {data.messages.length === 0 && <p className="muted">No messages yet.</p>}
      {data.messages.map((m) => (
        <div key={m.id} className={`msg ${m.sender_type}`}>
          <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
          <div className="meta">
            <span className="label">{m.sender_type === 'counselor' ? 'Counselor' : 'Seeker'}</span>
            {' · '}
            {fmt(m.created_at)}
          </div>
        </div>
      ))}

      <form onSubmit={sendReply} className="panel" style={{ marginTop: '1.2rem' }}>
        <label htmlFor="reply">Reply to seeker</label>
        <textarea id="reply" value={reply} onChange={(e) => setReply(e.target.value)} />
        <div style={{ marginTop: '0.9rem' }}>
          <button className="btn btn-primary" disabled={busy}>
            <Send size={16} /> {busy ? 'Sending…' : 'Send reply'}
          </button>
        </div>
      </form>

      <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '2.2rem' }}>
        <StickyNote size={18} /> Internal notes (private)
      </h3>
      {data.notes.map((n) => (
        <div className="card" key={n.id} style={{ padding: '1.1rem' }}>
          <div style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{n.content}</div>
          <div className="muted" style={{ marginTop: '0.6rem' }}>
            {n.author_name || 'counselor'} · {fmt(n.created_at)}
          </div>
        </div>
      ))}
      <form onSubmit={addNote} className="panel" style={{ marginTop: '0.9rem' }}>
        <label htmlFor="note">Add a private note</label>
        <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Visible only to counselors…" />
        <div style={{ marginTop: '0.9rem' }}>
          <button className="btn btn-secondary">Add note</button>
        </div>
      </form>

      <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '2.2rem' }}>
        <Globe size={18} /> Publish to archive
      </h3>
      <form onSubmit={savePublish} className="panel">
        <p className="form-hint" style={{ marginTop: 0 }}>
          A question is never auto-published. Edit the public copy below to remove anything that
          could identify the seeker, then toggle "Make public". A question is public ONLY when its
          public title, content, and answer are all provided.
        </p>
        <label htmlFor="pub_title">Public title</label>
        <input id="pub_title" value={pub.public_title} onChange={(e) => setPub({ ...pub, public_title: e.target.value })} />
        <label htmlFor="pub_content">Public question (sanitized)</label>
        <textarea id="pub_content" value={pub.public_content} onChange={(e) => setPub({ ...pub, public_content: e.target.value })} />
        <label htmlFor="pub_answer">Public answer</label>
        <textarea id="pub_answer" value={pub.public_answer} onChange={(e) => setPub({ ...pub, public_answer: e.target.value })} />
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={pub.is_public}
            onChange={(e) => setPub({ ...pub, is_public: e.target.checked })}
          />
          <span>
            <strong>Make public in archive.</strong> A question is only shown publicly when its
            sanitized title, question, and answer are present.
          </span>
        </label>
        {err && <div className="form-error">{err}</div>}
        <div style={{ marginTop: '1rem' }}>
          <button className="btn btn-primary" disabled={busy}>
            {pub.is_public ? 'Publish to archive' : 'Save draft'}
          </button>
        </div>
      </form>
    </div>
  );
}
