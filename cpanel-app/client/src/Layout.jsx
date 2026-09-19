import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Menu, X, Compass, MessageCircleHeart, BookOpen, HandHeart } from 'lucide-react';
import { useScrolled } from './lib/motion';

const NAV = [
  { to: '/ask', label: 'Ask' },
  { to: '/archive', label: 'Archive' },
  { to: '/prayer', label: 'Prayer' },
];

function Brand({ onClick }) {
  return (
    <Link to="/" className="brand" onClick={onClick} aria-label="GraceLine Answers home">
      <span className="brand-mark">
        <Compass size={19} strokeWidth={1.8} />
      </span>
      <span className="brand-name">
        GraceLine<em>Answers</em>
      </span>
    </Link>
  );
}

export default function Layout() {
  const [open, setOpen] = useState(false);
  const scrolled = useScrolled(30);
  const location = useLocation();
  const currentYear = new Date().getFullYear();
  const close = () => setOpen(false);

  // Lock scroll while the mobile menu is open; close on route change.
  useEffect(() => {
    document.body.classList.toggle('menu-open', open);
    return () => document.body.classList.remove('menu-open');
  }, [open]);
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      {/* Atmosphere: film grain + vignette sit above everything, non-interactive */}
      <div className="grain" aria-hidden="true" />
      <div className="vignette" aria-hidden="true" />

      <a href="#main" className="skip-to-content">
        Skip to content
      </a>

      <header className={`site-header ${scrolled || open ? 'scrolled' : ''}`}>
        <div className="container">
          <div className="inner">
            <Brand onClick={close} />

            <nav aria-label="Primary" className="nav-desktop nav-links">
              <NavLink to="/" end>
                Home
              </NavLink>
              {NAV.map((n) => (
                <NavLink key={n.to} to={n.to}>
                  {n.label}
                </NavLink>
              ))}
            </nav>

            <div className="nav-desktop nav-cta-wrap">
              <Link to="/ask" className="btn btn-gold btn-sm">
                <MessageCircleHeart size={16} />
                Ask a Question
              </Link>
            </div>

            <button
              className={`nav-toggle ${open ? 'open' : ''}`}
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
            >
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Cinematic mobile menu */}
        <nav aria-label="Mobile" className={`nav-mobile ${open ? 'open' : ''}`}>
          <Link to="/" onClick={close} className="nav-mobile-link">
            Home
          </Link>
          {NAV.map((n, i) => (
            <Link key={n.to} to={n.to} onClick={close} className="nav-mobile-link" style={{ transitionDelay: `${80 + i * 60}ms` }}>
              {n.label}
            </Link>
          ))}
          <Link to="/ask" onClick={close} className="btn btn-gold nav-mobile-cta" style={{ transitionDelay: '300ms' }}>
            Ask a Question
          </Link>
        </nav>
      </header>

      <main id="main" tabIndex={-1} className="page-enter" key={location.pathname}>
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="footer-glow" aria-hidden="true" />
        <div className="container">
          <div className="footer-grid">
            <div>
              <Brand />
              <p className="footer-tag">
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
            <div>
              <h4>If you're in crisis</h4>
              <ul className="footer-crisis">
                <li>USA — call or text <strong>988</strong></li>
                <li>UK — Samaritans <strong>116 123</strong></li>
                <li>NG — SAMDAN <strong>0800 8365 111</strong></li>
                <li>
                  <a href="https://findahelpline.com" rel="noopener noreferrer">
                    Global helpline directory →
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="footer-bottom">
            <span>© {currentYear} GraceLine Answers</span>
            <span className="footer-motto">
              Rooted in grace, offered in truth.
              <BookOpen size={13} aria-hidden="true" />
            </span>
          </div>
        </div>
      </footer>
    </>
  );
}
