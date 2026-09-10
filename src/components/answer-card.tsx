import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import type { PublicArchiveEntry } from "../lib/api";
import { formatShortDate } from "../lib/format";
import { usePointerCard } from "../hooks/use-pointer-card";

/**
 * A published answer in list form.
 *
 * The whole card is one link (the title carries the accessible name and an
 * arrow provides a visible affordance), which keeps it usable with a keyboard
 * and with a screen reader rather than relying on a hover-only cue.
 */
export function AnswerCard({ entry, featured = false }: { entry: PublicArchiveEntry; featured?: boolean }) {
  const { ref, onPointerMove } = usePointerCard<HTMLAnchorElement>();

  return (
    <Link
      to="/archive/$slug"
      params={{ slug: entry.slug }}
      ref={ref}
      onPointerMove={onPointerMove}
      data-interactive
      className={`gl-card group block overflow-hidden p-6 no-underline sm:p-7 ${featured ? "sm:p-8" : ""}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            {entry.category ? (
              <span className="rounded-full border border-gold/35 bg-gold/10 px-2.5 py-0.5 text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-gold-deep">
                {entry.category}
              </span>
            ) : null}
            <time
              dateTime={new Date(entry.publishedAt).toISOString()}
              className="text-[0.8rem] text-muted-foreground"
            >
              {formatShortDate(entry.publishedAt)}
            </time>
          </div>

          <h3
            className={`mt-3 font-semibold leading-[1.25] text-foreground transition-colors group-hover:text-gold-deep ${
              featured ? "text-[1.5rem] sm:text-[1.7rem]" : "text-[1.2rem]"
            }`}
          >
            {entry.title}
          </h3>

          <p className="mt-2.5 line-clamp-3 text-[0.96rem] leading-relaxed text-muted-foreground">
            {entry.excerpt}
          </p>
        </div>

        <span
          aria-hidden="true"
          className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-all duration-200 group-hover:border-gold group-hover:bg-gold group-hover:text-[oklch(0.22_0.05_70)]"
        >
          <ArrowUpRight size={16} />
        </span>
      </div>

      <span className="sr-only">Read the full answer</span>
    </Link>
  );
}
