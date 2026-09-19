import { Phone } from 'lucide-react';

/**
 * Shared crisis/hotline alert. Shown when a question (or its thread content)
 * trips the crisis keyword detector — the banner is never dismissible so the
 * hotlines stay visible on screen.
 */
export default function CrisisBanner({ banner, className = '' }) {
  if (!banner) return null;
  return (
    <div className={`crisis ${className}`} role="alert">
      <div className="crisis-head">
        <span className="crisis-pulse" aria-hidden="true" />
        <strong>
          <Phone size={16} /> {banner.title}
        </strong>
      </div>
      <ul className="crisis-lines">
        {banner.lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
    </div>
  );
}
