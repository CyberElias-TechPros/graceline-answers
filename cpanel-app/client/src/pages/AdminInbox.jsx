import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api, fmt } from '../lib/api';
import { useSeo } from '../lib/seo';
import Reveal from '../components/Reveal';
import { AlertTriangle, CheckCircle2, FileText, UserPlus } from 'lucide-react';

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
  const [claimedId, setClaimedId] = useState(null);

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

  async function claim(id) {
    setClaimedId(id);
    try {
      await api(`/admin/questions/${id}/claim`, { method: 'POST' });
      await load();
    } catch {
      /* keep button */
    } finally {
      setClaimedId(null);
    }
  }

  return (
    <div>
      <Reveal variant="fade">
        <h1 style={{ fontSize: '2rem', marginBottom: '0.3rem' }}>Inbox</h1>
        <p className="muted" style={{ margin: 0 }}>
          Every question lands here. Claim one to make it yours — the seeker sees you by name.
        </p>
      </Reveal>

      {stats && (
        <Reveal variant="up" delay={80}>
          <div className="admin-stats">
            <div className="stat-chip">
              <div className="num">{stats.new_count}</div>
              <div className="lbl">New</div>
            </div>
            <div className="stat-chip">
              <div className="num">{stats.active_count}</div>
              <div className="lbl">Active</div>
            </div>
            <div className="stat-chip urgent-chip">
              <div className="num">{stats.urgent_count}</div>
              <div className="lbl">Urgent</div>
            </div>
            <div className="stat-chip">
              <div className="num">{stats.public_count}</div>
              <div className="lbl">Published</div>
            </div>
          </div>
        </Reveal>
      )}

      <Reveal variant="up" delay={140}>
        <div className="tabs" role="tablist" aria-label="Inbox filters">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              className={`tab ${tab === t.key ? 'active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </Reveal>

      {err && <div className="form-error">{err}</div>}

      {loading ? (
        <div className="stack">
          <div className="skeleton" style={{ height: 90 }} />
          <div className="skeleton" style={{ height: 90 }} />
          <div className="skeleton" style={{ height: 90 }} />
        </div>
      ) : items.length === 0 ? (
        <Reveal variant="fade">
          <div className="state">
            <div className="state-icon">
              <CheckCircle2 size={22} />
            </div>
            <h3>Nothing here</h3>
            <p>No {tab} questions right now. New submissions appear here the moment they arrive.</p>
          </div>
        </Reveal>
      ) : (
        <div className="stack">
          {items.map((q, i) => (
            <Reveal key={q.id} variant="up" delay={Math.min(i % 5, 4) * 70}>
              <div className="card inbox-row">
                {q.is_urgent ? (
                  <span className="tag urgent" title="Crisis keywords detected">
                    <AlertTriangle size={13} /> Urgent
                  </span>
                ) : (
                  <span className="tag">{q.category || '—'}</span>
                )}
                <div className="inbox-body">
                  <h3>{q.title}</h3>
                  <div className="inbox-meta">
                    <span>Updated {fmt(q.updated_at)}</span>
                    {q.assigned_to_name ? (
                      <span className="assignee-chip">
                        <CheckCircle2 size={13} /> {q.assigned_to_name}
                        {q.assigned_to === me?.id ? ' (you)' : ''}
                      </span>
                    ) : (
                      <span className="muted">Unassigned</span>
                    )}
                  </div>
                </div>
                {!q.assigned_to && tab !== 'resolved' && (
                  <button
                    className="btn btn-secondary btn-sm claim-btn"
                    onClick={() => claim(q.id)}
                    disabled={claimedId === q.id}
                  >
                    <UserPlus size={14} /> {claimedId === q.id ? 'Claiming…' : 'Claim'}
                  </button>
                )}
                <Link to={`/admin/q/${q.id}`} className="btn btn-ghost btn-sm">
                  Open
                </Link>
              </div>
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}
