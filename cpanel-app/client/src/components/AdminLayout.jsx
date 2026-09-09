import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { LayoutDashboard, Inbox, Users, LogOut, ShieldCheck } from 'lucide-react';

export default function AdminLayout() {
  const nav = useNavigate();
  const [me, setMe] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await api('/admin/me');
        if (!alive) return;
        setMe(r.user);
        if (!r.user) nav('/admin/login');
      } catch {
        if (alive) nav('/admin/login');
      } finally {
        if (alive) setChecking(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [nav]);

  async function logout() {
    await api('/admin/logout', { method: 'POST' });
    nav('/admin/login');
  }

  if (checking)
    return (
      <div className="container container-narrow section">
        <div className="state">
          <div className="skeleton" style={{ height: 40, width: 200, margin: '0 auto 1rem' }} />
          <p>Checking your session…</p>
        </div>
      </div>
    );

  return (
    <div className="container section" style={{ maxWidth: 980 }}>
      <div className="spread" style={{ marginBottom: '1.6rem' }}>
        <div className="row" style={{ gap: '0.7rem' }}>
          <span className="brand-mark" style={{ width: 38, height: 38, borderRadius: 11 }}>
            <ShieldCheck size={20} />
          </span>
          <div>
            <div style={{ fontWeight: 700 }}>Counselor console</div>
            {me && (
              <div className="muted" style={{ fontSize: '0.82rem' }}>
                {me.name || me.email} · {me.role}
              </div>
            )}
          </div>
        </div>
        <div className="row wrap">
          <NavLink to="/admin/inbox" className="btn btn-ghost btn-sm">
            <Inbox size={15} /> Inbox
          </NavLink>
          {me && me.role === 'admin' && (
            <NavLink to="/admin/team" className="btn btn-ghost btn-sm">
              <Users size={15} /> Team
            </NavLink>
          )}
          <NavLink to="/" className="btn btn-ghost btn-sm">
            <LayoutDashboard size={15} /> Site
          </NavLink>
          <button className="btn btn-secondary btn-sm" onClick={logout}>
            <LogOut size={15} /> Logout
          </button>
        </div>
      </div>
      <Outlet context={{ me }} />
    </div>
  );
}
