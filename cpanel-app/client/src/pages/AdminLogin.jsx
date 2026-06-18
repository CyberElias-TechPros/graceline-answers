import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

export default function AdminLogin() {
  const nav = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await api('/admin/login', { method: 'POST', body: form });
      nav('/admin/inbox');
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }
  return (
    <>
      <h1>Counselor login</h1>
      <form onSubmit={submit} className="card">
        <label>Email</label>
        <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        <label>Password</label>
        <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        {err && <p style={{ color: 'var(--warn)' }}>{err}</p>}
        <div style={{ marginTop: 12 }}><button disabled={busy}>Sign in</button></div>
      </form>
    </>
  );
}
