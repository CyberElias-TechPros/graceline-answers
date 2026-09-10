import { useEffect, useRef, useState } from "react";
import { formatCount } from "../lib/format";
import { usePrefersReducedMotion } from "../hooks/use-reveal";

/**
 * Animates a number up when it scrolls into view.
 *
 * The final value is what actually renders in the server HTML, so a crawler and
 * a no-JS visitor see the real figure; the count-up is purely decorative and is
 * skipped entirely under `prefers-reduced-motion`.
 */
export function CountUp({ to, duration = 1100 }: { to: number; duration?: number }) {
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLSpanElement | null>(null);
  const [value, setValue] = useState(reduced ? to : 0);
  const started = useRef(false);

  useEffect(() => {
    if (reduced) {
      setValue(to);
      return;
    }
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setValue(to);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || started.current) return;
        started.current = true;
        observer.disconnect();

        const start = performance.now();
        const tick = (now: number) => {
          const progress = Math.min(1, (now - start) / duration);
          // Ease-out cubic: fast at first, settling into the final value.
          const eased = 1 - Math.pow(1 - progress, 3);
          setValue(Math.round(to * eased));
          if (progress < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [to, duration, reduced]);

  return (
    <span ref={ref} className="tabular-nums" aria-label={formatCount(to)}>
      {formatCount(value)}
    </span>
  );
}
