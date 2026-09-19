import Reveal from './Reveal';

/**
 * Full-bleed cinematic scripture band — light-rays backdrop, oversized serif
 * quote, slow breathing glow.
 */
export default function ScriptureBand({ quote, citation }) {
  return (
    <section className="scripture-band" aria-label="Scripture">
      <div className="scripture-bg" style={{ backgroundImage: 'url(/assets/light-rays.jpg)' }} />
      <div className="scripture-scrim" />
      <div className="container">
        <Reveal variant="zoom">
          <blockquote className="scripture-quote">
            <span className="quote-mark" aria-hidden="true">
              “
            </span>
            {quote}
          </blockquote>
          <cite>{citation}</cite>
        </Reveal>
      </div>
    </section>
  );
}
