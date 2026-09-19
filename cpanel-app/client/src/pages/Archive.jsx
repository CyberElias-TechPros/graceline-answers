import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDate } from '../lib/api';
import { useSeo } from '../lib/seo';
import Reveal from '../components/Reveal';
import Particles from '../components/Particles';
import { ArrowRight, BookOpen } from 'lucide-react';

export default function Archive() {
  const [items, setItems] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(null);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const limit = 20;
  const lastQuery = useRef('');

  useSeo({
    title: 'Answered Questions Archive',
    description:
      'Browse a searchable archive of anonymized answers from real conversations — Bible Q&A and faith-centered counsel.',
    canonicalPath: '/archive',
  });

  async function load(query = '', start = 0, append = false) {
    setLoading(true);
    setErr(null);
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    params.set('limit', String(limit));
    params.set('offset', String(start));
    try {
      const r = await api(`/archive?${params.toString()}`);
      setItems((prev) => (append ? [...prev, ...r.items] : r.items));
      setHasMore(r.hasMore);
      setNextOffset(r.nextOffset);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    lastQuery.current = '';
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function doSearch(e) {
    e.preventDefault();
    const term = q.trim();
    lastQuery.current = term;
    load(term, 0);
  }

  function loadMore() {
    if (nextOffset == null) return;
    load(lastQuery.current, nextOffset, true);
  }

  return (
    <>
      <section className="sub-hero">
        <div
          className="sub-hero-bg"
          style={{ backgroundImage: 'url(/assets/archive-quiet.jpg)' }}
        />
        <div className="sub-hero-scrim" />
        <Particles count={10} seed={21} />
        <div className="container">
          <Reveal variant="up">
            <span className="eyebrow">
              <i className="eyebrow-line" aria-hidden="true" />
              Public archive
            </span>
            <h1>
              Answered questions, <em>shared with grace</em>
            </h1>
            <p className="lead">
              Anonymized answers from real conversations — shared so others can find the same
              comfort and truth.
            </p>
          </Reveal>
          <Reveal variant="up" delay={160}>
            <form onSubmit={doSearch} className="search-form" role="search">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by keyword… e.g. anxiety, marriage, salvation"
                aria-label="Search the archive"
              />
              <button className="btn btn-gold" type="submit">
                Search
              </button>
            </form>
          </Reveal>
        </div>
      </section>

      <section className="section" style={{ paddingTop: '2.5rem' }}>
        <div className="container" style={{ maxWidth: 900 }}>
          {err && <div className="form-error">{err}</div>}

          {!loading && items.length === 0 && (
            <Reveal variant="fade">
              <div className="state">
                <div className="state-icon">
                  <BookOpen size={22} />
                </div>
                <h3>{q ? 'No matches for that search' : 'No published answers yet'}</h3>
                <p>
                  {q
                    ? 'Try different keywords, or browse the full archive.'
                    : 'Once a counselor shares an anonymized answer, it appears here.'}
                </p>
                <Link to="/ask" className="btn btn-gold btn-sm">
                  Ask your own question <ArrowRight size={15} />
                </Link>
              </div>
            </Reveal>
          )}

          {loading && items.length === 0 && (
            <div className="stack">
              <div className="skeleton" style={{ height: 130 }} />
              <div className="skeleton" style={{ height: 130 }} />
              <div className="skeleton" style={{ height: 130 }} />
            </div>
          )}

          <div className="archive-list">
            {items.map((it, i) => (
              <Reveal key={it.id} variant="up" delay={Math.min(i % 4, 3) * 90}>
                <Link to={`/archive/${it.id}`} className="card archive-card">
                  <h3>{it.title}</h3>
                  <p>{it.content}</p>
                  <div className="archive-foot">
                    {it.category && <span className="tag gold">{it.category}</span>}
                    <span>{fmtDate(it.created_at)}</span>
                    <span className="answer-arrow" aria-hidden="true">
                      <ArrowRight size={16} />
                    </span>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>

          {hasMore && (
            <div className="text-center" style={{ marginTop: '2.4rem' }}>
              <button className="btn btn-ghost" onClick={loadMore} disabled={loading}>
                {loading ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
