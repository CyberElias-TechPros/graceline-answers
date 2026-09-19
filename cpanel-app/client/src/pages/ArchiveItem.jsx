import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, fmtDate } from '../lib/api';
import { useSeo } from '../lib/seo';
import Reveal from '../components/Reveal';
import Particles from '../components/Particles';
import { ArrowLeft, BookOpen, ShieldCheck, MessageCircleHeart } from 'lucide-react';

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
      <div className="container container-narrow section" style={{ paddingTop: '7rem' }}>
        <div className="state">
          <div className="state-icon">
            <BookOpen size={22} />
          </div>
          <h3>Not found</h3>
          <p>This answer doesn't exist or hasn't been published yet.</p>
          <Link to="/archive" className="btn btn-ghost btn-sm">
            <ArrowLeft size={15} /> Back to archive
          </Link>
        </div>
      </div>
    );

  if (!item)
    return (
      <div className="container container-narrow section" style={{ paddingTop: '7rem' }}>
        <div className="skeleton" style={{ height: 40, width: '60%', margin: '0 auto 1.2rem' }} />
        <div className="skeleton" style={{ height: 240 }} />
      </div>
    );

  return (
    <div className="section" style={{ paddingTop: '6.5rem', position: 'relative' }}>
      <Particles count={8} seed={17} />
      <div className="container container-narrow">
        <Reveal variant="fade">
          <Link to="/archive" className="btn btn-ghost btn-sm">
            <ArrowLeft size={15} /> Back to archive
          </Link>
        </Reveal>

        <Reveal variant="up" delay={80}>
          <div className="row wrap" style={{ marginTop: '1.6rem' }}>
            {item.category && <span className="tag gold">{item.category}</span>}
            <span className="muted">Published {fmtDate(item.created_at)}</span>
          </div>
          <h1 className="article-title">{item.title}</h1>
        </Reveal>

        <Reveal variant="up" delay={160}>
          <div className="article-label">The question</div>
          <div className="question-card">{item.content}</div>
        </Reveal>

        <Reveal variant="up" delay={240}>
          <div className="article-label" style={{ marginTop: '2.4rem' }}>
            The response
          </div>
          <div className="card">
            <div className="article-answer">{item.answer}</div>
          </div>
        </Reveal>

        <Reveal variant="fade" delay={300}>
          <div className="disclaimer">
            <ShieldCheck size={15} />
            <span>
              This answer has been anonymized. Identifying details were removed before
              publishing. GraceLine Answers is a ministry, not a substitute for licensed therapy
              or emergency care.
            </span>
          </div>
        </Reveal>

        <Reveal variant="zoom" delay={340}>
          <div className="panel" style={{ marginTop: '2.4rem', textAlign: 'center' }}>
            <div style={{ display: 'grid', placeItems: 'center', marginBottom: '0.6rem', color: 'var(--gold)' }}>
              <MessageCircleHeart size={26} />
            </div>
            <h3 style={{ marginBottom: '0.4rem' }}>Have a question of your own?</h3>
            <p className="muted" style={{ marginBottom: '1.3rem' }}>
              Ask anonymously and receive a caring, Scripture-based response.
            </p>
            <Link to="/ask" className="btn btn-gold">
              Ask your question
            </Link>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
