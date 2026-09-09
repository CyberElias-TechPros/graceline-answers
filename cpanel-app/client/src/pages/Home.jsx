import { Link } from 'react-router-dom';
import { useSeo } from '../lib/seo';
import { MessageCircleHeart, ShieldCheck, Sparkles, ArrowRight, BookOpen, HandHeart } from 'lucide-react';

const CATEGORIES = [
  'Bible Interpretation',
  'Salvation',
  'Prayer',
  'Marriage',
  'Parenting',
  'Youth',
  'Anxiety',
  'Depression',
  'Faith Crisis',
  'Career',
  'Other',
];

export default function Home() {
  useSeo({
    title: 'Anonymous Bible Q&A and Christian Counseling',
    description:
      'Ask Bible and life questions anonymously. Receive scripture-based counsel from real pastors. Browse a searchable archive of answered questions.',
    canonicalPath: '/',
  });

  return (
    <>
      <section className="hero">
        <div className="hero-bg" style={{ backgroundImage: 'url(/assets/hero-grace.jpg)' }} />
        <div className="container">
          <div className="hero-content">
            <span className="eyebrow">Anonymous · Compassionate · Rooted in Scripture</span>
            <h1>
              Ask freely. Be heard with <em>grace</em>.
            </h1>
            <p>
              Bring any question about the Bible, faith, marriage, anxiety, or life. Stay fully
              anonymous if you wish. A real counselor reads every message and responds with
              scripture and compassion — no judgment, no noise.
            </p>
            <div className="hero-cta">
              <Link to="/ask" className="btn btn-gold">
                <MessageCircleHeart size={18} />
                Ask a Question
              </Link>
              <Link to="/archive" className="btn btn-light">
                <BookOpen size={18} />
                Browse Archive
              </Link>
            </div>
            <p className="hero-note">
              You're never alone. If you are in crisis, please contact local emergency services or a
              crisis hotline immediately.
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">How it works</span>
            <h2>Three simple steps to a answered heart</h2>
            <p className="lead">
              Whether you wrestle with Scripture or a season of life, there is room here for the
              honest question.
            </p>
          </div>
          <div className="steps">
            <div className="step">
              <div className="step-num">01</div>
              <h3>You ask</h3>
              <p>
                Anonymous or with an email — your choice. We never log IP addresses for anonymous
                submissions.
              </p>
            </div>
            <div className="step">
              <div className="step-num">02</div>
              <h3>A counselor replies privately</h3>
              <p>
                You'll receive a unique private link. Save it — you can continue the conversation
                as long as you need.
              </p>
            </div>
            <div className="step">
              <div className="step-num">03</div>
              <h3>Some answers are published</h3>
              <p>
                When a question can help others, our team rewrites it to remove anything
                identifying — and only then publishes it to the archive.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container">
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))' }}>
            <div className="card">
              <div className="row" style={{ gap: '0.7rem', marginBottom: '0.6rem' }}>
                <span className="brand-mark" style={{ width: 40, height: 40, borderRadius: 12 }}>
                  <ShieldCheck size={20} />
                </span>
                <h3 style={{ margin: 0 }}>Truly anonymous</h3>
              </div>
              <p>
                We deliberately never store your IP address, browser fingerprint, or any identifying
                metadata for anonymous submissions — just what you choose to write.
              </p>
            </div>
            <div className="card">
              <div className="row" style={{ gap: '0.7rem', marginBottom: '0.6rem' }}>
                <span className="brand-mark" style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, var(--gold), #caa052)' }}>
                  <Sparkles size={20} />
                </span>
                <h3 style={{ margin: 0 }}>Scripture-based counsel</h3>
              </div>
              <p>
                Every reply is grounded in God's Word and offered with genuine pastoral care — not a
                template, not a bot.
              </p>
            </div>
            <div className="card">
              <div className="row" style={{ gap: '0.7rem', marginBottom: '0.6rem' }}>
                <span className="brand-mark" style={{ width: 40, height: 40, borderRadius: 12 }}>
                  <HandHeart size={20} />
                </span>
                <h3 style={{ margin: 0 }}>A caring community</h3>
              </div>
              <p>
                Beyond the Q&amp;A, our prayer wall lets others stand with you in prayer — a quiet
                reminder that you are not alone.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">What people ask</span>
            <h2>Every season of life, every hard question</h2>
          </div>
          <div className="row wrap" style={{ marginBottom: '2rem' }}>
            {CATEGORIES.map((c) => (
              <span key={c} className="tag outline">
                {c}
              </span>
            ))}
          </div>
          <div className="row wrap">
            <Link to="/ask" className="btn btn-primary">
              Start your question <ArrowRight size={16} />
            </Link>
            <Link to="/prayer" className="btn btn-secondary">
              <HandHeart size={16} /> Visit the prayer wall
            </Link>
          </div>
          <div className="disclaimer">
            <strong>A gentle note:</strong> GraceLine Answers is a ministry, not a substitute for
            licensed therapy or emergency care. If you are in crisis, please contact local
            emergency services or a crisis hotline immediately.
          </div>
        </div>
      </section>
    </>
  );
}
