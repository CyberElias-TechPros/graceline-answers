import { cn } from "../lib/utils";

/**
 * The mark: a plumb line dropped through a circle — "GraceLine".
 *
 * Drawn inline rather than shipped as an image so it inherits currentColor,
 * stays crisp at any size, and costs no request on the LCP-critical header.
 */
export function Wordmark({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg
        width={compact ? 26 : 32}
        height={compact ? 26 : 32}
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <circle cx="16" cy="16" r="12.5" stroke="currentColor" strokeWidth="1.1" opacity="0.42" />
        <path d="M16 3.5v25" stroke="currentColor" strokeWidth="1.1" opacity="0.42" />
        <path d="M16 6.5v13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <circle cx="16" cy="22.4" r="2.6" fill="currentColor" />
      </svg>
      {!compact && (
        <span className="font-display text-[1.05rem] font-semibold leading-none tracking-[-0.01em]">
          GraceLine
          <span className="ml-1 font-normal opacity-70">Answers</span>
        </span>
      )}
    </span>
  );
}
