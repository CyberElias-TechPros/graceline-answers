import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api, fmt } from '../lib/api';
import { useSeo } from '../lib/seo';
import { UserPlus, Trash2, KeyRound, ShieldCheck } from 'lucide-react';

export default function AdminTeam() {
  const { me } = useOutletContext() || {};
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'counselor' });
  const [showForm, setShowForm] = useState(false);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  useSeo({ title: 'Manage Counselors', noindex: true });

  async function load() {
    try {
      const r = await api('/admin/team');
      setUsers(r.items);
    } catch (e) {
      setErr(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function addUser(e) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api('/admin/team', { method: 'POST', body: form });
      setForm({ email: '', name: '', password: '', role: 'counselor' });
      setShowForm(false);
      await load();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(id) {
    const password = window.prompt('Enter a new password (at least 10 characters):');
    if (!password) return;
    await api(`/admin/team/${id}/password`, { method: 'POST', body: { password } });
    await load();
  }

  async function removeUser(id) {
    if (!window.confirm('Remove this counselor? This cannot be undone.')) return;
    try {
      await api(`/admin/team/${id}`, { method: 'DELETE' });
      await load();
    } catch (e2) {
      setErr(e2.message);
    }
  }

  return (
    <div>
      <div className="spread">
        <h1 style={{ fontSize: '1.8rem', margin: 0 }}>Counseling team</h1>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm((s) => !s)}>
          <UserPlus size={15} /> Add counselor
        </button>
      </div>
      <p className="muted" style={{ marginTop: '0.4rem' }}>
        Manage who can answer questions and publish to the archive.
      </p>

      {showForm && (
        <form onSubmit={addUser} className="panel" style={{ marginTop: '1.2rem' }}>
          <div className="row top wrap">
            <div className="grow">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div className="grow">
              <label htmlFor="name">Name (optional)</label>
              <input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
          </div>
          <div className="row top wrap">
            <div className="grow">
              <label htmlFor="pass">Password (min 10 chars)</label>
              <input id="pass" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={10} />
            </div>
            <div className="grow">
              <label htmlFor="role">Role</label>
              <select id="role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="counselor">Counselor</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          {err && <div className="form-error">{err}</div>}
          <div style={{ marginTop: '1rem' }}>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? 'Adding…' : 'Create account'}
            </button>
          </div>
        </form>
      )}

      {err && !showForm && <div className="form-error">{err}</div>}

      <div className="stack" style={{ marginTop: '1.4rem' }}>
        {users.map((u) => (
          <div className="card" key={u.id}>
            <div className="spread">
              <div>
                <div style={{ fontWeight: 700 }}>{u.name || '(no name)'}</div>
                <div className="muted">{u.email}</div>
              </div>
              <div className="row wrap">
                <span className={`tag ${u.role === 'admin' ? '' : 'outline'}`}>
                  <ShieldCheck size={13} /> {u.role}
                </span>
                {u.id === me?.id && <span className="tag outline">you</span>}
                <button className="btn btn-ghost btn-sm" onClick={() => resetPassword(u.id)} title="Reset password">
                  <KeyRound size={15} />
                </button>
                {u.id !== me?.id && (
                  <button className="btn btn-ghost btn-sm" onClick={() => removeUser(u.id)} title="Remove">
                    <Trash2 size={15} style={{ color: 'var(--warn)' }} />
                  </button>
                )}
              </div>
            </div>
            <div className="muted" style={{ marginTop: '0.5rem' }}>
              Added {fmt(u.created_at)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
