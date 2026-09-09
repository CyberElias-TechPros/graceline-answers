import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDate } from '../lib/api';
import { useSeo } from '../lib/seo';
import { Search, BookOpen, ArrowRight } from 'lucide-react';

export default function Archive() {
  const [items, setItems] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(null);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [offset, setOffset] = useState(0);
  const limit = 20;
  const lastQuery = useRef('');
  const lastOffset = useRef(0);

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
    lastOffset.current = 0;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function doSearch(e) {
    e.preventDefault();
    const term = q.trim();
    lastQuery.current = term;
    lastOffset.current = 0;
    setOffset(0);
    load(term, 0);
  }

  function loadMore() {
    if (nextOffset == null) return;
    lastOffset.current = nextOffset;
    setOffset(nextOffset);
    load(lastQuery.current, nextOffset, true);
  }

  return (
    <div className="container section" style={{ maxWidth: 900 }}>
      <div style={{ maxWidth: 720 }}>
        <span className="eyebrow">Public archive</span>
        <h1 style={{ margin: '0.7rem 0 0.6rem' }}>Answered questions</h1>
        <p className="lead" style={{ marginTop: 0 }}>
          Anonymized answers from real conversations — shared so others can find the same comfort
          and truth.
        </p>
      </div>

      <form onSubmit={doSearch} className="row" style={{ margin: '1.8rem 0 2rem', maxWidth: 620 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-muted)' }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by keyword… e.g. anxiety, marriage, salvation"
            style={{ paddingLeft: 42 }}
            aria-label="Search the archive"
          />
        </div>
        <button className="btn btn-primary" type="submit">
          Search
        </button>
      </form>

      {err && <div className="form-error">{err}</div>}

      {!loading && items.length === 0 && (
        <div className="state">
          <div className="state-icon">
            <BookOpen size={24} />
          </div>
          <h3>No published answers yet</h3>
          <p>Once a counselor shares an anonymized answer, it appears here.</p>
          <Link to="/ask" className="btn btn-secondary btn-sm">
            Ask your own question <ArrowRight size={15} />
          </Link>
        </div>
      )}

      {loading && items.length === 0 && (
        <div className="stack">
          <div className="skeleton" style={{ height: 120 }} />
          <div className="skeleton" style={{ height: 120 }} />
          <div className="skeleton" style={{ height: 120 }} />
        </div>
      )}

      <div className="stack">
        {items.map((it) => (
          <Link key={it.id} to={`/archive/${it.id}`} className="card card-link">
            <div className="spread">
              <h3 style={{ margin: 0 }}>{it.title}</h3>
            </div>
            <div className="row wrap" style={{ marginTop: '0.5rem' }}>
              {it.category && <span className="tag">{it.category}</span>}
              <span className="muted">{fmtDate(it.created_at)}</span>
            </div>
          </Link>
        ))}
      </div>

      {hasMore && (
        <div className="text-center" style={{ marginTop: '2rem' }}>
          <button className="btn btn-secondary" onClick={loadMore} disabled={loading}>
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}
