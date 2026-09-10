import { Phone } from "lucide-react";
import { CRISIS_BANNER } from "../../shared/site";

/**
 * Crisis resources.
 *
 * Shown whenever crisis language is detected, and always available as a
 * persistent page. It is styled to be unmistakable without reading as a system
 * error — the person seeing it is already frightened.
 *
 * `role="alert"` means a screen reader announces it immediately, which is the
 * correct behaviour for something this important.
 */
export function CrisisBanner({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <aside
      role="alert"
      aria-label="Crisis support resources"
      className={`relative overflow-hidden rounded-2xl border border-clay/35 bg-clay/8 p-5 sm:p-6 ${className}`}
    >
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-clay"
        aria-hidden="true"
      />
      <div className="flex items-start gap-3">
        <span className="gl-pulse mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-clay/15 text-clay">
          <Phone size={17} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-[1.15rem] font-semibold leading-snug text-foreground">
            {CRISIS_BANNER.title}
          </h2>
          <p className="mt-1.5 text-[0.94rem] leading-relaxed text-muted-foreground">
            {CRISIS_BANNER.lead}
          </p>

          {!compact && (
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {CRISIS_BANNER.lines.map((line) => (
                <li
                  key={line.label}
                  className="rounded-xl border border-clay/20 bg-card/70 px-3.5 py-2.5"
                >
                  <span className="block text-[0.78rem] leading-snug text-muted-foreground">
                    {line.label}
                  </span>
                  <span className="mt-0.5 block text-[0.95rem] font-semibold text-foreground">
                    {line.value}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </aside>
  );
}
