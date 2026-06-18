import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmt } from '../lib/api';

export default function Archive() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');

  async function load(query = '') {
    const r = await api(`/archive${query ? `?q=${encodeURIComponent(query)}` : ''}`);
    setItems(r.items);
  }
  useEffect(() => { load(); }, []);

  return (
    <>
      <h1>Public archive</h1>
      <p className="muted">Anonymized answers from real conversations.</p>
      <form onSubmit={(e) => { e.preventDefault(); load(q); }} className="row" style={{ margin: '16px 0' }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by keyword…" />
        <button style={{ flex: 0 }}>Search</button>
      </form>
      {items.length === 0 && <p className="muted">No published answers yet.</p>}
      {items.map((it) => (
        <Link key={it.id} to={`/archive/${it.id}`} style={{ color: 'inherit' }}>
          <div className="card">
            <h2 style={{ margin: 0 }}>{it.title}</h2>
            {it.category && <span className="tag">{it.category}</span>}
            <p className="muted" style={{ marginTop: 6 }}>{fmt(it.created_at)}</p>
          </div>
        </Link>
      ))}
    </>
  );
}
