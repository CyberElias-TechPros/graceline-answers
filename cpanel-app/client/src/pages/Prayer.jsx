import { useEffect, useState } from 'react';
import { api, fmtDate } from '../lib/api';
import { useSeo } from '../lib/seo';
import Reveal from '../components/Reveal';
import Particles from '../components/Particles';
import { HandHeart, Send, Flame, ShieldCheck } from 'lucide-react';

export default function Prayer() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ title: '', content: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [justPrayed, setJustPrayed] = useState(null);

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
      setJustPrayed(id);
      setTimeout(() => setJustPrayed(null), 2200);
      await load();
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      <section className="sub-hero">
        <div
          className="sub-hero-bg"
          style={{ backgroundImage: 'url(/assets/prayer-candle.jpg)' }}
        />
        <div className="sub-hero-scrim" />
        <Particles count={14} seed={5} />
        <div className="container">
          <Reveal variant="up">
            <span className="eyebrow">
              <i className="eyebrow-line" aria-hidden="true" />
              Prayer wall
            </span>
            <h1>
              Standing together in <em>prayer</em>
            </h1>
            <p className="lead">
              Share a need, however small. Others will pray with you. Everything is anonymous —
              no account, no name required.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="section" style={{ paddingTop: '2rem' }}>
        <div className="container" style={{ maxWidth: 860 }}>
          <Reveal variant="up">
            <form onSubmit={submit} className="panel">
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
              <div style={{ marginTop: '1.2rem' }}>
                <button className="btn btn-gold" disabled={busy}>
                  <Send size={16} /> {busy ? 'Posting…' : 'Post anonymously'}
                </button>
              </div>
              <div className="form-hint">
                <ShieldCheck size={14} />
                Never shared with other members as personal data; only the request is shown.
              </div>
            </form>
          </Reveal>

          {items.length === 0 && (
            <Reveal variant="fade">
              <div className="state" style={{ marginTop: '2.4rem' }}>
                <div className="state-icon">
                  <HandHeart size={22} />
                </div>
                <p>No prayer requests yet. Be the first to share one.</p>
              </div>
            </Reveal>
          )}

          <div className="stack" style={{ marginTop: '2.2rem' }}>
            {items.map((p, i) => (
              <Reveal key={p.id} variant="up" delay={Math.min(i % 4, 3) * 90}>
                <div className="card prayer-card">
                  <div className="spread">
                    <h3>{p.title}</h3>
                  </div>
                  <p className="prayer-text">{p.content}</p>
                  <div className="prayer-foot">
                    <span className="muted">{fmtDate(p.created_at)}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
                      <span className="prayed-badge">
                        <span className="flame">
                          <Flame size={15} fill="currentColor" />
                        </span>
                        {p.prayed_count} prayed
                      </span>
                      <button
                        className={`btn btn-secondary btn-sm pray-btn ${justPrayed === p.id ? 'pulsed' : ''}`}
                        onClick={() => pray(p.id)}
                        aria-label={`Pray for ${p.title}`}
                      >
                        <span className="flame">
                          <Flame size={14} fill="currentColor" />
                        </span>
                        I prayed
                      </button>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
