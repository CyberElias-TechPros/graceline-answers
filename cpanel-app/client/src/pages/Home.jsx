import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <>
      <section className="hero">
        <h1>Bible answers and faith-centered counsel — without fear.</h1>
        <p>Ask any question about the Bible, faith, marriage, anxiety, or life.
        Stay fully anonymous if you wish. A real counselor reads every message
        and responds with scripture and compassion.</p>
        <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
          <Link to="/ask"><button>Ask a Question</button></Link>
          <Link to="/archive"><button className="secondary">Browse Archive</button></Link>
        </div>
      </section>
      <h2>How it works</h2>
      <div className="card">
        <p><strong>1. You ask.</strong> Anonymous or with an email — your choice.
        We never log IP addresses for anonymous submissions.</p>
        <p><strong>2. A counselor replies privately.</strong> You'll receive a
        unique link. Save it. You can continue the conversation as long as you need.</p>
        <p><strong>3. Some answers are published — anonymized.</strong> When a
        question can help others, our team rewrites it to remove anything identifying,
        and only then publishes it to the archive.</p>
      </div>
      <p className="muted">
        GraceLine Answers is a ministry, not a substitute for licensed therapy or
        emergency care. If you are in crisis, please contact local emergency
        services or a crisis hotline immediately.
      </p>
    </>
  );
}
