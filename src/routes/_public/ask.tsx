import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowRight, Check, EyeOff, Loader2, Mail, ShieldCheck } from "lucide-react";
import { apiFetch, RequestError } from "../../lib/api";
import { buildLinks, buildMeta, jsonLd } from "../../lib/seo";
import { Reveal } from "../../components/reveal";
import { CrisisBanner } from "../../components/crisis-banner";
import { FieldError } from "../../components/states";
import { CATEGORIES, LIMITS, detectCrisis } from "../../../shared/site";
import { cn } from "../../lib/utils";

/**
 * Ask a question.
 *
 * The most consequential form on the site: the person filling it in is often
 * frightened, so it is short, states what happens to their words before they
 * type, and never makes an email address a condition of being heard.
 *
 * Crisis detection runs in the browser as the person types, so the support
 * resources appear while they are still writing rather than after a round trip.
 */

const formSchema = z.object({
  title: z
    .string()
    .trim()
    .min(LIMITS.questionTitle.min, "Please add a short title of at least 3 characters.")
    .max(LIMITS.questionTitle.max, "Please keep the title under 200 characters."),
  content: z
    .string()
    .trim()
    .min(LIMITS.questionBody.min, "A sentence or two more would help us answer properly.")
    .max(LIMITS.questionBody.max, "Please keep your question under 8,000 characters."),
  category: z.string().optional(),
  email: z
    .string()
    .trim()
    .max(LIMITS.email.max)
    .optional()
    .refine((value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), {
      message: "That email address does not look right.",
    }),
});

type FormValues = z.infer<typeof formSchema>;

export const Route = createFileRoute("/_public/ask")({
  validateSearch: (search: Record<string, unknown>): { category?: string } => ({
    category:
      typeof search.category === "string" && (CATEGORIES as readonly string[]).includes(search.category)
        ? search.category
        : undefined,
  }),
  head: () => {
    const seo = buildMeta({
      title: "Ask a Bible Question Anonymously",
      description:
        "Ask any Bible, faith or life question without giving your name. No account, no email required, no IP address stored. A trained Christian counselor answers personally.",
      path: "/ask",
    });
    return { meta: seo.meta, links: buildLinks({ path: "/ask" }) };
  },
  component: AskPage,
});

function AskPage() {
  const navigate = useNavigate();
  const initialCategory = Route.useSearch().category;

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { title: "", content: "", category: initialCategory ?? "", email: "" },
  });

  const content = watch("content") ?? "";
  const title = watch("title") ?? "";
  const email = watch("email") ?? "";

  // Live crisis detection. Cheap, local, and it means the help lines are on
  // screen while the person is still deciding what to write.
  const [crisis, setCrisis] = useState(false);
  useEffect(() => {
    const handle = window.setTimeout(() => setCrisis(detectCrisis(`${title}\n${content}`).isCrisis), 250);
    return () => window.clearTimeout(handle);
  }, [title, content]);

  const onSubmit = async (values: FormValues) => {
    try {
      const result = await apiFetch<{ id: number; trackingToken: string; threadUrl: string }>(
        "/questions",
        {
          method: "POST",
          body: {
            title: values.title.trim(),
            content: values.content.trim(),
            category: values.category || null,
            email: values.email?.trim() || null,
          },
        },
      );

      // The token is the only way back into this thread, so it is kept in
      // storage on the person's own device and nowhere else.
      rememberThread(result.trackingToken, values.title.trim());
      toast.success("Your question has been received", {
        description: "A counselor will read it and reply on your private thread.",
      });
      navigate({ to: "/t/$token", params: { token: result.trackingToken } });
    } catch (error) {
      const message =
        error instanceof RequestError
          ? error.status === 429
            ? "That is a lot of questions in a short time. Please wait a little while and try again."
            : error.message
          : "We could not send your question. Please check your connection and try again.";
      toast.error(message);
    }
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: "Ask a Bible question anonymously",
            description:
              "Submit a Bible, faith or life question anonymously and receive a personal answer from a Christian counselor.",
          }),
        }}
      />

      <section className="gl-hero-sm relative overflow-hidden">
        <div className="gl-grain" aria-hidden="true" />
        <div className="relative mx-auto w-full max-w-3xl px-5 py-14 sm:px-8 sm:py-16">
          <Reveal>
            <h1 className="text-[clamp(2.1rem,5vw,3.1rem)] font-semibold leading-[1.08] tracking-[-0.025em] text-[oklch(0.97_0.01_88)]">
              Ask without giving your name
            </h1>
            <p className="mt-5 max-w-2xl text-[1.03rem] leading-relaxed text-[oklch(0.82_0.016_88)]">
              Write the rough version. You do not need to phrase this well, and you do not need to
              be sure it is a good question.
            </p>
          </Reveal>

          <Reveal delay={140}>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[0.9rem] text-[oklch(0.78_0.016_88)]">
              <li className="inline-flex items-center gap-2">
                <EyeOff size={15} aria-hidden="true" className="text-gold" />
                No name, no account
              </li>
              <li className="inline-flex items-center gap-2">
                <ShieldCheck size={15} aria-hidden="true" className="text-gold" />
                No IP address stored
              </li>
              <li className="inline-flex items-center gap-2">
                <Check size={15} aria-hidden="true" className="text-gold" />
                A real person replies
              </li>
            </ul>
          </Reveal>
        </div>
      </section>

      <div className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
        {crisis ? (
          <div className="mb-8">
            <CrisisBanner />
            <p className="mt-3 text-[0.93rem] leading-relaxed text-muted-foreground">
              You can still send this question and a counselor will read it — but if you are in
              danger right now, please contact one of these services first.
            </p>
          </div>
        ) : null}

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-7">
          <div>
            <label htmlFor="title" className="block text-[0.95rem] font-semibold text-foreground">
              Your question, in one line
            </label>
            <input
              id="title"
              type="text"
              maxLength={LIMITS.questionTitle.max}
              autoComplete="off"
              placeholder="For example: “Why does God feel silent when I pray?”"
              aria-invalid={errors.title ? "true" : undefined}
              aria-describedby={errors.title ? "title-error" : undefined}
              {...register("title")}
              className={cn(
                "mt-2 w-full rounded-xl border bg-card px-4 py-3.5 text-[1rem] text-foreground outline-none transition-colors placeholder:text-muted-foreground/70",
                errors.title ? "border-destructive focus:border-destructive" : "border-border focus:border-gold",
              )}
            />
            <FieldError id="title-error">{errors.title?.message}</FieldError>
          </div>

          <div>
            <div className="flex items-baseline justify-between gap-4">
              <label htmlFor="content" className="block text-[0.95rem] font-semibold text-foreground">
                Tell us what is behind it
              </label>
              <span
                aria-hidden="true"
                className={cn(
                  "text-[0.8rem] tabular-nums",
                  content.length > LIMITS.questionBody.max * 0.9 ? "text-clay" : "text-muted-foreground",
                )}
              >
                {content.length} / {LIMITS.questionBody.max}
              </span>
            </div>
            <textarea
              id="content"
              rows={9}
              maxLength={LIMITS.questionBody.max}
              placeholder="There is no wrong way to start. What happened, what you have tried, what you are afraid of — whatever is true for you."
              aria-invalid={errors.content ? "true" : undefined}
              aria-describedby={errors.content ? "content-error" : "content-hint"}
              {...register("content")}
              className={cn(
                "mt-2 w-full resize-y rounded-xl border bg-card px-4 py-3.5 text-[1rem] leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground/70",
                errors.content ? "border-destructive focus:border-destructive" : "border-border focus:border-gold",
              )}
            />
            <FieldError id="content-error">{errors.content?.message}</FieldError>
            {!errors.content ? (
              <p id="content-hint" className="mt-1.5 text-[0.85rem] text-muted-foreground">
                Only you and your counselor will ever read this exactly as written.
              </p>
            ) : null}
          </div>

          <fieldset>
            <legend className="text-[0.95rem] font-semibold text-foreground">
              What is this about? <span className="font-normal text-muted-foreground">(optional)</span>
            </legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {CATEGORIES.map((category) => {
                const selected = watch("category") === category;
                return (
                  <label
                    key={category}
                    className={cn(
                      "cursor-pointer rounded-full border px-4 py-2 text-[0.88rem] font-medium transition-all",
                      selected
                        ? "border-gold bg-gold/12 text-gold-deep"
                        : "border-border bg-card text-muted-foreground hover:border-gold/50",
                    )}
                  >
                    <input
                      type="radio"
                      value={category}
                      className="sr-only"
                      {...register("category")}
                    />
                    {category}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div>
            <label htmlFor="email" className="flex items-center gap-2 text-[0.95rem] font-semibold text-foreground">
              <Mail size={15} aria-hidden="true" className="text-muted-foreground" />
              Email for the reply{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              maxLength={LIMITS.email.max}
              placeholder="Leave blank to keep this fully anonymous"
              aria-invalid={errors.email ? "true" : undefined}
              aria-describedby={errors.email ? "email-error" : "email-hint"}
              {...register("email")}
              className={cn(
                "mt-2 w-full rounded-xl border bg-card px-4 py-3.5 text-[1rem] text-foreground outline-none transition-colors placeholder:text-muted-foreground/70",
                errors.email ? "border-destructive focus:border-destructive" : "border-border focus:border-gold",
              )}
            />
            <FieldError id="email-error">{errors.email?.message}</FieldError>
            {!errors.email ? (
              <p id="email-hint" className="mt-1.5 text-[0.85rem] text-muted-foreground">
                Without an address you can still read the reply on the private link we give you at
                the end.
              </p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-border bg-accent/50 p-5">
            <p className="text-[0.93rem] leading-relaxed text-muted-foreground">
              <strong className="font-semibold text-foreground">What happens next.</strong> A
              counselor reads your question and replies on a private thread only you can open.
              Nothing is published automatically. If an answer would help others, a counselor may
              later publish a rewritten version with your wording and identity removed.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <button
              type="submit"
              disabled={isSubmitting}
              className="gl-btn bg-primary px-7 py-3.5 text-base font-semibold text-primary-foreground shadow-[var(--shadow-lift)] disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={17} aria-hidden="true" className="animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  Send my question
                  <ArrowRight size={17} aria-hidden="true" />
                </>
              )}
            </button>
            <p className="text-[0.85rem] text-muted-foreground">
              You will get a private link. Save it — it is the only way back.
            </p>
          </div>
        </form>

        <div className="mt-16">
          <h2 className="text-[1.35rem] font-semibold tracking-[-0.02em] text-foreground">
            Rather read than ask?
          </h2>
          <p className="mt-2 text-[0.97rem] leading-relaxed text-muted-foreground">
            Someone has probably asked something close to this already.
          </p>
          <button
            type="button"
            onClick={() => navigate({ to: "/archive" })}
            className="gl-btn mt-5 border border-border px-5 py-2.5 font-semibold"
          >
            Browse the archive
          </button>
        </div>
      </div>
    </>
  );
}

/**
 * Remember a thread on this device only.
 *
 * Stored under one key so a returning seeker sees every thread they started
 * from this browser, and cleared by the thread page's "forget" action.
 */
export function rememberThread(token: string, title: string) {
  if (typeof window === "undefined") return;
  try {
    const existing = JSON.parse(window.localStorage.getItem("graceline.threads") ?? "{}") as Record<
      string,
      { title: string; savedAt: number }
    >;
    existing[token] = { title: title.slice(0, 120) || "Untitled question", savedAt: Date.now() };
    window.localStorage.setItem("graceline.threads", JSON.stringify(existing));
  } catch {
    // Storage can be unavailable (private mode, quota). The token is also in the
    // URL, so losing it here is a convenience loss, not a data loss.
  }
}
