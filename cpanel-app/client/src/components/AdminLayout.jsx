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
    try {
      await api('/admin/logout', { method: 'POST' });
    } catch {
      /* proceed to login either way */
    }
    nav('/admin/login');
  }

  if (checking)
    return (
      <div className="admin-shell">
        <div className="skeleton" style={{ height: 44, width: 220, marginBottom: '1.4rem' }} />
        <div className="skeleton" style={{ height: 120 }} />
      </div>
    );

  return (
    <div className="container admin-shell">
      <div className="admin-header">
        <div className="admin-id">
          <span className="admin-avatar">
            {(me?.name || me?.email || 'C').slice(0, 1).toUpperCase()}
          </span>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>Counselor console</div>
            {me && (
              <div className="muted" style={{ fontSize: '0.82rem' }}>
                {me.name || me.email} · {me.role}
              </div>
            )}
          </div>
        </div>
        <div className="row wrap">
          <NavLink to="/admin/inbox" className={({ isActive }) => `btn btn-sm ${isActive ? 'btn-secondary' : 'btn-ghost'}`}>
            <Inbox size={15} /> Inbox
          </NavLink>
          {me && me.role === 'admin' && (
            <NavLink to="/admin/team" className={({ isActive }) => `btn btn-sm ${isActive ? 'btn-secondary' : 'btn-ghost'}`}>
              <Users size={15} /> Team
            </NavLink>
          )}
          <NavLink to="/" className="btn btn-ghost btn-sm">
            <LayoutDashboard size={15} /> Site
          </NavLink>
          <button className="btn btn-ghost btn-sm" onClick={logout}>
            <LogOut size={15} /> Logout
          </button>
        </div>
      </div>
      <Outlet context={{ me }} />
    </div>
  );
}
