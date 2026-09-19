import { Link } from 'react-router-dom';
import { useSeo } from '../lib/seo';
import Reveal from '../components/Reveal';
import Particles from '../components/Particles';

export default function NotFound() {
  useSeo({ title: 'Page Not Found', noindex: true });
  return (
    <div className="notfound" style={{ position: 'relative' }}>
      <Particles count={14} seed={3} />
      <Reveal variant="zoom">
        <div className="nf-number" aria-hidden="true">
          404
        </div>
        <h2 style={{ margin: '1rem 0 0.6rem' }}>
          This page has drifted <em>out of sight</em>
        </h2>
        <p className="lead" style={{ margin: '0 auto 2rem' }}>
          The page you're looking for doesn't exist. Let's bring you back to safe ground.
        </p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <Link to="/" className="btn btn-gold">
            Return home
          </Link>
          <Link to="/ask" className="btn btn-ghost">
            Ask a question
          </Link>
        </div>
      </Reveal>
    </div>
  );
}
