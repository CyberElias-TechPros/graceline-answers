import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useSeo } from '../lib/seo';
import { Send, ShieldCheck, Lock, Phone } from 'lucide-react';

const CATEGORIES = [
  'Bible Interpretation',
  'Salvation',
  'Prayer',
  'Marriage',
  'Parenting',
  'Youth',
  'Anxiety',
  'Depression',
  'Faith Crisis',
  'Career',
  'Other',
];

export default function Ask() {
  const nav = useNavigate();
  const [form, setForm] = useState({ title: '', content: '', category: '', email: '', anon: true });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [crisis, setCrisis] = useState(null);

  useSeo({
    title: 'Ask a Question',
    description:
      'Ask Bible and life questions anonymously. Receive scripture-based counsel from real pastors. Your privacy is protected — we never log your IP.',
    canonicalPath: '/ask',
    noindex: false,
  });

  function update(k) {
    return (e) => setForm({ ...form, [k]: e.target.value });
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setCrisis(null);
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
        setTimeout(() => nav(`/t/${r.tracking_token}`), 5000);
      } else {
        nav(`/t/${r.tracking_token}`);
      }
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container container-narrow section">
      <span className="eyebrow">Ask a question</span>
      <h1 style={{ margin: '0.7rem 0 0.8rem' }}>Bring your question</h1>
      <p className="lead" style={{ marginTop: 0 }}>
        Be as honest as you can. A real counselor will read this with care and respond in
        Scripture and compassion.
      </p>

      {crisis && (
        <div className="crisis" role="alert">
          <strong>
            <Phone size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            {crisis.title}
          </strong>
          {crisis.lines.map((l, i) => (
            <div key={i} style={{ marginTop: 4 }}>
              {l}
            </div>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="panel" style={{ marginTop: '1.4rem' }}>
        <label htmlFor="category">Category</label>
        <select id="category" value={form.category} onChange={update('category')}>
          <option value="">— Choose a topic —</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <label htmlFor="title">Title</label>
        <input
          id="title"
          value={form.title}
          onChange={update('title')}
          placeholder="A short summary of your question"
          required
          maxLength={200}
        />

        <label htmlFor="content">Your question</label>
        <textarea
          id="content"
          value={form.content}
          onChange={update('content')}
          placeholder="Take your time. Include anything that matters — context, what you've tried, what you're hoping for."
          required
        />

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={form.anon}
            onChange={(e) => setForm({ ...form, anon: e.target.checked })}
          />
          <span>
            <strong>Keep me fully anonymous.</strong> We will not log your IP address or any
            identifying metadata.
          </span>
        </label>

        {!form.anon && (
          <div className="field-group">
            <label htmlFor="email">Email (so we can notify you of replies)</label>
            <input
              id="email"
              type="email"
              value={form.email}
              onChange={update('email')}
              placeholder="you@example.com"
            />
          </div>
        )}

        {err && <div className="form-error">{err}</div>}

        <div style={{ marginTop: '1.5rem' }}>
          <button className="btn btn-primary" disabled={busy}>
            <Send size={16} />
            {busy ? 'Sending…' : 'Submit your question'}
          </button>
        </div>

        <div className="disclaimer" style={{ marginTop: '1.6rem' }}>
          <ShieldCheck size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          <strong>Privacy:</strong> After submitting you'll get a private link — it's how you read
          replies and continue the conversation. <strong>Save it.</strong> We never auto-publish
          anything; only a counselor's carefully anonymized copy reaches the public archive.
        </div>
      </form>
    </div>
  );
}
