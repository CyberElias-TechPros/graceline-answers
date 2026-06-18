import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, fmt } from '../lib/api';

export default function ArchiveItem() {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  useEffect(() => { api(`/archive/${id}`).then(setItem).catch(() => setItem(false)); }, [id]);
  if (item === false) return <p>Not found.</p>;
  if (!item) return <p>Loading…</p>;
  return (
    <>
      <p className="muted"><Link to="/archive">← Archive</Link></p>
      <h1>{item.title}</h1>
      {item.category && <span className="tag">{item.category}</span>}
      <p className="muted"> {fmt(item.created_at)}</p>
      <div className="card"><p style={{ whiteSpace: 'pre-wrap' }}>{item.content}</p></div>
      <h2>Response</h2>
      <div className="card"><p style={{ whiteSpace: 'pre-wrap' }}>{item.answer}</p></div>
    </>
  );
}
