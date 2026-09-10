import { createFileRoute, Link } from "@tanstack/react-router";
import type { CSSProperties } from "react";
import { ArrowRight, BookOpen, Heart, MessageCircleQuestion, ShieldCheck, Sparkles } from "lucide-react";
import { apiFetch, apiFetchOrNull } from "../../lib/api";
import type { ArchivePage, CategoryEntry } from "../../lib/api";
import { buildLinks, buildMeta, collectionPageJsonLd, faqJsonLd, jsonLd } from "../../lib/seo";
import { AnswerCard } from "../../components/answer-card";
import { Reveal } from "../../components/reveal";
import { formatCount } from "../../lib/format";
import { SITE_NAME, SITE_TAGLINE } from "../../../shared/site";
import { CountUp } from "../../components/count-up";

/**
 * Homepage.
 *
 * Renders entirely on the server: the hero copy, the latest answers and the
 * category list are all in the first HTML response, so the page is indexable
 * and readable before a single byte of JavaScript arrives.
 */
export const Route = createFileRoute("/_public/")({
  head: () => {
    const seo = buildMeta({
      title: "Anonymous Bible Questions, Answered by Real Counselors",
      description:
        "Ask a Bible or faith question anonymously and a trained Christian counselor answers it personally. Browse hundreds of answered questions on anxiety, doubt, grief, marriage and more.",
      path: "/",
    });
    return {
      meta: seo.meta,
      links: buildLinks({ path: "/" }),
    };
  },
  loader: async () => {
    // Both calls are best-effort: a cold or unreachable API must never take the
    // homepage down. The page degrades to its own copy and a retry-able section.
    const [latest, categories] = await Promise.all([
      apiFetchOrNull<ArchivePage>("/archive?limit=3"),
      apiFetchOrNull<{ categories: CategoryEntry[] }>("/seo/category-index"),
    ]);
    return {
      latest: latest?.items ?? [],
      total: latest?.total ?? 0,
      categories: categories?.categories ?? [],
    };
  },
  component: HomePage,
});

const STEPS = [
  {
    icon: MessageCircleQuestion,
    title: "Ask without giving your name",
    body: "No account, no email required, no IP stored. Write what you are actually carrying — the rough version is welcome.",
  },
  {
    icon: BookOpen,
    title: "A counselor reads it personally",
    body: "Not a bot and not a form letter. Someone trained in Scripture and in listening reads your question and writes back.",
  },
  {
    icon: ShieldCheck,
    title: "You decide what becomes public",
    body: "Your conversation stays private. If an answer would help others, a counselor may publish an anonymised version — never your words, never your name.",
  },
];

const FAQ = [
  {
    question: "Is GraceLine Answers really anonymous?",
    answer:
      "Yes. You are not asked for a name and we do not store your IP address or device information. If you want the answer emailed to you, you can optionally add an address; it is kept only on your private thread.",
  },
  {
    question: "Is this a substitute for counseling or therapy?",
    answer:
      "No. GraceLine offers faith-centered guidance and biblical perspective. It is not therapy and cannot diagnose or treat mental health conditions. If you are in crisis, please contact emergency services or a crisis line first.",
  },
  {
    question: "How long does an answer take?",
    answer:
      "Most questions are answered within a few days. Questions flagged as urgent are handled first, and you will always receive a real reply rather than an automated response.",
  },
  {
    question: "What happens to my question afterwards?",
    answer:
      "It stays private unless a counselor publishes an anonymised version to the public archive. Publishing always rewrites the question and the answer, so your original wording is never shared.",
  },
];

function HomePage() {
  const { latest, total, categories } = Route.useLoaderData();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            faqJsonLd(
              FAQ.map((entry) => ({ question: entry.question, answer: entry.answer })),
            ),
          ),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(collectionPageJsonLd("Answered questions", "Public archive of answered Bible and faith questions.", "/archive")),
        }}
      />

      {/* ---------------------------------------------------------------- Hero */}
      <section className="gl-hero relative overflow-hidden">
        <div className="gl-aurora" aria-hidden="true" />
        <div className="gl-beam" aria-hidden="true" />
        <div className="gl-grain" aria-hidden="true" />

        <div className="relative mx-auto w-full max-w-6xl px-5 pb-24 pt-16 sm:px-8 sm:pb-32 sm:pt-24">
          <div className="grid items-center gap-14 lg:grid-cols-[1.15fr_0.85fr]">
            <div>
              <Reveal>
                <p className="inline-flex items-center gap-2 rounded-full border border-current/12 px-3.5 py-1.5 text-[0.78rem] font-semibold uppercase tracking-[0.16em] text-[oklch(0.86_0.016_88)]">
                  <Sparkles size={13} aria-hidden="true" />
                  {SITE_TAGLINE}
                </p>
              </Reveal>

              <h1 className="mt-7 text-[clamp(2.6rem,7.2vw,4.6rem)] font-semibold leading-[1.02] tracking-[-0.025em] text-[oklch(0.97_0.01_88)]">
                <span className="gl-line-rise" style={{ "--rise-delay": "40ms" } as CSSProperties}>
                  <span>Ask the question</span>
                </span>
                <span className="gl-line-rise mt-1" style={{ "--rise-delay": "150ms" } as CSSProperties}>
                  <span>you were afraid</span>
                </span>
                <span className="gl-line-rise mt-1" style={{ "--rise-delay": "260ms" } as CSSProperties}>
                  <span>to ask out loud.</span>
                </span>
              </h1>

              <Reveal delay={260}>
                <p className="mt-7 max-w-xl text-[1.08rem] leading-relaxed text-[oklch(0.82_0.016_88)]">
                  {SITE_NAME} is a ministry of anonymous Bible Q&amp;A and faith-centered
                  counseling. Every question is read by a real person, and every answer is
                  written by hand — with Scripture, and without judgment.
                </p>
              </Reveal>

              <Reveal delay={380}>
                <div className="mt-9 flex flex-wrap gap-3">
                  <Link
                    to="/ask"
                    className="gl-btn bg-gold px-7 py-3.5 text-base font-semibold text-[oklch(0.22_0.05_70)] shadow-[var(--shadow-lift)]"
                  >
                    Ask anonymously
                    <ArrowRight size={17} aria-hidden="true" />
                  </Link>
                  <Link
                    to="/archive"
                    className="gl-btn border border-current/18 px-7 py-3.5 text-base font-semibold text-[oklch(0.94_0.012_88)] hover:border-gold"
                  >
                    Read answered questions
                  </Link>
                </div>
              </Reveal>

              <Reveal delay={480}>
                <dl className="mt-12 flex flex-wrap gap-x-12 gap-y-6">
                  <Stat label="Answers published" value={total} suffix={total ? "" : " and growing"} />
                  <Stat label="Names required" value={0} literal="None" />
                  <Stat label="IP addresses stored" value={0} literal="Zero" />
                </dl>
              </Reveal>
            </div>

            <Reveal delay={300} className="hidden lg:block">
              <HeroCard />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- How it works */}
      <section className="relative bg-background px-5 py-24 sm:px-8 sm:py-28">
        <div className="mx-auto w-full max-w-6xl">
          <Reveal>
            <h2 className="max-w-2xl text-[clamp(1.8rem,3.6vw,2.6rem)] font-semibold leading-[1.15] tracking-[-0.02em] text-foreground">
              Three steps, and none of them ask you to perform
            </h2>
          </Reveal>

          <ol className="mt-14 grid gap-6 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <Reveal as="li" key={step.title} delay={index * 110} variant="line">
                <article className="gl-card h-full p-7">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-gold-deep">
                    <step.icon size={22} aria-hidden="true" />
                  </span>
                  <span className="mt-6 block font-sans text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Step {index + 1}
                  </span>
                  <h3 className="mt-2 text-[1.3rem] font-semibold leading-snug text-foreground">
                    {step.title}
                  </h3>
                  <p className="mt-3 text-[0.97rem] leading-relaxed text-muted-foreground">{step.body}</p>
                </article>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* -------------------------------------------------- Latest answers */}
      <section className="relative bg-accent/50 px-5 py-24 sm:px-8 sm:py-28">
        <div className="mx-auto w-full max-w-6xl">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <Reveal>
              <h2 className="text-[clamp(1.8rem,3.6vw,2.6rem)] font-semibold leading-[1.15] tracking-[-0.02em] text-foreground">
                Recently answered
              </h2>
              <p className="mt-3 max-w-lg text-[1rem] leading-relaxed text-muted-foreground">
                Real questions, published with the asker&apos;s wording replaced and their identity
                removed.
              </p>
            </Reveal>
            <Link to="/archive" className="gl-link font-semibold text-gold-deep">
              Browse the full archive
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>

          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {latest.length > 0 ? (
              latest.map((entry, index) => (
                <Reveal key={entry.slug} delay={index * 90}>
                  <AnswerCard entry={entry} />
                </Reveal>
              ))
            ) : (
              <div className="gl-card col-span-full p-10 text-center">
                <p className="text-[1.05rem] font-medium text-foreground">
                  The archive is being prepared
                </p>
                <p className="mx-auto mt-2 max-w-md text-[0.96rem] leading-relaxed text-muted-foreground">
                  Answers appear here once a counselor publishes them. You can still ask a question
                  now — it will be read.
                </p>
                <Link to="/ask" className="gl-btn mt-6 bg-primary px-5 py-2.5 font-semibold text-primary-foreground">
                  Ask a question
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ Categories */}
      {categories.length > 0 ? (
        <section className="px-5 py-24 sm:px-8 sm:py-28">
          <div className="mx-auto w-full max-w-6xl">
            <Reveal>
              <h2 className="text-[clamp(1.8rem,3.6vw,2.6rem)] font-semibold leading-[1.15] tracking-[-0.02em] text-foreground">
                Find your question by topic
              </h2>
            </Reveal>

            <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {categories.map((category, index) => (
                <Reveal key={category.slug} delay={(index % 4) * 70}>
                  <Link
                    to="/archive/category/$slug"
                    params={{ slug: category.slug }}
                    className="gl-card group flex items-center justify-between gap-4 p-5 no-underline"
                  >
                    <span>
                      <span className="block text-[1.02rem] font-semibold text-foreground transition-colors group-hover:text-gold-deep">
                        {category.name}
                      </span>
                      <span className="mt-0.5 block text-[0.83rem] text-muted-foreground">
                        {category.count === 0
                          ? "Be the first to ask"
                          : `${formatCount(category.count ?? 0)} answer${category.count === 1 ? "" : "s"}`}
                      </span>
                    </span>
                    <ArrowRight
                      size={16}
                      aria-hidden="true"
                      className="shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-1 group-hover:text-gold-deep"
                    />
                  </Link>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* ----------------------------------------------------- Prayer wall */}
      <section className="px-5 pb-24 sm:px-8 sm:pb-28">
        <div className="mx-auto w-full max-w-6xl">
          <Reveal>
            <div className="gl-card relative overflow-hidden p-8 sm:p-12">
              <div className="gl-aurora opacity-60" aria-hidden="true" />
              <div className="relative grid gap-8 lg:grid-cols-[1.4fr_0.6fr] lg:items-center">
                <div>
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-gold-deep">
                    <Heart size={20} aria-hidden="true" />
                  </span>
                  <h2 className="mt-5 text-[clamp(1.6rem,3vw,2.2rem)] font-semibold leading-[1.15] tracking-[-0.02em] text-foreground">
                    Carry someone else&apos;s burden for a moment
                  </h2>
                  <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-muted-foreground">
                    The prayer wall holds requests from people who asked not to be alone in them.
                    Read one, pray it, and let them know.
                  </p>
                </div>
                <div className="lg:justify-self-end">
                  <Link to="/prayer" className="gl-btn bg-primary px-6 py-3 font-semibold text-primary-foreground">
                    Visit the prayer wall
                    <ArrowRight size={17} aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* --------------------------------------------------------------- FAQ */}
      <section className="bg-accent/50 px-5 py-24 sm:px-8 sm:py-28">
        <div className="mx-auto w-full max-w-3xl">
          <Reveal>
            <h2 className="text-[clamp(1.8rem,3.6vw,2.4rem)] font-semibold leading-[1.15] tracking-[-0.02em] text-foreground">
              Before you ask
            </h2>
          </Reveal>

          <dl className="mt-10 divide-y divide-border border-y border-border">
            {FAQ.map((item, index) => (
              <Reveal as="div" key={item.question} delay={index * 70}>
                <dt className="pt-6 text-[1.12rem] font-semibold leading-snug text-foreground">
                  {item.question}
                </dt>
                <dd className="pb-7 pt-2.5 text-[0.99rem] leading-relaxed text-muted-foreground">
                  {item.answer}
                </dd>
              </Reveal>
            ))}
          </dl>

          <Reveal>
            <p className="mt-10 rounded-2xl border border-clay/30 bg-clay/8 p-5 text-[0.95rem] leading-relaxed text-foreground">
              <strong className="font-semibold">In a crisis?</strong> If you are thinking about
              harming yourself or someone else, please contact your local emergency number or a
              crisis line first. This ministry cannot provide emergency care.
            </p>
          </Reveal>
        </div>
      </section>
    </>
  );
}

function Stat({
  label,
  value,
  literal,
  suffix,
}: {
  label: string;
  value: number;
  literal?: string;
  suffix?: string;
}) {
  return (
    <div>
      <dd className="font-display text-[2.4rem] font-semibold leading-none tracking-[-0.02em] text-gold">
        {literal ?? (
          <>
            <CountUp to={value} />
            {suffix ? <span className="ml-1.5 text-[1rem] font-normal text-[oklch(0.78_0.016_88)]">{suffix}</span> : null}
          </>
        )}
      </dd>
      <dt className="mt-2 text-[0.82rem] uppercase tracking-[0.12em] text-[oklch(0.7_0.016_88)]">{label}</dt>
    </div>
  );
}

/**
 * Hero illustration: a question becoming an answer.
 *
 * Built from HTML and CSS rather than an image so it inherits the theme, costs
 * no network request, and never blocks the largest contentful paint.
 */
function HeroCard() {
  return (
    <div className="relative">
      <div className="gl-card border-white/8 bg-[oklch(0.2_0.016_240)]/70 p-6 backdrop-blur-md">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[oklch(0.66_0.016_88)]">
          Anonymous question
        </p>
        <p className="mt-3 font-display text-[1.35rem] font-semibold leading-snug text-[oklch(0.96_0.012_88)]">
          “I have prayed about this for a year and nothing has changed. Does God even hear me?”
        </p>
        <div className="gl-rule my-5" />
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold">
          Counselor&apos;s reply
        </p>
        <p className="mt-3 text-[0.97rem] leading-relaxed text-[oklch(0.84_0.014_88)]">
          He hears you. And the waiting is not evidence of absence — Elijah prayed for rain seven
          times before the cloud the size of a fist appeared…
        </p>
        <div className="mt-6 flex items-center gap-2 text-[0.8rem] text-[oklch(0.66_0.016_88)]">
          <ShieldCheck size={14} aria-hidden="true" />
          Published anonymously, with the asker&apos;s permission
        </div>
      </div>
      <div
        className="absolute -bottom-4 -right-4 -z-10 h-full w-full rounded-2xl border border-white/6"
        aria-hidden="true"
      />
    </div>
  );
}
