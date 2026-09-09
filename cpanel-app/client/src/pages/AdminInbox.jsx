import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api, fmt } from '../lib/api';
import { useSeo } from '../lib/seo';
import { Inbox, AlertTriangle, CheckCircle2, FileText } from 'lucide-react';

const TABS = [
  { key: 'new', label: 'New' },
  { key: 'active', label: 'Active' },
  { key: 'resolved', label: 'Resolved' },
];

export default function AdminInbox() {
  const { me } = useOutletContext() || {};
  const [tab, setTab] = useState('new');
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useSeo({ title: 'Counselor Inbox', noindex: true });

  async function load() {
    try {
      const [r, s] = await Promise.all([api(`/admin/questions?status=${tab}`), api('/admin/stats')]);
      setItems(r.items);
      setStats(s);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    setLoading(true);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  return (
    <div>
      <h1 style={{ fontSize: '1.8rem', marginBottom: '0.4rem' }}>Inbox</h1>

      {stats && (
        <div className="row wrap" style={{ margin: '1rem 0 1.4rem', gap: '0.7rem' }}>
          <span className="tag">{stats.new_count} new</span>
          <span className="tag gold">{stats.active_count} active</span>
          <span className="tag urgent">
            <AlertTriangle size={13} /> {stats.urgent_count} urgent
          </span>
          <span className="tag outline">
            <FileText size={13} /> {stats.public_count} published
          </span>
        </div>
      )}

      <div className="row" style={{ marginBottom: '1.2rem' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`btn btn-sm ${t.key === tab ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
        {me && me.role === 'admin' && (
          <Link to="/admin/team" className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }}>
            Manage team
          </Link>
        )}
      </div>

      {err && <div className="form-error">{err}</div>}

      {loading && items.length === 0 && (
        <div className="stack">
          <div className="skeleton" style={{ height: 100 }} />
          <div className="skeleton" style={{ height: 100 }} />
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="state">
          <div className="state-icon">
            <Inbox size={24} />
          </div>
          <p>No questions in this tab.</p>
        </div>
      )}

      <div className="stack">
        {items.map((q) => (
          <Link key={q.id} to={`/admin/q/${q.id}`} className="card card-link" style={{ color: 'inherit' }}>
            <div className="spread">
              <h3 style={{ margin: 0 }}>{q.title}</h3>
              {q.is_urgent ? (
                <span className="tag urgent">
                  <AlertTriangle size={13} /> Urgent
                </span>
              ) : q.status === 'resolved' ? (
                <span className="tag gold">
                  <CheckCircle2 size={13} /> Resolved
                </span>
              ) : null}
            </div>
            <div className="row wrap" style={{ marginTop: '0.5rem' }}>
              {q.category && <span className="tag outline">{q.category}</span>}
              <span className="muted">
                {q.seeker_email || 'anonymous'} · {fmt(q.updated_at)}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
