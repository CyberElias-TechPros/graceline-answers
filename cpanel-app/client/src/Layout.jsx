import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { Menu, X, BookOpen, MessageCircleHeart, HandHeart, Compass } from 'lucide-react';

const NAV = [
  { to: '/ask', label: 'Ask', icon: MessageCircleHeart },
  { to: '/archive', label: 'Archive', icon: BookOpen },
  { to: '/prayer', label: 'Prayer', icon: HandHeart },
];

export default function Layout() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const currentYear = new Date().getFullYear();

  return (
    <>
      <a href="#main" className="skip-to-content">
        Skip to content
      </a>
      <header className="site-header">
        <div className="container">
          <div className="inner">
            <Link to="/" className="brand" onClick={close}>
              <span className="brand-mark">
                <Compass size={20} />
              </span>
              <span>GraceLine Answers</span>
            </Link>

            <nav aria-label="Primary" className="nav-desktop nav-links">
              <NavLink to="/" end>
                Home
              </NavLink>
              {NAV.map((n) => (
                <NavLink key={n.to} to={n.to}>
                  {n.label}
                </NavLink>
              ))}
              <NavLink to="/admin/inbox">Admin</NavLink>
            </nav>

            <div className="nav-desktop">
              <Link to="/ask" className="btn btn-primary btn-sm nav-cta">
                Ask a Question
              </Link>
            </div>

            <button
              className="nav-toggle"
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
            >
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        <nav aria-label="Mobile" className={`nav-mobile ${open ? 'open' : ''}`}>
          <Link to="/" onClick={close}>
            Home
          </Link>
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} onClick={close}>
              {n.label}
            </Link>
          ))}
          <Link to="/admin/inbox" onClick={close}>
            Admin
          </Link>
          <Link to="/ask" onClick={close} style={{ color: 'var(--accent)', fontWeight: 700 }}>
            Ask a Question →
          </Link>
        </nav>
      </header>

      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="container">
          <div className="footer-grid">
            <div>
              <div className="brand" style={{ marginBottom: '0.8rem' }}>
                <span className="brand-mark">
                  <Compass size={20} />
                </span>
                <span>GraceLine Answers</span>
              </div>
              <p style={{ color: 'rgba(243,240,230,0.72)', fontSize: '0.92rem', maxWidth: 280 }}>
                Anonymous Bible Q&amp;A and faith-centered Christian counseling. A ministry, not a
                substitute for licensed therapy or emergency care.
              </p>
            </div>
            <div>
              <h4>Explore</h4>
              <ul>
                <li>
                  <Link to="/ask">Ask a question</Link>
                </li>
                <li>
                  <Link to="/archive">Browse the archive</Link>
                </li>
                <li>
                  <Link to="/prayer">Prayer wall</Link>
                </li>
              </ul>
            </div>
            <div>
              <h4>Ministry</h4>
              <ul>
                <li>
                  <Link to="/admin/inbox">Counselor login</Link>
                </li>
                <li>
                  <Link to="/">About GraceLine</Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="footer-bottom">
            <span>© {currentYear} GraceLine Answers</span>
            <span>Rooted in grace, offered in truth.</span>
          </div>
        </div>
      </footer>
    </>
  );
}
