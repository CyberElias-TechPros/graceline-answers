import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { apiFetch, apiFetchOrNull } from "../../../lib/api";
import type { ArchivePage, CategoryEntry } from "../../../lib/api";
import { buildLinks, buildMeta, collectionPageJsonLd, jsonLd } from "../../../lib/seo";
import { AnswerCard } from "../../../components/answer-card";
import { Reveal } from "../../../components/reveal";
import { EmptyState, LoadingState, NoResultsState } from "../../../components/states";
import { formatCount } from "../../../lib/format";
import { cn } from "../../../lib/utils";

const PAGE_SIZE = 12;

/**
 * Archive index.
 *
 * The first page is server-rendered so it is indexable and useful without
 * JavaScript. Search and paging are progressive enhancements layered on top:
 * they update the URL with `validateSearch`, so any filtered view is shareable
 * and crawlable, and the same route works as a plain link with `?q=`.
 */
export const Route = createFileRoute("/_public/archive/")({
  validateSearch: (search: Record<string, unknown>): { q?: string; category?: string } => ({
    q: typeof search.q === "string" && search.q.trim() ? search.q.trim().slice(0, 120) : undefined,
    category: typeof search.category === "string" ? search.category.slice(0, 60) : undefined,
  }),
  // `head` has no `search` key of its own — validated search params live on the
  // match. Reading `search` directly threw during SSR and returned a 500.
  head: ({ match }) => {
    const query = match.search?.q?.trim();
    // A search view has no value in the index and would compete with the
    // canonical archive listing, so it is excluded — and it canonicalises to
    // *itself*, never to /archive, so the noindex cannot be overridden.
    const selfPath = query ? `/archive?q=${encodeURIComponent(query)}` : "/archive";
    const seo = buildMeta({
      title: query ? `Search results for “${query}”` : "Answered Bible & Faith Questions",
      description: query
        ? `Answered questions matching “${query}” — written by Christian counselors, published anonymously.`
        : "Browse answered questions on anxiety, doubt, grief, forgiveness, marriage, prayer and biblical interpretation, each written by a Christian counselor.",
      path: selfPath,
      noindex: Boolean(query),
    });
    return { meta: seo.meta, links: buildLinks({ path: selfPath }) };
  },
  // The loader context exposes no `search` key in this router version — validated
  // search params arrive on `location.search`. Destructuring `search` here threw
  // during SSR and turned every /archive request into a 500.
  loader: async ({ location }): Promise<{ page: ArchivePage | null; categories: CategoryEntry[] }> => {
    const query = typeof (location.search as { q?: unknown })?.q === "string"
      ? String((location.search as { q: string }).q).trim().slice(0, 120)
      : "";
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (query) params.set("q", query);
    const [page, categories] = await Promise.all([
      apiFetchOrNull<ArchivePage>(`/archive?${params.toString()}`),
      apiFetchOrNull<{ categories: CategoryEntry[] }>("/seo/category-index"),
    ]);
    return { page, categories: categories?.categories ?? [] };
  },
  component: ArchiveIndex,
});

function ArchiveIndex() {
  const { page: initialPage, categories } = Route.useLoaderData() as {
    page: ArchivePage | null;
    categories: CategoryEntry[];
  };
  const navigate = useNavigate({ from: Route.fullPath });
  const [query, setQuery] = useState(Route.useSearch().q ?? "");
  const activeQuery = Route.useSearch().q ?? "";
  const inputRef = useRef<HTMLInputElement>(null);

  // Only fetch on the client when the user has actually changed the search;
  // the server loader already provided the initial page.
  const isClientSearch = typeof window !== "undefined" && query !== (activeQuery || "");
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["archive", activeQuery],
    queryFn: async ({ signal }) =>
      apiFetchOrNull<ArchivePage>(
        `/archive?limit=${PAGE_SIZE}${activeQuery ? `&q=${encodeURIComponent(activeQuery)}` : ""}`,
        { signal },
      ),
    enabled: !isClientSearch,
    initialData: activeQuery === (Route.useSearch().q ?? "") ? initialPage ?? undefined : undefined,
    staleTime: 60_000,
  });

  const items = useMemo(() => {
    if (!isClientSearch) return data?.items ?? initialPage?.items ?? [];
    // Debounced-free instant filtering of what we already have, so typing feels
    // immediate; the authoritative search runs once the URL updates.
    const needle = query.trim().toLowerCase();
    const all = initialPage?.items ?? [];
    if (!needle) return all;
    return all.filter(
      (entry) =>
        entry.title.toLowerCase().includes(needle) ||
        entry.content.toLowerCase().includes(needle) ||
        entry.answer.toLowerCase().includes(needle),
    );
  }, [isClientSearch, data, initialPage, query]);

  const submitSearch = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      navigate({
        search: (previous) => ({ ...previous, q: query.trim() || undefined }),
        replace: true,
      });
      setQuery(query.trim());
    },
    [navigate, query],
  );

  const clearSearch = useCallback(() => {
    setQuery("");
    navigate({ search: (previous) => ({ ...previous, q: undefined }), replace: true });
    inputRef.current?.focus();
  }, [navigate]);

  const total = data?.total ?? initialPage?.total ?? 0;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            collectionPageJsonLd(
              "Answered Bible and faith questions",
              "A searchable archive of questions answered by Christian counselors and published anonymously.",
              "/archive",
            ),
          ),
        }}
      />

      <section className="gl-hero-sm relative overflow-hidden">
        <div className="gl-aurora" aria-hidden="true" />
        <div className="gl-grain" aria-hidden="true" />
        <div className="relative mx-auto w-full max-w-5xl px-5 py-16 sm:px-8 sm:py-20">
          <Reveal>
            <p className="text-[0.78rem] font-semibold uppercase tracking-[0.16em] text-gold">
              The archive
            </p>
            <h1 className="mt-4 text-[clamp(2.2rem,5.4vw,3.4rem)] font-semibold leading-[1.06] tracking-[-0.025em] text-[oklch(0.97_0.01_88)]">
              Questions already answered
            </h1>
            <p className="mt-5 max-w-2xl text-[1.05rem] leading-relaxed text-[oklch(0.82_0.016_88)]">
              {total > 0
                ? `${formatCount(total)} answer${total === 1 ? "" : "s"} published by our counselors, each rewritten so the person who asked stays anonymous.`
                : "Every answer here was written by hand and published with the asker's identity removed."}
            </p>
          </Reveal>

          <Reveal delay={140}>
            <form onSubmit={submitSearch} role="search" className="mt-9 max-w-2xl">
              <label htmlFor="archive-search" className="sr-only">
                Search answered questions
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search
                    size={17}
                    aria-hidden="true"
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[oklch(0.7_0.016_88)]"
                  />
                  <input
                    id="archive-search"
                    ref={inputRef}
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Try “doubt”, “forgiveness”, “grief”…"
                    maxLength={120}
                    autoComplete="off"
                    className="w-full rounded-xl border border-current/15 bg-[oklch(0.22_0.016_240)]/60 py-3.5 pl-11 pr-10 text-[0.98rem] text-[oklch(0.95_0.012_88)] outline-none transition-colors placeholder:text-[oklch(0.62_0.016_88)] focus:border-gold"
                  />
                  {query ? (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      aria-label="Clear the search box"
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-[oklch(0.7_0.016_88)] transition-colors hover:text-[oklch(0.95_0.012_88)]"
                    >
                      <X size={15} aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
                <button
                  type="submit"
                  disabled={isFetching}
                  className="gl-btn bg-gold px-6 font-semibold text-[oklch(0.22_0.05_70)] disabled:opacity-60"
                >
                  Search
                </button>
              </div>
            </form>
          </Reveal>

          {categories.length > 0 ? (
            <Reveal delay={220}>
              <div className="mt-7 flex flex-wrap items-center gap-2">
                <SlidersHorizontal size={14} aria-hidden="true" className="text-[oklch(0.7_0.016_88)]" />
                <span className="sr-only">Filter by topic</span>
                {categories
                  .filter((category) => (category.count ?? 0) > 0)
                  .map((category) => (
                    <Link
                      key={category.slug}
                      to="/archive/category/$slug"
                      params={{ slug: category.slug }}
                      className="rounded-full border border-current/15 px-3.5 py-1.5 text-[0.85rem] font-medium text-[oklch(0.86_0.014_88)] transition-colors no-underline hover:border-gold hover:text-gold"
                    >
                      {category.name}
                      <span className="ml-1.5 text-[0.75rem] text-[oklch(0.66_0.016_88)]">
                        {formatCount(category.count ?? 0)}
                      </span>
                    </Link>
                  ))}
              </div>
            </Reveal>
          ) : null}
        </div>
      </section>

      <section className="px-5 py-14 sm:px-8 sm:py-16">
        <div className="mx-auto w-full max-w-5xl">
          {activeQuery ? (
            <p aria-live="polite" className="mb-6 text-[0.95rem] text-muted-foreground">
              {items.length} result{items.length === 1 ? "" : "s"} for{" "}
              <strong className="font-semibold text-foreground">“{activeQuery}”</strong>
              <button
                type="button"
                onClick={clearSearch}
                className="gl-link ml-3 text-[0.9rem] font-semibold text-gold-deep"
              >
                Clear
              </button>
            </p>
          ) : null}

          {items.length === 0 ? (
            activeQuery ? (
              <NoResultsState query={activeQuery} onClear={clearSearch} />
            ) : (
              <EmptyState
                title="No answers published yet"
                description="The archive fills as counselors publish answers. Ask a question and yours could be the first."
                action={
                  <Link to="/ask" className="gl-btn bg-primary px-5 py-2.5 font-semibold text-primary-foreground">
                    Ask a question
                  </Link>
                }
              />
            )
          ) : (
            <div className={cn("grid gap-5", items.length > 1 && "lg:grid-cols-2")}>
              {items.map((entry, index) => (
                <Reveal key={entry.slug} delay={Math.min(index, 6) * 60}>
                  <AnswerCard entry={entry} />
                </Reveal>
              ))}
            </div>
          )}

          {isClientSearch && query.trim() ? (
            <p className="mt-6 text-center text-[0.88rem] text-muted-foreground" aria-live="polite">
              Press Search to search the full archive.
            </p>
          ) : null}
        </div>
      </section>
    </>
  );
}
