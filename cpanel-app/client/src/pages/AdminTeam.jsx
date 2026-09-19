import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api, fmt } from '../lib/api';
import { useSeo } from '../lib/seo';
import Reveal from '../components/Reveal';
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
    try {
      await api(`/admin/team/${id}/password`, { method: 'POST', body: { password } });
      await load();
    } catch (e2) {
      setErr(e2.message);
    }
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
      <Reveal variant="fade">
        <div className="spread">
          <div>
            <h1 style={{ fontSize: '1.9rem', margin: 0 }}>Counseling team</h1>
            <p className="muted" style={{ marginTop: '0.4rem', marginBottom: 0 }}>
              Manage who can answer questions and publish to the archive.
            </p>
          </div>
          <button className="btn btn-gold btn-sm" onClick={() => setShowForm((s) => !s)}>
            <UserPlus size={15} /> Add counselor
          </button>
        </div>
      </Reveal>

      {showForm && (
        <Reveal variant="up" delay={60}>
          <form onSubmit={addUser} className="panel" style={{ marginTop: '1.4rem' }}>
            <div className="row top wrap">
              <div className="grow">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </div>
              <div className="grow">
                <label htmlFor="name">Name (optional)</label>
                <input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
            </div>
            <div className="row top wrap">
              <div className="grow">
                <label htmlFor="pass">Password (min 10 chars)</label>
                <input
                  id="pass"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                  minLength={10}
                />
              </div>
              <div className="grow">
                <label htmlFor="role">Role</label>
                <select
                  id="role"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                >
                  <option value="counselor">Counselor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            {err && <div className="form-error">{err}</div>}
            <div style={{ marginTop: '1.1rem' }}>
              <button className="btn btn-gold" disabled={busy}>
                {busy ? 'Adding…' : 'Create account'}
              </button>
            </div>
          </form>
        </Reveal>
      )}

      {err && !showForm && <div className="form-error">{err}</div>}

      <div className="stack" style={{ marginTop: '1.6rem' }}>
        {users.map((u, i) => (
          <Reveal key={u.id} variant="up" delay={Math.min(i % 5, 4) * 70}>
            <div className="card team-row">
              <div className="team-id">
                <span className="admin-avatar">{(u.name || u.email).slice(0, 1).toUpperCase()}</span>
                <div>
                  <div style={{ fontWeight: 700 }}>{u.name || '(no name)'}</div>
                  <div className="muted">{u.email}</div>
                </div>
              </div>
              <div className="row wrap">
                <span className={`tag ${u.role === 'admin' ? 'gold' : 'outline'}`}>
                  <ShieldCheck size={13} /> {u.role}
                </span>
                {u.id === me?.id && <span className="tag outline">you</span>}
                <button className="icon-btn" onClick={() => resetPassword(u.id)} title="Reset password">
                  <KeyRound size={16} />
                </button>
                {u.id !== me?.id && (
                  <button className="icon-btn danger" onClick={() => removeUser(u.id)} title="Remove">
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          </Reveal>
        ))}
      </div>
      <div className="muted" style={{ marginTop: '1.4rem' }}>
        Members are listed by role. Counselors see the inbox and threads; admins can also manage
        the team.
      </div>
    </div>
  );
}
