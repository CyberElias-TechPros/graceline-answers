import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BookOpenCheck, EyeOff, HeartHandshake, ShieldCheck, Users } from "lucide-react";
import { buildLinks, buildMeta, breadcrumbJsonLd, faqJsonLd, jsonLd } from "../../lib/seo";
import { Reveal } from "../../components/reveal";
import { THERAPY_DISCLAIMER } from "../../../shared/site";

/**
 * About.
 *
 * The trust page. Everything asserted here is a property of the system that was
 * built, not a marketing claim: the schema stores no IP or device columns, the
 * archive is only ever written by a counselor, and publishing rewrites the
 * seeker's words.
 */
export const Route = createFileRoute("/_public/about")({
  head: () => {
    const seo = buildMeta({
      title: "About GraceLine Answers — How Anonymous Christian Counseling Works",
      description:
        "How GraceLine Answers works: anonymous questions, hand-written answers from trained Christian counselors, and a privacy model that stores no IP addresses and never publishes without a decision.",
      path: "/about",
    });
    return { meta: seo.meta, links: buildLinks({ path: "/about" }) };
  },
  component: AboutPage,
});

const PRINCIPLES = [
  {
    icon: EyeOff,
    title: "Anonymity is the default, not an option",
    body: "You are never asked for a name and we do not record IP addresses, device fingerprints or browser details. If you add an email, it stays attached to your private thread and nothing else.",
  },
  {
    icon: BookOpenCheck,
    title: "Answers are written by people",
    body: "There is no auto-reply and no generated response. A counselor reads your question in full and writes back, drawing on Scripture and on the practice of listening well.",
  },
  {
    icon: ShieldCheck,
    title: "Nothing is published by accident",
    body: "Your thread stays private. Publishing to the archive is a separate, deliberate act by a counselor, and it always uses a rewritten question and answer — your original wording is never shared.",
  },
  {
    icon: HeartHandshake,
    title: "We are not a substitute for care",
    body: THERAPY_DISCLAIMER,
  },
];

const FAQ = [
  {
    question: "Who reads my question?",
    answer:
      "A counselor on the GraceLine team. Accounts are limited to people vetted by the ministry, and every privileged action they take is recorded in an internal log.",
  },
  {
    question: "Can I delete my question?",
    answer:
      "Your private thread is not indexed and cannot be found without its link. If you would like it removed entirely, say so on the thread and a counselor will action it.",
  },
  {
    question: "Do you charge for answers?",
    answer: "No. GraceLine Answers is a ministry and every answer is free.",
  },
  {
    question: "What if my question is about a crisis?",
    answer:
      "Crisis language is detected as you write and the relevant support lines appear immediately. Those questions are also flagged as urgent for the counseling team, but this service is not an emergency service and cannot intervene.",
  },
];

function AboutPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            breadcrumbJsonLd([
              { name: "Home", path: "/" },
              { name: "About", path: "/about" },
            ]),
          ),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(faqJsonLd(FAQ)) }}
      />

      <section className="gl-hero-sm relative overflow-hidden">
        <div className="gl-aurora" aria-hidden="true" />
        <div className="gl-grain" aria-hidden="true" />
        <div className="relative mx-auto w-full max-w-3xl px-5 py-16 sm:px-8 sm:py-24">
          <Reveal>
            <h1 className="text-[clamp(2.2rem,5vw,3.4rem)] font-semibold leading-[1.06] tracking-[-0.025em] text-[oklch(0.97_0.01_88)]">
              A safe place to ask the hard question
            </h1>
            <p className="mt-6 max-w-2xl text-[1.08rem] leading-relaxed text-[oklch(0.82_0.016_88)]">
              GraceLine Answers exists because the questions that matter most are often the ones
              people are least willing to say out loud — in church, in a small group, or to a
              friend who means well.
            </p>
          </Reveal>
        </div>
      </section>

      <div className="mx-auto w-full max-w-3xl px-5 py-16 sm:px-8 sm:py-20">
        <Reveal>
          <div className="gl-prose">
            <p>
              We started with a simple observation: someone carrying doubt, grief or a marriage in
              trouble will usually search before they speak. So we built a place where the
              searching ends in a real answer from a real person, and where asking costs nothing —
              not a name, not an account, not the fear of being recognised.
            </p>
            <p>
              Every question goes to a counselor. Every answer is written by hand. And every
              answer that reaches the public archive has been rewritten first, so that helping one
              person never exposes another.
            </p>
          </div>
        </Reveal>

        <section aria-labelledby="principles" className="mt-16">
          <Reveal>
            <h2 id="principles" className="text-[1.9rem] font-semibold tracking-[-0.02em] text-foreground">
              What we hold to
            </h2>
          </Reveal>

          <div className="mt-9 space-y-5">
            {PRINCIPLES.map((principle, index) => (
              <Reveal key={principle.title} delay={index * 80}>
                <article className="gl-card flex gap-5 p-6">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-gold-deep">
                    <principle.icon size={20} aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="text-[1.15rem] font-semibold leading-snug text-foreground">
                      {principle.title}
                    </h3>
                    <p className="mt-2 text-[0.96rem] leading-relaxed text-muted-foreground">
                      {principle.body}
                    </p>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        <section aria-labelledby="who" className="mt-16">
          <Reveal>
            <h2 id="who" className="text-[1.9rem] font-semibold tracking-[-0.02em] text-foreground">
              Who answers
            </h2>
            <div className="gl-prose mt-5">
              <p>
                A small team of counselors, each with their own pastoral background and training,
                sharing the queue. Counselor accounts are issued individually, can be revoked at
                any time, and every action taken inside the console is logged so that nothing
                happens to a seeker&apos;s question without a record of it.
              </p>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <div className="mt-7 flex items-start gap-4 rounded-2xl border border-border bg-accent/50 p-5">
              <Users size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-gold-deep" />
              <p className="text-[0.95rem] leading-relaxed text-muted-foreground">
                If you would like to serve on the counseling team, or if you have a question about
                how GraceLine operates, write to us through the{" "}
                <Link to="/ask" className="gl-link font-semibold text-gold-deep">
                  ask page
                </Link>{" "}
                and mark it as such.
              </p>
            </div>
          </Reveal>
        </section>

        <section aria-labelledby="faq" className="mt-16">
          <Reveal>
            <h2 id="faq" className="text-[1.9rem] font-semibold tracking-[-0.02em] text-foreground">
              Common questions
            </h2>
          </Reveal>
          <dl className="mt-8 divide-y divide-border border-y border-border">
            {FAQ.map((item, index) => (
              <Reveal as="div" key={item.question} delay={index * 60}>
                <dt className="pt-6 text-[1.1rem] font-semibold leading-snug text-foreground">
                  {item.question}
                </dt>
                <dd className="pb-7 pt-2.5 text-[0.97rem] leading-relaxed text-muted-foreground">
                  {item.answer}
                </dd>
              </Reveal>
            ))}
          </dl>
        </section>

        <Reveal>
          <div className="mt-14 rounded-2xl border border-gold/30 bg-gold/8 p-7 text-center">
            <h2 className="text-[1.5rem] font-semibold tracking-[-0.02em] text-foreground">
              Whatever it is, it can be asked here
            </h2>
            <p className="mx-auto mt-2.5 max-w-lg text-[0.97rem] leading-relaxed text-muted-foreground">
              You do not need to word it well. You do not need to be certain it is a good question.
            </p>
            <Link
              to="/ask"
              className="gl-btn mt-6 bg-primary px-6 py-3 font-semibold text-primary-foreground"
            >
              Ask a question
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </Reveal>
      </div>
    </>
  );
}
