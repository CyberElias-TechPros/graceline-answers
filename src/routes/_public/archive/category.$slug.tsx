import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowRight, Layers } from "lucide-react";
import { apiFetch, apiFetchOrNull } from "../../../lib/api";
import type { ArchivePage, CategoryEntry } from "../../../lib/api";
import { breadcrumbJsonLd, buildLinks, buildMeta, collectionPageJsonLd, jsonLd } from "../../../lib/seo";
import { Reveal } from "../../../components/reveal";
import { AnswerCard } from "../../../components/answer-card";
import { EmptyState } from "../../../components/states";
import { formatCount } from "../../../lib/format";
import { CATEGORIES, categoryFromSlug, categorySlug } from "../../../../shared/site";

/**
 * Category landing page.
 *
 * One URL per topic, each with its own title, description and canonical. These
 * exist because "christian counseling for anxiety" and "what the bible says
 * about grief" are different questions with different searchers behind them,
 * and a single archive page cannot serve both well.
 */
export const Route = createFileRoute("/_public/archive/category/$slug")({
  head: ({ params, loaderData }) => {
    const category = (loaderData as { category?: string } | undefined)?.category;
    if (!category) {
      return { meta: [{ title: "Topic not found · GraceLine Answers" }, { name: "robots", content: "noindex" }] };
    }
    const lower = category.toLowerCase();
    const seo = buildMeta({
      title: `${category} — Answered Bible & Faith Questions`,
      description: `Read answered questions about ${lower}, written by Christian counselors and published anonymously. Ask your own question about ${lower} at any time.`,
      path: `/archive/category/${params.slug}`,
    });
    return { meta: seo.meta, links: buildLinks({ path: `/archive/category/${params.slug}` }) };
  },
  loader: async ({ params }): Promise<{
    category: string;
    slug: string;
    items: ArchivePage["items"];
    total: number;
    siblings: CategoryEntry[];
  }> => {
    const category = categoryFromSlug(params.slug);
    // The list of topics is a closed set. An unknown slug is a 404, not an
    // empty page — serving thousands of blank category URLs would be exactly
    // the thin content the sitemap deliberately avoids.
    if (!category) throw notFound();

    const page = await apiFetchOrNull<ArchivePage>(
      `/archive?category=${encodeURIComponent(params.slug)}&limit=24`,
    );

    const index = await apiFetchOrNull<{ categories: CategoryEntry[] }>("/seo/category-index");

    return {
      category,
      slug: categorySlug(category),
      items: page?.items ?? [],
      total: page?.total ?? 0,
      siblings: (index?.categories ?? []).filter((c) => c.slug !== params.slug),
    };
  },
  component: CategoryPage,
});

function CategoryPage() {
  const { category, slug, items, total, siblings } = Route.useLoaderData() as {
    category: string;
    slug: string;
    items: ArchivePage["items"];
    total: number;
    siblings: CategoryEntry[];
  };
  const path = `/archive/category/${slug}`;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            collectionPageJsonLd(
              `${category} — answered questions`,
              `Answered Bible and faith questions about ${category.toLowerCase()}.`,
              path,
            ),
          ),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            breadcrumbJsonLd([
              { name: "Home", path: "/" },
              { name: "Archive", path: "/archive" },
              { name: category, path },
            ]),
          ),
        }}
      />

      <section className="gl-hero-sm relative overflow-hidden">
        <div className="gl-aurora" aria-hidden="true" />
        <div className="gl-grain" aria-hidden="true" />
        <div className="relative mx-auto w-full max-w-5xl px-5 py-16 sm:px-8 sm:py-20">
          <nav aria-label="Breadcrumb" className="text-[0.85rem] text-[oklch(0.7_0.016_88)]">
            <ol className="flex flex-wrap items-center gap-2">
              <li>
                <Link to="/archive" className="gl-link hover:text-gold">
                  Archive
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li aria-current="page" className="text-[oklch(0.86_0.014_88)]">
                {category}
              </li>
            </ol>
          </nav>

          <Reveal>
            <h1 className="mt-6 text-[clamp(2.1rem,5vw,3.2rem)] font-semibold leading-[1.08] tracking-[-0.025em] text-[oklch(0.97_0.01_88)]">
              {category}
            </h1>
            <p className="mt-5 max-w-2xl text-[1.03rem] leading-relaxed text-[oklch(0.82_0.016_88)]">
              {total > 0
                ? `${formatCount(total)} answered question${total === 1 ? "" : "s"} in this topic, each written by a counselor and published with the asker's identity removed.`
                : "No answers have been published in this topic yet. If it is what you are wrestling with, ask — and it may become the first."}
            </p>
          </Reveal>

          <Reveal delay={140}>
            <div className="mt-8">
              <Link
                to="/ask"
                search={{ category }}
                className="gl-btn bg-gold px-6 py-3 font-semibold text-[oklch(0.22_0.05_70)]"
              >
                Ask about {category.toLowerCase()}
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="px-5 py-14 sm:px-8 sm:py-16">
        <div className="mx-auto w-full max-w-5xl">
          {items.length > 0 ? (
            <div className="grid gap-5 lg:grid-cols-2">
              {items.map((entry, index) => (
                <Reveal key={entry.slug} delay={Math.min(index, 6) * 60}>
                  <AnswerCard entry={entry} />
                </Reveal>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Layers size={22} aria-hidden="true" />}
              title={`Nothing published under ${category} yet`}
              description="The archive grows as counselors publish. Ask your own question and a counselor will answer it privately, whatever is or is not here."
              action={
                <Link to="/ask" className="gl-btn bg-primary px-5 py-2.5 font-semibold text-primary-foreground">
                  Ask a question
                </Link>
              }
            />
          )}

          {siblings.length > 0 ? (
            <nav aria-label="Other topics" className="mt-16">
              <h2 className="text-[1.35rem] font-semibold tracking-[-0.02em] text-foreground">
                Explore another topic
              </h2>
              <ul className="mt-6 flex flex-wrap gap-2.5">
                {CATEGORIES.map((name) => {
                  if (name === category) return null;
                  const sibling = siblings.find((item) => item.name === name);
                  return (
                    <li key={name}>
                      <Link
                        to="/archive/category/$slug"
                        params={{ slug: categorySlug(name) }}
                        className="gl-card inline-flex items-center gap-2 px-4 py-2.5 text-[0.92rem] font-medium no-underline"
                      >
                        {name}
                        {sibling ? (
                          <span className="text-[0.8rem] text-muted-foreground">
                            {formatCount(sibling.count ?? 0)}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          ) : null}
        </div>
      </section>
    </>
  );
}
