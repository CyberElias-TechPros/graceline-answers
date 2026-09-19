import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useSeo } from '../lib/seo';
import Reveal from '../components/Reveal';
import Particles from '../components/Particles';
import { LogIn, ShieldCheck } from 'lucide-react';

export default function AdminLogin() {
  const nav = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  useSeo({ title: 'Counselor Login', noindex: true });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api('/admin/login', { method: 'POST', body: form });
      nav('/admin/inbox');
    } catch (e2) {
      setErr(e2.status === 401 ? 'Incorrect email or password.' : e2.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="section" style={{ position: 'relative' }}>
      <Particles count={12} seed={13} />
      <div className="container" style={{ maxWidth: 480, paddingTop: '6rem' }}>
        <Reveal variant="fade">
          <span className="eyebrow">
            <i className="eyebrow-line" aria-hidden="true" />
            Counselor area
          </span>
          <h1 style={{ fontSize: 'clamp(2rem, 4vw, 2.6rem)', marginBottom: '0.5rem' }}>
            Welcome <em>back</em>
          </h1>
          <p className="muted" style={{ marginTop: 0 }}>
            Sign in to manage your inbox, answer questions, and publish to the archive.
          </p>
        </Reveal>

        <Reveal variant="up" delay={140}>
          <form onSubmit={submit} className="panel" style={{ marginTop: '1.8rem' }}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              autoComplete="email"
              required
              autoFocus
            />
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              autoComplete="current-password"
              required
            />
            {err && <div className="form-error">{err}</div>}
            <div style={{ marginTop: '1.5rem' }}>
              <button className="btn btn-gold" style={{ width: '100%' }} disabled={busy}>
                <LogIn size={16} /> {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </div>
            <div className="form-hint">
              <ShieldCheck size={14} /> Protected area. Authorized counselors only.
            </div>
          </form>
        </Reveal>
      </div>
    </div>
  );
}
