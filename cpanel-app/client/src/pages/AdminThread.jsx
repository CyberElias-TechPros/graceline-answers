import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, fmt } from '../lib/api';

export default function AdminThread() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [reply, setReply] = useState('');
  const [note, setNote] = useState('');
  const [pub, setPub] = useState({ public_title: '', public_content: '', public_answer: '', is_public: false });
  const [err, setErr] = useState(null);
  const lastIdRef = useRef(0);

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
    } catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    if (!data) return;
    const t = setInterval(async () => {
      try {
        const r = await api(`/messages/poll?question_id=${id}&since=${lastIdRef.current}`);
        if (r.messages.length) {
          setData((d) => ({ ...d, messages: [...d.messages, ...r.messages] }));
          lastIdRef.current = r.messages[r.messages.length - 1].id;
        }
      } catch {}
    }, 3000);
    return () => clearInterval(t);
  }, [data, id]);

  async function sendReply(e) {
    e.preventDefault();
    if (!reply.trim()) return;
    await api('/messages/counselor', { method: 'POST', body: { question_id: Number(id), content: reply } });
    setReply(''); load();
  }
  async function addNote(e) {
    e.preventDefault();
    if (!note.trim()) return;
    await api(`/admin/questions/${id}/note`, { method: 'POST', body: { content: note } });
    setNote(''); load();
  }
  async function setStatus(status) {
    await api(`/admin/questions/${id}/status`, { method: 'POST', body: { status } });
    load();
  }
  async function savePublish(e) {
    e.preventDefault();
    await api(`/admin/questions/${id}/publish`, { method: 'POST', body: pub });
    load();
  }

  if (err) return <p style={{ color: 'var(--warn)' }}>{err}</p>;
  if (!data) return <p>Loading…</p>;
  const q = data.question;

  return (
    <>
      <p className="muted"><Link to="/admin/inbox">← Inbox</Link></p>
      <h1>{q.raw_title}</h1>
      <div>
        {q.is_urgent ? <span className="tag urgent">Urgent</span> : null}
        {q.category && <span className="tag">{q.category}</span>}
        <span className="muted">{q.seeker_email || 'anonymous'} · status: {q.status} · {fmt(q.created_at)}</span>
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <p style={{ whiteSpace: 'pre-wrap' }}>{q.raw_content}</p>
      </div>

      <div className="row" style={{ margin: '12px 0' }}>
        <button onClick={() => setStatus('active')} className="secondary" style={{ flex: 0 }}>Mark Active</button>
        <button onClick={() => setStatus('resolved')} className="secondary" style={{ flex: 0 }}>Mark Resolved</button>
      </div>

      <h2>Conversation</h2>
      {data.messages.map((m) => (
        <div key={m.id} className={`msg ${m.sender_type}`}>
          <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
          <div className="muted" style={{ marginTop: 4 }}>{m.sender_type} · {fmt(m.created_at)}</div>
        </div>
      ))}
      <form onSubmit={sendReply} className="card">
        <label>Reply to seeker</label>
        <textarea value={reply} onChange={(e) => setReply(e.target.value)} />
        <div style={{ marginTop: 10 }}><button>Send reply</button></div>
      </form>

      <h2>Internal notes (private)</h2>
      {data.notes.map((n) => (
        <div className="card" key={n.id}>
          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{n.content}</p>
          <p className="muted" style={{ marginTop: 6 }}>{n.author_name || 'staff'} · {fmt(n.created_at)}</p>
        </div>
      ))}
      <form onSubmit={addNote} className="card">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note visible only to counselors…" />
        <div style={{ marginTop: 10 }}><button className="secondary">Add note</button></div>
      </form>

      <h2>Publish to archive (sanitize first)</h2>
      <form onSubmit={savePublish} className="card">
        <p className="muted">A question is never auto-published. Edit the public copy below to remove anything that could identify the seeker, then toggle "Make public".</p>
        <label>Public title</label>
        <input value={pub.public_title} onChange={(e) => setPub({ ...pub, public_title: e.target.value })} />
        <label>Public question (sanitized)</label>
        <textarea value={pub.public_content} onChange={(e) => setPub({ ...pub, public_content: e.target.value })} />
        <label>Public answer</label>
        <textarea value={pub.public_answer} onChange={(e) => setPub({ ...pub, public_answer: e.target.value })} />
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={pub.is_public} onChange={(e) => setPub({ ...pub, is_public: e.target.checked })} />
          <span>Make public in archive</span>
        </label>
        <div style={{ marginTop: 10 }}><button>Save</button></div>
      </form>
    </>
  );
}
