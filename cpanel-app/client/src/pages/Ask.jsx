import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

const CATEGORIES = [
  'Bible Interpretation', 'Salvation', 'Prayer', 'Marriage', 'Parenting',
  'Youth', 'Anxiety', 'Depression', 'Faith Crisis', 'Career', 'Other',
];

export default function Ask() {
  const nav = useNavigate();
  const [form, setForm] = useState({ title: '', content: '', category: '', email: '', anon: true });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [crisis, setCrisis] = useState(null);

  function update(k) { return (e) => setForm({ ...form, [k]: e.target.value }); }

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr(null); setCrisis(null);
    try {
      const r = await api('/questions', {
        method: 'POST',
        body: {
          title: form.title,
          content: form.content,
          category: form.category,
          email: form.anon ? null : form.email,
        },
      });
      if (r.crisis?.isCrisis) {
        setCrisis(r.crisis.banner);
        // Stay on page a moment so user sees crisis info
        setTimeout(() => nav(`/t/${r.tracking_token}`), 4000);
      } else {
        nav(`/t/${r.tracking_token}`);
      }
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  return (
    <>
      <h1>Ask a question</h1>
      <p className="muted">Be as honest as you can. A real counselor will read this.</p>
      {crisis && (
        <div className="crisis">
          <strong>{crisis.title}</strong>
          {crisis.lines.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
      <form onSubmit={submit} className="card">
        <label>Category</label>
        <select value={form.category} onChange={update('category')}>
          <option value="">— Choose —</option>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>

        <label>Title</label>
        <input value={form.title} onChange={update('title')} placeholder="Short summary of your question" required />

        <label>Your question</label>
        <textarea value={form.content} onChange={update('content')} placeholder="Take your time. Include anything that matters." required />

        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" style={{ width: 'auto' }}
            checked={form.anon} onChange={(e) => setForm({ ...form, anon: e.target.checked })} />
          <span>Keep me fully anonymous (we will not log your IP)</span>
        </label>

        {!form.anon && (
          <>
            <label>Email (so we can notify you of replies)</label>
            <input type="email" value={form.email} onChange={update('email')} />
          </>
        )}

        {err && <p style={{ color: 'var(--warn)' }}>{err}</p>}
        <div style={{ marginTop: 16 }}>
          <button disabled={busy}>{busy ? 'Sending…' : 'Submit'}</button>
        </div>
      </form>
      <p className="muted">After submitting you will get a private link. <strong>Save it</strong> — it's how you read replies and continue the conversation.</p>
    </>
  );
}
