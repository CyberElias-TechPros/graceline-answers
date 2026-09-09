import { useEffect, useState } from 'react';
import { api, fmtDate } from '../lib/api';
import { useSeo } from '../lib/seo';
import { HandHeart, Send, Flame, ShieldCheck } from 'lucide-react';

export default function Prayer() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ title: '', content: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useSeo({
    title: 'Prayer Wall',
    description:
      'Share a need anonymously and let others stand with you in prayer. A quiet reminder that you are not alone.',
    canonicalPath: '/prayer',
  });

  async function load() {
    try {
      const r = await api('/prayer');
      setItems(r.items);
    } catch (e) {
      setErr(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api('/prayer', { method: 'POST', body: form });
      setForm({ title: '', content: '' });
      await load();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  async function pray(id) {
    try {
      await api(`/prayer/${id}/pray`, { method: 'POST' });
      await load();
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="container section" style={{ maxWidth: 860 }}>
      <div style={{ maxWidth: 680 }}>
        <span className="eyebrow">Prayer wall</span>
        <h1 style={{ margin: '0.7rem 0 0.6rem' }}>Standing together in prayer</h1>
        <p className="lead" style={{ marginTop: 0 }}>
          Share a need, however small. Others will pray with you. Everything is anonymous — no
          account, no name required.
        </p>
      </div>

      <form onSubmit={submit} className="panel" style={{ margin: '1.8rem 0 2.4rem' }}>
        <label htmlFor="ptitle">Title</label>
        <input
          id="ptitle"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="A short title for your request"
          required
          maxLength={200}
        />
        <label htmlFor="pcontent">Request</label>
        <textarea
          id="pcontent"
          value={form.content}
          onChange={(e) => setForm({ ...form, content: e.target.value })}
          placeholder="Share what's on your heart…"
          required
        />
        {err && <div className="form-error">{err}</div>}
        <div style={{ marginTop: '1rem' }}>
          <button className="btn btn-primary" disabled={busy}>
            <Send size={16} /> {busy ? 'Posting…' : 'Post anonymously'}
          </button>
        </div>
        <div className="form-hint" style={{ marginTop: '0.9rem' }}>
          <ShieldCheck size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
          Never shared with other members as personal data; only the request is shown.
        </div>
      </form>

      {err && <div className="form-error">{err}</div>}

      {items.length === 0 && (
        <div className="state">
          <div className="state-icon">
            <HandHeart size={24} />
          </div>
          <p>No prayer requests yet. Be the first to share one.</p>
        </div>
      )}

      <div className="stack">
        {items.map((p) => (
          <div className="card" key={p.id}>
            <div className="spread">
              <h3 style={{ margin: 0 }}>{p.title}</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => pray(p.id)}>
                <Flame size={15} /> I prayed
              </button>
            </div>
            <div style={{ whiteSpace: 'pre-wrap', marginTop: '0.6rem' }}>{p.content}</div>
            <div className="muted" style={{ marginTop: '0.7rem', display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
              <span>{fmtDate(p.created_at)}</span>
              <span className="tag gold">
                <Flame size={13} /> {p.prayed_count} prayed
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
