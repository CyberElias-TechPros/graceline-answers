import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Heart, Lock } from "lucide-react";
import { apiFetch, RequestError } from "../../../lib/api";
import type { PublicArchiveEntry } from "../../../lib/api";
import {
  breadcrumbJsonLd,
  buildLinks,
  buildMeta,
  jsonLd,
  qaPageJsonLd,
} from "../../../lib/seo";
import { Reveal } from "../../../components/reveal";
import { AnswerCard } from "../../../components/answer-card";
import { formatDate } from "../../../lib/format";
import { categorySlug } from "../../../../shared/site";

/**
 * A single published answer.
 *
 * This is the page search engines are pointed at, so it is fully server
 * rendered with its own title, description, canonical, breadcrumb and QAPage
 * markup. A 404 from the API becomes a real notFound() so the router serves
 * the 404 page with the correct status instead of a soft error.
 */
type ArchiveEntryLoader = { entry: PublicArchiveEntry; related: PublicArchiveEntry[] };

export const Route = createFileRoute("/_public/archive/$slug")({
  head: ({ loaderData }) => {
    const data = loaderData as ArchiveEntryLoader | undefined;
    if (!data?.entry) {
      return { meta: [{ title: "Answer not found · GraceLine Answers" }, { name: "robots", content: "noindex" }] };
    }
    const { entry } = data;
    const seo = buildMeta({
      title: entry.title,
      description: entry.excerpt,
      path: `/archive/${entry.slug}`,
    });
    return {
      meta: [...seo.meta, { property: "og:type", content: "article" }],
      links: buildLinks({ path: `/archive/${entry.slug}` }),
    };
  },
  loader: async ({ params }): Promise<ArchiveEntryLoader> => {
    // Must be allowed to throw: a missing answer has to surface as a real 404 so
    // the router serves the not-found page with the right status, rather than
    // rendering an empty shell that claims to be an answer.
    //
    // The endpoint returns { entry, related } — one call supplies both the answer
    // and its onward links, so there is no second request to make.
    let payload: { entry: PublicArchiveEntry; related: PublicArchiveEntry[] };
    try {
      payload = await apiFetch(`/archive/${encodeURIComponent(params.slug)}`);
    } catch (error) {
      if (error instanceof RequestError && error.status === 404) throw notFound();
      throw error;
    }

    return {
      entry: payload.entry,
      related: (payload.related ?? []).filter((item) => item.slug !== payload.entry.slug).slice(0, 3),
    };
  },
  component: ArchiveEntryPage,
});

function ArchiveEntryPage() {
  const { entry, related } = Route.useLoaderData() as ArchiveEntryLoader;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(qaPageJsonLd(entry)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            breadcrumbJsonLd([
              { name: "Home", path: "/" },
              { name: "Archive", path: "/archive" },
              ...(entry.category
                ? [{ name: entry.category, path: `/archive/category/${categorySlug(entry.category)}` }]
                : []),
              { name: entry.title, path: `/archive/${entry.slug}` },
            ]),
          ),
        }}
      />

      <article className="gl-hero-sm relative overflow-hidden">
        <div className="gl-grain" aria-hidden="true" />
        <div className="relative mx-auto w-full max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
          <nav aria-label="Breadcrumb" className="text-[0.85rem]">
            <ol className="flex flex-wrap items-center gap-2 text-[oklch(0.7_0.016_88)]">
              <li>
                <Link to="/archive" className="gl-link hover:text-gold">
                  Archive
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              {entry.category ? (
                <>
                  <li>
                    <Link
                      to="/archive/category/$slug"
                      params={{ slug: categorySlug(entry.category) }}
                      className="gl-link hover:text-gold"
                    >
                      {entry.category}
                    </Link>
                  </li>
                  <li aria-hidden="true">/</li>
                </>
              ) : null}
              <li aria-current="page" className="truncate text-[oklch(0.86_0.014_88)]">
                {entry.title}
              </li>
            </ol>
          </nav>

          <Reveal>
            <h1 className="mt-7 text-[clamp(2rem,5vw,3.1rem)] font-semibold leading-[1.1] tracking-[-0.025em] text-[oklch(0.97_0.01_88)]">
              {entry.title}
            </h1>
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.87rem] text-[oklch(0.72_0.016_88)]">
              <time dateTime={new Date(entry.publishedAt).toISOString()}>
                Published {formatDate(entry.publishedAt)}
              </time>
              <span className="inline-flex items-center gap-1.5">
                <Lock size={13} aria-hidden="true" />
                Asked anonymously
              </span>
            </div>
          </Reveal>
        </div>
      </article>

      <div className="mx-auto w-full max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
        <Reveal>
          <section aria-labelledby="question-heading">
            <h2
              id="question-heading"
              className="text-[0.75rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
            >
              The question
            </h2>
            <div className="gl-prose mt-4 border-l-2 border-gold/50 pl-5">
              {entry.content.split(/\n{2,}/).map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </section>
        </Reveal>

        <Reveal delay={120}>
          <section aria-labelledby="answer-heading" className="mt-14">
            <h2
              id="answer-heading"
              className="text-[0.75rem] font-semibold uppercase tracking-[0.16em] text-gold-deep"
            >
              The answer
            </h2>
            <div className="gl-prose mt-5">
              {entry.answer.split(/\n{2,}/).map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </section>
        </Reveal>

        <Reveal delay={180}>
          <div className="mt-14 rounded-2xl border border-border bg-card p-6">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-gold-deep">
                <Heart size={16} aria-hidden="true" />
              </span>
              <div>
                <p className="text-[0.98rem] font-semibold text-foreground">
                  Does this speak to something you are carrying?
                </p>
                <p className="mt-1.5 text-[0.95rem] leading-relaxed text-muted-foreground">
                  Ask your own question anonymously. A counselor will read it and write back
                  personally — and nothing is published without a decision to publish.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link
                    to="/ask"
                    className="gl-btn bg-primary px-5 py-2.5 text-[0.93rem] font-semibold text-primary-foreground"
                  >
                    Ask anonymously
                    <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                  <Link to="/prayer" className="gl-btn border border-border px-5 py-2.5 text-[0.93rem] font-semibold">
                    Request prayer
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </Reveal>

        {related.length > 0 ? (
          <section aria-labelledby="related-heading" className="mt-16">
            <Reveal>
              <h2
                id="related-heading"
                className="text-[1.5rem] font-semibold leading-snug tracking-[-0.02em] text-foreground"
              >
                {entry.category ? `More on ${entry.category.toLowerCase()}` : "More answered questions"}
              </h2>
            </Reveal>
            <div className="mt-7 grid gap-5">
              {related.map((item, index) => (
                <Reveal key={item.slug} delay={index * 80}>
                  <AnswerCard entry={item} />
                </Reveal>
              ))}
            </div>
          </section>
        ) : null}

        <div className="mt-14">
          <Link to="/archive" className="gl-link inline-flex items-center gap-2 font-semibold text-gold-deep">
            <ArrowLeft size={16} aria-hidden="true" />
            Back to the archive
          </Link>
        </div>
      </div>
    </>
  );
}
