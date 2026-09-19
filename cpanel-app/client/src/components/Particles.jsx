import { useMemo } from 'react';

/**
 * Floating dust motes — pure CSS animation, deterministic pseudo-random
 * layout so renders are stable between reloads.
 */
export default function Particles({ count = 16, seed = 7, className = '' }) {
  const motes = useMemo(() => {
    let s = seed;
    const rand = () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
    return Array.from({ length: count }, (_, i) => ({
      left: `${(rand() * 100).toFixed(2)}%`,
      top: `${(rand() * 100).toFixed(2)}%`,
      size: 1 + rand() * 2.6,
      delay: `${(rand() * 14).toFixed(2)}s`,
      dur: `${(10 + rand() * 16).toFixed(2)}s`,
      opacity: 0.25 + rand() * 0.5,
      key: i,
    }));
  }, [count, seed]);

  return (
    <div className={`particles ${className}`} aria-hidden="true">
      {motes.map((m) => (
        <span
          key={m.key}
          className="mote"
          style={{
            left: m.left,
            top: m.top,
            width: m.size,
            height: m.size,
            animationDelay: m.delay,
            animationDuration: m.dur,
            opacity: m.opacity,
          }}
        />
      ))}
    </div>
  );
}
