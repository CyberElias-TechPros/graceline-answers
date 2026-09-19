import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, fmt } from '../lib/api';
import { useSeo } from '../lib/seo';
import Reveal from '../components/Reveal';
import {
  ArrowLeft,
  Send,
  StickyNote,
  Globe,
  CheckCircle2,
  UserCheck,
  UserMinus,
  MessageCircleHeart,
} from 'lucide-react';

export default function AdminThread() {
  const { id } = useParams();
  const { me } = useOutletContext() || {};
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [reply, setReply] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [pub, setPub] = useState(null);
  const [pubBusy, setPubBusy] = useState(false);
  const scrollRef = useRef(null);

  useSeo({ title: 'Counsel Thread', noindex: true });

  async function load() {
    try {
      const r = await api(`/admin/questions/${id}`);
      setData(r);
      setPub((p) =>
        p || {
          public_title: r.question.public_title || '',
          public_content: r.question.public_content || '',
          public_answer: r.question.public_answer || '',
          is_public: !!r.question.is_public,
        },
      );
    } catch (e) {
      setErr(e.message);
    }
  }
  useEffect(() => {
    setData(null);
    setPub(null);
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [data?.messages?.length]);

  if (err)
    return (
      <div>
        <div className="form-error">Thread could not be loaded. {err}</div>
        <Link to="/admin/inbox" className="btn btn-ghost btn-sm" style={{ marginTop: 1 }}>
          <ArrowLeft size={15} /> Back to inbox
        </Link>
      </div>
    );
  if (!data)
    return (
      <div className="stack">
        <div className="skeleton" style={{ height: 40, width: '50%' }} />
        <div className="skeleton" style={{ height: 300 }} />
      </div>
    );

  const q = data.question;
  const isAssignedToMe = q.assigned_to === me?.id;

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
    setBusy(true);
    try {
      await api(`/admin/questions/${id}/note`, { method: 'POST', body: { content: note } });
      setNote('');
      await load();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status) {
    try {
      await api(`/admin/questions/${id}/status`, { method: 'POST', body: { status } });
      await load();
    } catch (e2) {
      setErr(e2.message);
    }
  }

  async function claim() {
    try {
      await api(`/admin/questions/${id}/claim`, { method: 'POST' });
      await load();
    } catch (e2) {
      setErr(e2.message);
    }
  }

  async function unclaim() {
    try {
      await api(`/admin/questions/${id}/unclaim`, { method: 'POST' });
      await load();
    } catch (e2) {
      setErr(e2.message);
    }
  }

  async function savePublish(e) {
    e.preventDefault();
    setPubBusy(true);
    setErr(null);
    try {
      await api(`/admin/questions/${id}/publish`, { method: 'POST', body: { ...pub, category: q.category } });
      await load();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setPubBusy(false);
    }
  }

  return (
    <div>
      <Link to="/admin/inbox" className="btn btn-ghost btn-sm" style={{ marginBottom: '1.4rem' }}>
        <ArrowLeft size={15} /> Back to inbox
      </Link>

      <Reveal variant="fade">
        <div className="spread" style={{ alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <div className="row wrap" style={{ marginBottom: '0.5rem' }}>
              <span className={`status-pill ${q.status}`}>{q.status}</span>
              {q.category && <span className="tag">{q.category}</span>}
              {q.is_urgent && (
                <span className="tag urgent">
                  Crisis keywords detected
                </span>
              )}
            </div>
            <h1 style={{ fontSize: '1.7rem' }}>{q.raw_title}</h1>
            <div className="muted" style={{ marginTop: '0.4rem' }}>
              Received {fmt(q.created_at)} · Updated {fmt(q.updated_at)}
              {q.seeker_email ? ` · Notifies ${q.seeker_email}` : ' · Anonymous seeker'}
            </div>
          </div>
        </div>
      </Reveal>

      <Reveal variant="up" delay={80}>
        <div className="thread-actions" style={{ marginTop: '1.2rem' }}>
          {q.assigned_to ? (
            <button className="btn btn-ghost btn-sm" onClick={unclaim} disabled={!isAssignedToMe && me?.role !== 'admin'}>
              <UserMinus size={15} /> Release assignment
            </button>
          ) : (
            <button className="btn btn-secondary btn-sm" onClick={claim}>
              <UserCheck size={15} /> Claim this question
            </button>
          )}
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setStatus(q.status === 'resolved' ? 'active' : 'resolved')}
          >
            <CheckCircle2 size={15} /> {q.status === 'resolved' ? 'Reopen' : 'Mark resolved'}
          </button>
        </div>
      </Reveal>

      {err && <div className="form-error">{err}</div>}

      <div className="thread-grid">
        <Reveal variant="up" delay={140}>
          <h3 style={{ marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <MessageCircleHeart size={17} style={{ color: 'var(--gold)' }} /> Conversation
          </h3>
          <div className="question-card" style={{ marginBottom: '1.4rem' }}>
            {q.raw_content}
          </div>

          <div ref={scrollRef} className="conversation" style={{ maxHeight: '44vh' }}>
            {data.messages.length === 0 && (
              <div className="empty-convo">
                <p style={{ margin: 0 }}>No messages yet. Send the first reply below — it will email the seeker too if they left an address.</p>
              </div>
            )}
            {data.messages.map((m) => (
              <div key={m.id} className={`msg ${m.sender_type}`}>
                <div className="msg-bubble">{m.content}</div>
                <div className="msg-meta">
                  <span className="msg-sender">
                    {m.sender_type === 'counselor' ? m.sender_name || 'Counselor' : 'Seeker'}
                  </span>
                  <span>·</span>
                  <span>{fmt(m.created_at)}</span>
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={sendReply} className="panel" style={{ marginTop: '1.3rem' }}>
            <label htmlFor="reply">Reply to seeker</label>
            <textarea
              id="reply"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Write a caring, scripture-rooted reply…"
              style={{ minHeight: 110 }}
            />
            <div style={{ marginTop: '1rem' }}>
              <button className="btn btn-gold" disabled={busy || !reply.trim()}>
                <Send size={16} /> {busy ? 'Sending…' : 'Send reply'}
              </button>
            </div>
          </form>

          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '2.4rem' }}>
            <Globe size={17} style={{ color: 'var(--gold)' }} /> Publish to archive
          </h3>
          {pub && (
            <form onSubmit={savePublish} className="panel" style={{ marginTop: '0.8rem' }}>
              <p className="form-hint" style={{ marginTop: 0 }}>
                A question is never auto-published. Edit the public copy to remove anything that
                could identify the seeker, then toggle "Make public".
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
                  <strong>Make public in archive.</strong> A question is only shown publicly when
                  its sanitized title, question, and answer are present.
                </span>
              </label>
              <div style={{ marginTop: '1.1rem' }}>
                <button className="btn btn-gold" disabled={pubBusy}>
                  {pub.is_public ? 'Publish to archive' : 'Save draft'}
                </button>
              </div>
            </form>
          )}
        </Reveal>

        <Reveal variant="right" delay={200}>
          <div className="notes-panel">
            <h3 style={{ marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <StickyNote size={17} style={{ color: 'var(--gold)' }} /> Internal notes
            </h3>
            <div className="stack" style={{ marginBottom: '1.2rem' }}>
              {data.notes.length === 0 && (
                <div className="muted" style={{ fontSize: '0.88rem' }}>
                  Notes are private to the counseling team — seekers never see them.
                </div>
              )}
              {data.notes.map((n) => (
                <div className="note-item" key={n.id}>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{n.content}</div>
                  <div className="note-meta">
                    <span>{n.author_name || 'Counselor'}</span>
                    <span>{fmt(n.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
            <form onSubmit={addNote} className="panel">
              <label htmlFor="note">Add a note</label>
              <textarea
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Observations, follow-ups, references…"
                style={{ minHeight: 90 }}
              />
              <div style={{ marginTop: '0.9rem' }}>
                <button className="btn btn-ghost btn-sm" disabled={busy || !note.trim()}>
                  <StickyNote size={14} /> Save note
                </button>
              </div>
            </form>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
