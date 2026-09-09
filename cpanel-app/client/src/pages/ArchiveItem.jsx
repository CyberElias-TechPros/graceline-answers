import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, fmtDate } from '../lib/api';
import { useSeo } from '../lib/seo';
import { ArrowLeft, BookOpen, ShieldCheck } from 'lucide-react';

export default function ArchiveItem() {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [notFound, setNotFound] = useState(false);

  useSeo({
    title: item ? item.title : 'Answered Question',
    description: item ? `${item.content || ''}`.slice(0, 160) : 'An answered question from GraceLine Answers.',
    canonicalPath: `/archive/${id}`,
    noindex: false,
  });

  useEffect(() => {
    setItem(null);
    setNotFound(false);
    api(`/archive/${id}`)
      .then(setItem)
      .catch(() => setNotFound(true));
  }, [id]);

  if (notFound)
    return (
      <div className="container container-narrow section">
        <div className="state">
          <div className="state-icon">
            <BookOpen size={24} />
          </div>
          <h3>Not found</h3>
          <p>This answer doesn't exist or hasn't been published yet.</p>
          <Link to="/archive" className="btn btn-secondary btn-sm">
            ← Back to archive
          </Link>
        </div>
      </div>
    );

  if (!item)
    return (
      <div className="container container-narrow section">
        <div className="state">
          <div className="skeleton" style={{ height: 34, width: '60%', margin: '0 auto 1rem' }} />
          <div className="skeleton" style={{ height: 200 }} />
        </div>
      </div>
    );

  return (
    <div className="container container-narrow section">
      <Link to="/archive" className="btn btn-ghost btn-sm" style={{ marginLeft: '-0.7rem' }}>
        <ArrowLeft size={15} /> Back to archive
      </Link>
      <article>
        <div className="row wrap" style={{ marginTop: '1rem' }}>
          {item.category && <span className="tag">{item.category}</span>}
          <span className="muted">Published {fmtDate(item.created_at)}</span>
        </div>
        <h1 style={{ margin: '0.9rem 0 1.6rem' }}>{item.title}</h1>

        <h3 style={{ color: 'var(--accent-2)' }}>The question</h3>
        <div className="card" style={{ background: 'var(--accent-softer)', borderColor: 'var(--line)' }}>
          <div style={{ whiteSpace: 'pre-wrap' }}>{item.content}</div>
        </div>

        <h3 style={{ color: 'var(--accent-2)', marginTop: '2.2rem' }}>The response</h3>
        <div className="card">
          <div style={{ whiteSpace: 'pre-wrap' }}>{item.answer}</div>
        </div>

        <div className="disclaimer" style={{ marginTop: '2rem' }}>
          <ShieldCheck size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          This answer has been anonymized. Identifying details were removed before publishing.
          GraceLine Answers is a ministry, not a substitute for licensed therapy or emergency care.
        </div>

        <div className="panel" style={{ marginTop: '2.2rem', textAlign: 'center' }}>
          <h3 style={{ marginBottom: '0.4rem' }}>Have a question of your own?</h3>
          <p className="muted" style={{ marginBottom: '1rem' }}>
            Ask anonymously and receive a caring, Scripture-based response.
          </p>
          <Link to="/ask" className="btn btn-primary">
            Ask your question
          </Link>
        </div>
      </article>
    </div>
  );
}
