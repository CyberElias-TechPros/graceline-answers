import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Database, EyeOff, Lock, ScrollText } from "lucide-react";
import { breadcrumbJsonLd, buildLinks, buildMeta, jsonLd } from "../../lib/seo";
import { Reveal } from "../../components/reveal";

/**
 * Privacy.
 *
 * Written as a factual description of the system rather than as boilerplate.
 * Each claim below corresponds to something enforced in code: the database has
 * no IP, user-agent or fingerprint columns; the session cookie is HttpOnly and
 * scoped to /api; public reads are filtered to is_public = 1; and privileged
 * actions are written to an audit log that stores no addresses.
 */
export const Route = createFileRoute("/_public/privacy")({
  head: () => {
    const seo = buildMeta({
      title: "Privacy Promise — What We Store and What We Never Do",
      description:
        "Exactly what GraceLine Answers stores about you: no IP addresses, no device fingerprints, no accounts. What we keep, how long, who can read it, and how to have it removed.",
      path: "/privacy",
    });
    return { meta: seo.meta, links: buildLinks({ path: "/privacy" }) };
  },
  component: PrivacyPage,
});

const NEVER = [
  "IP addresses",
  "Browser or device fingerprints",
  "User-agent strings",
  "Location data",
  "Third-party advertising or analytics identifiers",
];

const KEEP = [
  {
    what: "Your question and the reply thread",
    detail:
      "Kept so you can return to the conversation. Reachable only through its private link, which is not guessable and is never indexed.",
  },
  {
    what: "An email address, if you choose to give one",
    detail:
      "Used only to notify you about your own thread. Optional — leaving it blank means we hold nothing that identifies you at all.",
  },
  {
    what: "Prayer requests you post",
    detail:
      "Anonymous by design, with a count of how many people prayed. No author information is stored.",
  },
  {
    what: "An internal log of counselor actions",
    detail:
      "Who published, edited or replied, and when. It records no seeker addresses and is used only for accountability inside the team.",
  },
];

function PrivacyPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            breadcrumbJsonLd([
              { name: "Home", path: "/" },
              { name: "Privacy", path: "/privacy" },
            ]),
          ),
        }}
      />

      <section className="gl-hero-sm relative overflow-hidden">
        <div className="gl-grain" aria-hidden="true" />
        <div className="relative mx-auto w-full max-w-3xl px-5 py-16 sm:px-8 sm:py-20">
          <Reveal>
            <h1 className="text-[clamp(2.2rem,5vw,3.2rem)] font-semibold leading-[1.06] tracking-[-0.025em] text-[oklch(0.97_0.01_88)]">
              What we keep, in plain words
            </h1>
            <p className="mt-6 max-w-2xl text-[1.05rem] leading-relaxed text-[oklch(0.82_0.016_88)]">
              If you are going to write down something you have not said to anyone, you deserve to
              know exactly what happens to it.
            </p>
          </Reveal>
        </div>
      </section>

      <div className="mx-auto w-full max-w-3xl px-5 py-16 sm:px-8 sm:py-20">
        <Reveal>
          <section aria-labelledby="never" className="rounded-2xl border border-verdigris/30 bg-verdigris/8 p-7">
            <h2 id="never" className="flex items-center gap-2.5 text-[1.4rem] font-semibold text-foreground">
              <EyeOff size={19} aria-hidden="true" className="text-verdigris" />
              We never collect these
            </h2>
            <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
              {NEVER.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2.5 text-[0.96rem] leading-relaxed text-foreground"
                >
                  <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-verdigris" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-5 text-[0.9rem] leading-relaxed text-muted-foreground">
              This is a design decision, not a policy promise. The database has no column for any
              of it, so there is nothing to leak and nothing to request.
            </p>
          </section>
        </Reveal>

        <section aria-labelledby="keep" className="mt-14">
          <Reveal>
            <h2 id="keep" className="flex items-center gap-2.5 text-[1.9rem] font-semibold tracking-[-0.02em] text-foreground">
              <Database size={20} aria-hidden="true" className="text-gold-deep" />
              What we do keep
            </h2>
          </Reveal>

          <div className="mt-8 divide-y divide-border border-y border-border">
            {KEEP.map((item, index) => (
              <Reveal as="div" key={item.what} delay={index * 60}>
                <h3 className="pt-6 text-[1.1rem] font-semibold leading-snug text-foreground">
                  {item.what}
                </h3>
                <p className="pb-7 pt-2 text-[0.96rem] leading-relaxed text-muted-foreground">
                  {item.detail}
                </p>
              </Reveal>
            ))}
          </div>
        </section>

        <section aria-labelledby="who-reads" className="mt-14">
          <Reveal>
            <h2 id="who-reads" className="flex items-center gap-2.5 text-[1.9rem] font-semibold tracking-[-0.02em] text-foreground">
              <Lock size={20} aria-hidden="true" className="text-gold-deep" />
              Who can read it
            </h2>
          </Reveal>
          <Reveal delay={80}>
            <div className="gl-prose mt-5">
              <p>
                Your private thread is visible to you and to the counseling team. Nothing from a
                private thread appears on the public site unless a counselor deliberately publishes
                it — and publishing always uses a rewritten question and answer, so your original
                wording is never shown.
              </p>
              <p>
                Counselor accounts are issued individually and can be revoked at any time. Every
                privileged action inside the console is logged so that no change to a
                seeker&apos;s question happens without a record.
              </p>
            </div>
          </Reveal>
        </section>

        <section aria-labelledby="removal" className="mt-14">
          <Reveal>
            <h2 id="removal" className="flex items-center gap-2.5 text-[1.9rem] font-semibold tracking-[-0.02em] text-foreground">
              <ScrollText size={20} aria-hidden="true" className="text-gold-deep" />
              Removing your question
            </h2>
          </Reveal>
          <Reveal delay={80}>
            <div className="gl-prose mt-5">
              <p>
                Say so on your thread and a counselor will remove it. If it has already been
                published to the archive, tell us and the published answer will be withdrawn too —
                withdrawal removes it from search and from the archive immediately.
              </p>
              <p>
                If you have forgotten your link, write to us and describe the question. We cannot
                match it to an address, because we do not hold one, but we can search for it.
              </p>
            </div>
          </Reveal>
        </section>

        <Reveal>
          <div className="mt-14 rounded-2xl border border-border bg-accent/60 p-7">
            <h2 className="text-[1.3rem] font-semibold text-foreground">One more thing</h2>
            <p className="mt-2.5 text-[0.97rem] leading-relaxed text-muted-foreground">
              This site is a ministry, not a clinical service. It cannot provide emergency care or
              diagnosis. If you are in immediate danger, please contact your local emergency
              number or a crisis line first.
            </p>
            <Link to="/ask" className="gl-btn mt-6 bg-primary px-6 py-3 font-semibold text-primary-foreground">
              Ask a question
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </Reveal>

        <p className="mt-10 text-[0.85rem] text-muted-foreground">
          Last reviewed when the system was rebuilt on Cloudflare Workers, D1 and Vercel. Changes
          to what is stored will be reflected here before they take effect.
        </p>
      </div>
    </>
  );
}
