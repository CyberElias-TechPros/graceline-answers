import { useEffect, useState } from 'react';
import { api, fmt } from '../lib/api';

export default function Prayer() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ title: '', content: '' });

  async function load() {
    const r = await api('/prayer');
    setItems(r.items);
  }
  useEffect(() => { load(); }, []);

  async function submit(e) {
    e.preventDefault();
    await api('/prayer', { method: 'POST', body: form });
    setForm({ title: '', content: '' });
    load();
  }
  async function pray(id) {
    await api(`/prayer/${id}/pray`, { method: 'POST' });
    load();
  }

  return (
    <>
      <h1>Prayer wall</h1>
      <p className="muted">Share a need anonymously. Others can pray with you.</p>
      <form onSubmit={submit} className="card">
        <label>Title</label>
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        <label>Request</label>
        <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} required />
        <div style={{ marginTop: 10 }}><button>Submit anonymously</button></div>
      </form>
      {items.map((p) => (
        <div className="card" key={p.id}>
          <h2 style={{ margin: 0 }}>{p.title}</h2>
          <p style={{ whiteSpace: 'pre-wrap' }}>{p.content}</p>
          <div className="row" style={{ alignItems: 'center' }}>
            <span className="muted">{fmt(p.created_at)} · {p.prayed_count} prayed</span>
            <button onClick={() => pray(p.id)} style={{ flex: 0 }}>🙏 I prayed</button>
          </div>
        </div>
      ))}
    </>
  );
}
