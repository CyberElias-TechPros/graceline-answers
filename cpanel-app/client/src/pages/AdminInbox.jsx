import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, fmt } from '../lib/api';

const TABS = [
  { key: 'new', label: 'New' },
  { key: 'active', label: 'Active' },
  { key: 'resolved', label: 'Resolved' },
];

export default function AdminInbox() {
  const nav = useNavigate();
  const [tab, setTab] = useState('new');
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState(null);

  async function load() {
    try {
      const me = await api('/admin/me');
      if (!me.user) { nav('/admin/login'); return; }
      const [r, s] = await Promise.all([
        api(`/admin/questions?status=${tab}`),
        api('/admin/stats'),
      ]);
      setItems(r.items); setStats(s);
    } catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, [tab]);

  return (
    <>
      <h1>Inbox</h1>
      {stats && (
        <p className="muted">
          {stats.new_count} new · {stats.active_count} active · {stats.urgent_count} urgent · {stats.public_count} published
        </p>
      )}
      <div className="row" style={{ margin: '12px 0' }}>
        {TABS.map((t) => (
          <button key={t.key} className={t.key === tab ? '' : 'secondary'} onClick={() => setTab(t.key)} style={{ flex: 0 }}>{t.label}</button>
        ))}
        <button className="secondary" style={{ flex: 0, marginLeft: 'auto' }} onClick={async () => { await api('/admin/logout', { method: 'POST' }); nav('/admin/login'); }}>Logout</button>
      </div>
      {err && <p style={{ color: 'var(--warn)' }}>{err}</p>}
      {items.length === 0 && <p className="muted">No questions here.</p>}
      {items.map((q) => (
        <Link key={q.id} to={`/admin/q/${q.id}`} style={{ color: 'inherit' }}>
          <div className="card">
            <h2 style={{ margin: '0 0 4px' }}>{q.title}</h2>
            <div>
              {q.is_urgent ? <span className="tag urgent">Urgent</span> : null}
              {q.category && <span className="tag">{q.category}</span>}
              <span className="muted">{q.seeker_email || 'anonymous'} · {fmt(q.updated_at)}</span>
            </div>
          </div>
        </Link>
      ))}
    </>
  );
}
