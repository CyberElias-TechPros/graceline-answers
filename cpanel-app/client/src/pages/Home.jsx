import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  MessageCircleHeart,
  ShieldCheck,
  Sparkles,
  BookOpen,
  HandHeart,
  ArrowRight,
  Lock,
  HeartHandshake,
  Flame,
  CheckCircle2,
} from 'lucide-react';
import { api, fmtDate } from '../lib/api';
import { useSeo } from '../lib/seo';
import { useParallax } from '../lib/motion';
import Reveal from '../components/Reveal';
import Particles from '../components/Particles';
import Marquee from '../components/Marquee';
import SectionHead from '../components/SectionHead';
import ScriptureBand from '../components/ScriptureBand';
import StatTile from '../components/StatTile';

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

  const [answers, setAnswers] = useState([]);
  const [stats, setStats] = useState(null);
  const parallaxRef = useParallax(0.12);

  useEffect(() => {
    api('/archive?limit=3')
      .then((r) => setAnswers(r.items || []))
      .catch(() => {});
    api('/stats')
      .then(setStats)
      .catch(() => {});
  }, []);

  return (
    <>
      {/* ------------------------------ HERO ------------------------------ */}
      <section className="hero">
        <div className="hero-bg" style={{ backgroundImage: 'url(/assets/hero-grace.jpg)' }} />
        <div className="hero-scrim" />
        <div className="hero-glow" />
        <Particles count={18} seed={11} />

        <div className="container">
          <div className="hero-content">
            <span className="eyebrow">
              <i className="eyebrow-line" aria-hidden="true" />
              Anonymous · Compassionate · Rooted in Scripture
            </span>
            <h1>
              Ask freely.
              <br />
              Be heard with <em>grace</em>.
            </h1>
            <p className="lead">
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
              <ShieldCheck size={15} />
              You're never alone. If you are in crisis, please contact local emergency services or
              a crisis hotline immediately.
            </p>
            <div className="hero-trust">
              <span className="trust-item">
                <Lock size={16} /> 100% anonymous option
              </span>
              <span className="trust-item">
                <HeartHandshake size={16} /> Real human counselors
              </span>
              <span className="trust-item">
                <BookOpen size={16} /> Scripture-based answers
              </span>
            </div>
          </div>
        </div>

        <div className="hero-float" ref={parallaxRef} aria-hidden="true">
          <div className="card">
            <div className="hero-float-label">From the archive</div>
            <div className="hero-float-quote">
              "…the Lord is close to the brokenhearted and saves those who are crushed in
              spirit."
            </div>
            <div className="hero-float-ref">Psalm 34:18 — from a published answer</div>
          </div>
        </div>

        <div className="scroll-cue">
          <span>Scroll</span>
          <span className="scroll-cue-line" />
        </div>
      </section>

      {/* --------------------------- CATEGORY MARQUEE --------------------------- */}
      <Marquee items={CATEGORIES} />

      {/* ------------------------------ HOW IT WORKS ------------------------------ */}
      <section className="section">
        <div className="container">
          <SectionHead
            eyebrow="How it works"
            title={
              <>
                Three steps to an <em>answered</em> heart
              </>
            }
            lead="Whether you wrestle with Scripture or a season of life, there is room here for the honest question."
          />
          <div className="steps">
            <Reveal variant="up" delay={0}>
              <div className="step">
                <div className="step-num">01</div>
                <h3>You ask</h3>
                <p>
                  Anonymous or with an email — your choice. We never log IP addresses for anonymous
                  submissions.
                </p>
              </div>
            </Reveal>
            <Reveal variant="up" delay={140}>
              <div className="step">
                <div className="step-num">02</div>
                <h3>A counselor replies privately</h3>
                <p>
                  You'll receive a unique private link. Save it — you can continue the
                  conversation as long as you need.
                </p>
              </div>
            </Reveal>
            <Reveal variant="up" delay={280}>
              <div className="step">
                <div className="step-num">03</div>
                <h3>Some answers are published</h3>
                <p>
                  When a question can help others, our team rewrites it to remove anything
                  identifying — and only then publishes it to the archive.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ------------------------------ SCRIPTURE BAND ------------------------------ */}
      <ScriptureBand
        quote="The LORD is close to the brokenhearted and saves those who are crushed in spirit."
        citation="Psalm 34 : 18"
      />

      {/* --------------------------- FEATURED ANSWERS --------------------------- */}
      <section className="section">
        <div className="container">
          <SectionHead
            eyebrow="From the archive"
            title={
              <>
                Answers that have helped <em>others</em>
              </>
            }
            lead="Every entry below was answered in a real private conversation, then carefully anonymized by our counselors before publishing."
          />
          {answers.length > 0 ? (
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
              {answers.map((a, i) => (
                <Reveal key={a.id} variant="up" delay={i * 130}>
                  <Link to={`/archive/${a.id}`} className="card answer-card">
                    <div className="answer-title">{a.title}</div>
                    <div className="answer-excerpt">{a.content}</div>
                    <div className="answer-foot">
                      <span className="tag gold">{a.category || 'GraceLine'}</span>
                      <span className="answer-arrow">
                        <ArrowRight size={16} />
                      </span>
                    </div>
                  </Link>
                </Reveal>
              ))}
            </div>
          ) : (
            <Reveal variant="fade">
              <div className="state" style={{ maxWidth: 560, margin: '0 auto' }}>
                <div className="state-icon">
                  <BookOpen size={22} />
                </div>
                <h3>The archive is being written</h3>
                <p>
                  Once a counselor shares an anonymized answer, it appears here for everyone to
                  find.
                </p>
                <Link to="/ask" className="btn btn-gold btn-sm">
                  Be the first to ask <ArrowRight size={15} />
                </Link>
              </div>
            </Reveal>
          )}
          <div className="text-center" style={{ marginTop: '2.6rem' }}>
            <Link to="/archive" className="btn btn-ghost">
              Explore the full archive <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ------------------------------- VALUES ------------------------------- */}
      <section className="section section-alt">
        <div className="container">
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))' }}>
            <Reveal variant="up" delay={0}>
              <div className="card value-card">
                <span className="value-icon">
                  <ShieldCheck size={22} />
                </span>
                <h3>Truly anonymous</h3>
                <p>
                  We deliberately never store your IP address, browser fingerprint, or any
                  identifying metadata for anonymous submissions — just what you choose to write.
                </p>
              </div>
            </Reveal>
            <Reveal variant="up" delay={140}>
              <div className="card value-card">
                <span className="value-icon">
                  <Sparkles size={22} />
                </span>
                <h3>Scripture-based counsel</h3>
                <p>
                  Every reply is grounded in God's Word and offered with genuine pastoral care —
                  not a template, not a bot.
                </p>
              </div>
            </Reveal>
            <Reveal variant="up" delay={280}>
              <div className="card value-card">
                <span className="value-icon">
                  <HandHeart size={22} />
                </span>
                <h3>A caring community</h3>
                <p>
                  Beyond the Q&amp;A, our prayer wall lets others stand with you in prayer — a
                  quiet reminder that you are not alone.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ------------------------------- STATS ------------------------------- */}
      {stats && (
        <section className="section">
          <div className="container">
            <div className="stats-band">
              <StatTile label="Questions received" value={stats.questions_total} delay={0} />
              <StatTile label="Conversations underway" value={stats.answered_total} delay={110} />
              <StatTile label="Published answers" value={stats.published_total} delay={220} />
              <StatTile label="Prayers spoken" value={stats.prayers_total} delay={330} />
            </div>
          </div>
        </section>
      )}

      {/* ------------------------------- PRIVACY ------------------------------- */}
      <section className="section section-alt">
        <div className="container">
          <div className="privacy-grid">
            <Reveal variant="left">
              <div className="privacy-visual" style={{ backgroundImage: 'url(/assets/light-rays.jpg)' }} />
            </Reveal>
            <Reveal variant="right" delay={120}>
              <span className="eyebrow">Your privacy is the point</span>
              <h2>
                Designed so you can speak <em>without fear</em>
              </h2>
              <ul className="privacy-list">
                <li>
                  <CheckCircle2 size={18} />
                  <span>
                    <strong>No IP, no fingerprint.</strong> Anonymous submissions store only what
                    you type — verified in the database schema itself.
                  </span>
                </li>
                <li>
                  <CheckCircle2 size={18} />
                  <span>
                    <strong>Never auto-published.</strong> Only a counselor's hand-anonymized copy
                    can ever reach the public archive.
                  </span>
                </li>
                <li>
                  <CheckCircle2 size={18} />
                  <span>
                    <strong>Your key, your conversation.</strong> A private tracking link is the
                    only way back to your thread — keep it safe.
                  </span>
                </li>
                <li>
                  <CheckCircle2 size={18} />
                  <span>
                    <strong>Rate-limited &amp; protected.</strong> Every public endpoint is
                    protected, and counselors are a small, vetted ministry team.
                  </span>
                </li>
              </ul>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ------------------------------ PRAYER TEASER ------------------------------ */}
      <section className="section">
        <div className="container">
          <Reveal variant="zoom">
            <div className="prayer-teaser">
              <div className="teaser-bg" aria-hidden="true" />
              <div className="teaser-scrim" aria-hidden="true" />
              <div style={{ maxWidth: 460 }}>
                <span className="eyebrow">
                  <i className="eyebrow-line" aria-hidden="true" />
                  Prayer wall
                </span>
                <h2>
                  Standing together, <em>one flame</em> at a time
                </h2>
                <p className="lead">
                  Share a need, however small. Others will pray with you — anonymously, no account
                  required.
                </p>
              </div>
              <Link to="/prayer" className="btn btn-gold">
                <Flame size={17} /> Visit the prayer wall
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------- FINAL CTA ------------------------------- */}
      <section className="final-cta">
        <div className="container">
          <Reveal variant="up">
            <span className="eyebrow">
              <i className="eyebrow-line" aria-hidden="true" />
              When you're ready
            </span>
            <h2>
              Your question matters.
              <br />
              <em>Ask it.</em>
            </h2>
            <p className="lead" style={{ margin: '1.2rem auto 2.2rem' }}>
              No account. No name. No judgment. Just a real counselor, ready to sit with your
              question in Scripture.
            </p>
            <Link to="/ask" className="btn btn-gold">
              <MessageCircleHeart size={18} /> Start your question
            </Link>
            <div className="disclaimer" style={{ justifyContent: 'center', maxWidth: 640, margin: '2.4rem auto 0' }}>
              <Sparkles size={15} />
              <span>
                GraceLine Answers is a ministry, not a substitute for licensed therapy or
                emergency care.
              </span>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
