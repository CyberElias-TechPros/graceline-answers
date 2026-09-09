import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useSeo } from '../lib/seo';
import { LogIn, Lock, ShieldCheck } from 'lucide-react';

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
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container container-narrow section" style={{ maxWidth: 460 }}>
      <span className="eyebrow">Counselor area</span>
      <h1 style={{ margin: '0.7rem 0 0.4rem' }}>Welcome back</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Sign in to manage your inbox, answer questions, and publish to the archive.
      </p>

      <form onSubmit={submit} className="panel" style={{ marginTop: '1.4rem' }}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          autoComplete="email"
          required
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
        <div style={{ marginTop: '1.3rem' }}>
          <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
            <LogIn size={16} /> {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
        <div className="form-hint" style={{ marginTop: '1rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <ShieldCheck size={14} /> Protected area. Authorized counselors only.
        </div>
      </form>
    </div>
  );
}
