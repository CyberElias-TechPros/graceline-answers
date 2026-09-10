import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Heart, HeartHandshake, Loader2, Plus } from "lucide-react";
import { apiFetch, apiFetchOrNull, RequestError } from "../../lib/api";
import type { PrayerEntry } from "../../lib/api";
import { buildLinks, buildMeta, jsonLd } from "../../lib/seo";
import { Reveal } from "../../components/reveal";
import { CrisisBanner } from "../../components/crisis-banner";
import { FieldError, LoadingState } from "../../components/states";
import { formatCount, formatRelative } from "../../lib/format";
import { LIMITS, detectCrisis } from "../../../shared/site";
import { usePointerCard } from "../../hooks/use-pointer-card";
import { cn } from "../../lib/utils";

/**
 * The prayer wall.
 *
 * The list is server-rendered so the page has real content before JavaScript
 * arrives. Praying for someone and adding a request are progressive
 * enhancements: both work through the same API the server used, so there is one
 * contract rather than two.
 */

const prayerSchema = z.object({
  title: z
    .string()
    .trim()
    .min(LIMITS.prayerTitle.min, "Please add a short title.")
    .max(LIMITS.prayerTitle.max, "Please keep the title under 200 characters."),
  content: z
    .string()
    .trim()
    .min(LIMITS.prayerBody.min, "Please add a sentence or two.")
    .max(LIMITS.prayerBody.max, "Please keep this under 4,000 characters."),
});

type PrayerForm = z.infer<typeof prayerSchema>;

export const Route = createFileRoute("/_public/prayer")({
  head: () => {
    const seo = buildMeta({
      title: "Prayer Wall — Ask for Prayer, Pray for Others",
      description:
        "Share a prayer request anonymously and pray for the burdens others have carried here. A community prayer wall where every request is read and counted.",
      path: "/prayer",
    });
    return { meta: seo.meta, links: buildLinks({ path: "/prayer" }) };
  },
  loader: async () => {
    const page = await apiFetchOrNull<{ items: PrayerEntry[]; total: number }>("/prayer?limit=24");
    return { items: page?.items ?? [], total: page?.total ?? 0 };
  },
  component: PrayerPage,
});

function PrayerPage() {
  const initial = Route.useLoaderData();
  const [items, setItems] = useState<PrayerEntry[]>(initial.items);
  const [composing, setComposing] = useState(false);
  // Ids this visitor has already prayed for, so the button can show it was
  // counted. Local to the device — the server does not track who prayed.
  const [prayed, setPrayed] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setPrayed(new Set(JSON.parse(window.localStorage.getItem("graceline.prayed") ?? "[]") as number[]));
    } catch {
      // No stored history; every request starts unprayed.
    }
  }, []);

  const pray = async (entry: PrayerEntry) => {
    if (prayed.has(entry.id)) return;
    // Optimistic: the count is the point of the interaction, and making someone
    // wait for a round trip before seeing it land drains the gesture.
    setItems((current) =>
      current.map((item) =>
        item.id === entry.id ? { ...item, prayedCount: item.prayedCount + 1 } : item,
      ),
    );
    setPrayed((current) => new Set(current).add(entry.id));
    persistPrayed(entry.id);

    try {
      await apiFetch(`/prayer/${entry.id}/pray`, { method: "POST" });
    } catch (error) {
      setItems((current) =>
        current.map((item) =>
          item.id === entry.id ? { ...item, prayedCount: Math.max(0, item.prayedCount - 1) } : item,
        ),
      );
      setPrayed((current) => {
        const next = new Set(current);
        next.delete(entry.id);
        return next;
      });
      toast.error(
        error instanceof RequestError && error.status === 429
          ? "You have prayed for quite a few requests just now. Please come back in a little while."
          : "That did not register. Please try again.",
      );
    }
  };

  const totalPrayers = items.reduce((sum, item) => sum + item.prayedCount, 0);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: "Prayer wall",
            description:
              "A community prayer wall where visitors share requests anonymously and pray for one another.",
          }),
        }}
      />

      <section className="gl-hero-sm relative overflow-hidden">
        <div className="gl-aurora" aria-hidden="true" />
        <div className="gl-grain" aria-hidden="true" />
        <div className="relative mx-auto w-full max-w-4xl px-5 py-16 sm:px-8 sm:py-20">
          <Reveal>
            <h1 className="text-[clamp(2.1rem,5vw,3.2rem)] font-semibold leading-[1.08] tracking-[-0.025em] text-[oklch(0.97_0.01_88)]">
              Bear one another&apos;s burdens
            </h1>
            <p className="mt-5 max-w-2xl text-[1.05rem] leading-relaxed text-[oklch(0.82_0.016_88)]">
              Every request here was written by someone who asked not to carry it alone. Read one,
              pray it, and let them know it was held.
            </p>
          </Reveal>

          <Reveal delay={140}>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setComposing(true);
                  document.getElementById("prayer-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
                className="gl-btn bg-gold px-6 py-3 font-semibold text-[oklch(0.22_0.05_70)]"
              >
                <Plus size={16} aria-hidden="true" />
                Share a request
              </button>
              {totalPrayers > 0 ? (
                <p className="text-[0.92rem] text-[oklch(0.76_0.016_88)]">
                  <span className="font-semibold text-gold">{formatCount(totalPrayers)}</span> prayers
                  offered on this page
                </p>
              ) : null}
            </div>
          </Reveal>
        </div>
      </section>

      <div className="mx-auto w-full max-w-4xl px-5 py-14 sm:px-8 sm:py-16">
        {composing ? (
          <PrayerForm
            onDone={(entry) => {
              setItems((current) => [entry, ...current]);
              setComposing(false);
              toast.success("Your request is on the wall", {
                description: "Thank you for trusting the community with it.",
              });
            }}
            onCancel={() => setComposing(false)}
          />
        ) : null}

        {items.length === 0 ? (
          <div className="gl-card px-6 py-16 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent text-muted-foreground">
              <HeartHandshake size={22} aria-hidden="true" />
            </span>
            <h2 className="mt-5 text-[1.35rem] font-semibold text-foreground">
              The wall is quiet right now
            </h2>
            <p className="mx-auto mt-2 max-w-md text-[0.97rem] leading-relaxed text-muted-foreground">
              Be the first to leave a request, or the first to pray for one that arrives.
            </p>
            <button
              type="button"
              onClick={() => setComposing(true)}
              className="gl-btn mt-6 bg-primary px-5 py-2.5 font-semibold text-primary-foreground"
            >
              Share a request
            </button>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {items.map((entry, index) => (
              <Reveal as="li" key={entry.id} delay={Math.min(index, 8) * 55}>
                <PrayerCard entry={entry} prayed={prayed.has(entry.id)} onPray={() => void pray(entry)} />
              </Reveal>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function PrayerCard({
  entry,
  prayed,
  onPray,
}: {
  entry: PrayerEntry;
  prayed: boolean;
  onPray: () => void;
}) {
  const { ref, onPointerMove } = usePointerCard<HTMLDivElement>();

  return (
    <div ref={ref} onPointerMove={onPointerMove} data-interactive className="gl-card h-full p-6">
      <h2 className="text-[1.15rem] font-semibold leading-snug text-foreground">{entry.title}</h2>
      <p className="mt-2.5 whitespace-pre-wrap text-[0.95rem] leading-relaxed text-muted-foreground">
        {entry.content}
      </p>
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4">
        <time dateTime={new Date(entry.createdAt).toISOString()} className="text-[0.8rem] text-muted-foreground">
          {formatRelative(entry.createdAt)}
        </time>
        <button
          type="button"
          onClick={onPray}
          aria-pressed={prayed}
          className={cn(
            "gl-btn px-4 py-2 text-[0.87rem] font-semibold",
            prayed
              ? "border border-verdigris/40 bg-verdigris/12 text-verdigris"
              : "border border-border hover:border-gold hover:text-gold-deep",
          )}
        >
          <Heart size={14} aria-hidden="true" className={prayed ? "fill-current" : undefined} />
          {prayed ? "Prayed" : "I prayed"}
          <span className="tabular-nums">{formatCount(entry.prayedCount)}</span>
        </button>
      </div>
    </div>
  );
}

function PrayerForm({ onDone, onCancel }: { onDone: (entry: PrayerEntry) => void; onCancel: () => void }) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<PrayerForm>({
    resolver: zodResolver(prayerSchema),
    defaultValues: { title: "", content: "" },
  });

  const [crisis, setCrisis] = useState(false);
  const title = watch("title") ?? "";
  const content = watch("content") ?? "";

  useEffect(() => {
    const handle = window.setTimeout(() => setCrisis(detectCrisis(`${title}\n${content}`).isCrisis), 250);
    return () => window.clearTimeout(handle);
  }, [title, content]);

  const submit = async (values: PrayerForm) => {
    try {
      const created = await apiFetch<PrayerEntry>("/prayer", {
        method: "POST",
        body: { title: values.title.trim(), content: values.content.trim() },
      });
      onDone(created);
    } catch (error) {
      toast.error(
        error instanceof RequestError && error.status === 429
          ? "You have shared several requests recently. Please wait a little while."
          : "We could not add that request. Please try again.",
      );
    }
  };

  return (
    <form
      id="prayer-form"
      onSubmit={handleSubmit(submit)}
      noValidate
      className="gl-card mb-10 space-y-6 p-6 sm:p-8"
    >
      <div>
        <h2 className="text-[1.4rem] font-semibold tracking-[-0.02em] text-foreground">
          What can we pray for?
        </h2>
        <p className="mt-1.5 text-[0.94rem] text-muted-foreground">
          Requests are anonymous and appear on the wall immediately.
        </p>
      </div>

      {crisis ? <CrisisBanner compact /> : null}

      <div>
        <label htmlFor="prayer-title" className="block text-[0.93rem] font-semibold text-foreground">
          Title
        </label>
        <input
          id="prayer-title"
          type="text"
          maxLength={LIMITS.prayerTitle.max}
          placeholder="For example: “Prayer for my mother's surgery”"
          aria-invalid={errors.title ? "true" : undefined}
          aria-describedby={errors.title ? "prayer-title-error" : undefined}
          {...register("title")}
          className={cn(
            "mt-2 w-full rounded-xl border bg-background px-4 py-3 text-[0.98rem] text-foreground outline-none transition-colors placeholder:text-muted-foreground/70",
            errors.title ? "border-destructive" : "border-border focus:border-gold",
          )}
        />
        <FieldError id="prayer-title-error">{errors.title?.message}</FieldError>
      </div>

      <div>
        <label htmlFor="prayer-content" className="block text-[0.93rem] font-semibold text-foreground">
          Your request
        </label>
        <textarea
          id="prayer-content"
          rows={5}
          maxLength={LIMITS.prayerBody.max}
          placeholder="As much or as little as you want to share."
          aria-invalid={errors.content ? "true" : undefined}
          aria-describedby={errors.content ? "prayer-content-error" : undefined}
          {...register("content")}
          className={cn(
            "mt-2 w-full resize-y rounded-xl border bg-background px-4 py-3 text-[0.98rem] leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground/70",
            errors.content ? "border-destructive" : "border-border focus:border-gold",
          )}
        />
        <FieldError id="prayer-content-error">{errors.content?.message}</FieldError>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="gl-btn bg-primary px-6 py-3 font-semibold text-primary-foreground disabled:opacity-60"
        >
          {isSubmitting ? (
            <>
              <Loader2 size={16} aria-hidden="true" className="animate-spin" />
              Adding…
            </>
          ) : (
            "Add to the wall"
          )}
        </button>
        <button type="button" onClick={onCancel} className="gl-btn border border-border px-6 py-3 font-semibold">
          Cancel
        </button>
      </div>
    </form>
  );
}

function persistPrayed(id: number) {
  if (typeof window === "undefined") return;
  try {
    const stored = JSON.parse(window.localStorage.getItem("graceline.prayed") ?? "[]") as number[];
    if (!stored.includes(id)) {
      stored.push(id);
      window.localStorage.setItem("graceline.prayed", JSON.stringify(stored.slice(-500)));
    }
  } catch {
    // Best effort only.
  }
}
