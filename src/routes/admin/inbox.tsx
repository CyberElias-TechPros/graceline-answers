import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Flame, Mail, MessageSquare, Search, Timer } from "lucide-react";
import { apiFetch } from "../../lib/api";
import type { InboxItem } from "../../lib/api";
import { LoadingState } from "../../components/states";
import { formatCount, formatDateTime, formatDuration, formatRelative } from "../../lib/format";
import { usePointerCard } from "../../hooks/use-pointer-card";
import { cn } from "../../lib/utils";

/**
 * Inbox.
 *
 * Ordered urgent-first by the API, not by the client: the queue has to read the
 * same way for every counselor, and the ordering is a policy decision that
 * belongs next to the data. Filters are URL state so a filtered view is
 * shareable between the team and survives a refresh.
 */
export const Route = createFileRoute("/admin/inbox")({
  validateSearch: (search: Record<string, unknown>): { status?: string; urgent?: boolean; q?: string } => ({
    status: ["new", "active", "resolved"].includes(String(search.status)) ? String(search.status) : undefined,
    urgent: search.urgent === "true" || search.urgent === true,
    q: typeof search.q === "string" && search.q.trim() ? search.q.trim().slice(0, 120) : undefined,
  }),
  component: InboxPage,
});

const FILTERS = [
  { label: "All", value: "" },
  { label: "New", value: "new" },
  { label: "In progress", value: "active" },
  { label: "Resolved", value: "resolved" },
] as const;

function InboxPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const statsQuery = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: ({ signal }) =>
      apiFetch<{
        new: number;
        active: number;
        resolved: number;
        urgent: number;
        counselors: number;
        medianResponseMinutes: number | null;
        answeredCount: number;
      }>("/admin/stats", { signal }),
    refetchInterval: 60_000,
  });

  const inboxQuery = useQuery({
    queryKey: ["admin", "inbox", search.status ?? "", search.urgent, search.q ?? ""],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ limit: "60" });
      if (search.status) params.set("status", search.status);
      if (search.urgent) params.set("urgent", "true");
      if (search.q) params.set("q", search.q);
      return apiFetch<{ items: InboxItem[]; hasMore: boolean }>(`/admin/inbox?${params}`, { signal });
    },
    refetchInterval: 45_000,
  });

  const items = inboxQuery.data?.items ?? [];
  const stats = statsQuery.data;

  const setFilter = (patch: Partial<typeof search>) =>
    navigate({ search: (previous) => ({ ...previous, ...patch }), replace: true });

  return (
    <div className="mx-auto w-full max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="text-[1.9rem] font-semibold leading-tight tracking-[-0.02em] text-[oklch(0.97_0.01_88)]">
            Inbox
          </h1>
          <p className="mt-1.5 text-[0.93rem] text-[oklch(0.66_0.016_88)]">
            Urgent conversations are always at the top.
          </p>
        </div>

        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            const value = new FormData(event.currentTarget).get("q");
            setFilter({ q: typeof value === "string" && value.trim() ? value.trim() : undefined });
          }}
          className="relative w-full max-w-xs"
        >
          <label htmlFor="inbox-search" className="sr-only">
            Search conversations
          </label>
          <Search
            size={15}
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[oklch(0.55_0.016_88)]"
          />
          <input
            id="inbox-search"
            name="q"
            type="search"
            defaultValue={search.q ?? ""}
            placeholder="Search title or content"
            className="w-full rounded-xl border border-white/12 bg-[oklch(0.18_0.016_245)] py-2.5 pl-10 pr-3 text-[0.92rem] text-[oklch(0.94_0.012_88)] outline-none transition-colors placeholder:text-[oklch(0.5_0.016_88)] focus:border-gold"
          />
        </form>
      </header>

      {stats ? (
        <dl className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Awaiting first reply"
            value={stats.new}
            icon={MessageSquare}
            tone={stats.new > 0 ? "warn" : "neutral"}
          />
          <StatCard label="In progress" value={stats.active} icon={Timer} />
          <StatCard
            label="Flagged urgent"
            value={stats.urgent}
            icon={Flame}
            tone={stats.urgent > 0 ? "urgent" : "neutral"}
          />
          <StatCard
            label="Median first response"
            text={formatDuration(stats.medianResponseMinutes)}
            hint={`${formatCount(stats.answeredCount)} answered`}
            icon={Timer}
          />
        </dl>
      ) : null}

      <div className="mt-7 flex flex-wrap items-center gap-2">
        {FILTERS.map((filter) => {
          const active = (search.status ?? "") === filter.value;
          return (
            <button
              key={filter.label}
              type="button"
              onClick={() => setFilter({ status: filter.value || undefined })}
              className={cn(
                "rounded-full border px-4 py-1.5 text-[0.87rem] font-medium transition-colors",
                active
                  ? "border-gold bg-gold/14 text-gold"
                  : "border-white/12 text-[oklch(0.78_0.014_88)] hover:border-white/25",
              )}
              aria-pressed={active}
            >
              {filter.label}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setFilter({ urgent: !search.urgent })}
          className={cn(
            "rounded-full border px-4 py-1.5 text-[0.87rem] font-medium transition-colors",
            search.urgent
              ? "border-clay bg-clay/16 text-clay"
              : "border-white/12 text-[oklch(0.78_0.014_88)] hover:border-white/25",
          )}
          aria-pressed={search.urgent}
        >
          Urgent only
        </button>

        {search.q || search.status || search.urgent ? (
          <button
            type="button"
            onClick={() => navigate({ search: {}, replace: true })}
            className="gl-link ml-1 text-[0.85rem] font-semibold text-[oklch(0.72_0.016_88)] hover:text-gold"
          >
            Clear filters
          </button>
        ) : null}
      </div>

      <section className="mt-6" aria-live="polite">
        {inboxQuery.isLoading ? (
          <LoadingState label="Loading conversations" rows={4} />
        ) : inboxQuery.isError ? (
          <div className="gl-card border-clay/30 p-8 text-center">
            <p className="text-[1.05rem] font-semibold text-[oklch(0.94_0.012_88)]">
              The inbox did not load
            </p>
            <p className="mt-1.5 text-[0.93rem] text-[oklch(0.66_0.016_88)]">
              Your session may have expired, or the service is briefly unreachable.
            </p>
            <button
              type="button"
              onClick={() => void inboxQuery.refetch()}
              className="gl-btn mt-5 border border-white/15 px-5 py-2 text-[0.9rem] font-semibold"
            >
              Try again
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="gl-card p-12 text-center">
            <p className="text-[1.2rem] font-semibold text-[oklch(0.94_0.012_88)]">
              {search.q || search.status || search.urgent ? "Nothing matches those filters" : "The inbox is clear"}
            </p>
            <p className="mx-auto mt-2 max-w-md text-[0.94rem] leading-relaxed text-[oklch(0.66_0.016_88)]">
              {search.q || search.status || search.urgent
                ? "Try widening the filters — a new question may have arrived under a different status."
                : "Every conversation has been answered. New questions appear here automatically."}
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {items.map((item) => (
              <li key={item.id}>
                <InboxRow item={item} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function InboxRow({ item }: { item: InboxItem }) {
  const { ref, onPointerMove } = usePointerCard<HTMLAnchorElement>();

  return (
    <Link
      ref={ref}
      onPointerMove={onPointerMove}
      data-interactive
      to="/admin/questions/$id"
      params={{ id: String(item.id) }}
      className={cn(
        "gl-card block p-5 no-underline",
        item.isUrgent && "border-clay/40",
        item.unreadSince !== null && "border-l-2 border-l-gold",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {item.isUrgent ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-clay/16 px-2.5 py-0.5 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-clay">
                <AlertTriangle size={11} aria-hidden="true" />
                Urgent
              </span>
            ) : null}
            <StatusPill status={item.status} />
            {item.hasSeekerEmail ? (
              <span className="inline-flex items-center gap-1 text-[0.75rem] text-[oklch(0.6_0.016_88)]">
                <Mail size={11} aria-hidden="true" />
                Email on file
              </span>
            ) : null}
            {item.unreadSince !== null ? (
              <span className="text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-gold">
                New reply
              </span>
            ) : null}
          </div>

          <h2 className="mt-2.5 truncate text-[1.08rem] font-semibold text-[oklch(0.96_0.012_88)]">
            {item.title}
          </h2>

          <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.82rem] text-[oklch(0.62_0.016_88)]">
            <span>#{item.id}</span>
            {item.category ? <span>{item.category}</span> : null}
            <span>Asked {formatDateTime(item.createdAt)}</span>
            <span>{item.messageCount} message{item.messageCount === 1 ? "" : "s"}</span>
            {item.assigneeName ? <span>With {item.assigneeName}</span> : <span>Unassigned</span>}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="text-[0.82rem] text-[oklch(0.7_0.016_88)]">
            {formatRelative(item.updatedAt)}
          </span>
          <ArrowRight size={16} aria-hidden="true" className="text-[oklch(0.55_0.016_88)]" />
        </div>
      </div>
    </Link>
  );
}

function StatCard({
  label,
  value,
  text,
  hint,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value?: number;
  text?: string;
  hint?: string;
  icon: typeof Timer;
  tone?: "neutral" | "warn" | "urgent";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-[oklch(0.19_0.016_245)]/60 p-4",
        tone === "urgent" ? "border-clay/40" : tone === "warn" ? "border-gold/35" : "border-white/8",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <dt className="text-[0.76rem] font-semibold uppercase tracking-[0.1em] text-[oklch(0.6_0.016_88)]">
          {label}
        </dt>
        <Icon
          size={14}
          aria-hidden="true"
          className={tone === "urgent" ? "text-clay" : tone === "warn" ? "text-gold" : "text-[oklch(0.5_0.016_88)]"}
        />
      </div>
      <dd
        className={cn(
          "mt-2 text-[1.85rem] font-semibold leading-none tabular-nums",
          tone === "urgent" ? "text-clay" : tone === "warn" ? "text-gold" : "text-[oklch(0.96_0.012_88)]",
        )}
      >
        {text ?? formatCount(value ?? 0)}
      </dd>
      {hint ? <p className="mt-1.5 text-[0.78rem] text-[oklch(0.58_0.016_88)]">{hint}</p> : null}
    </div>
  );
}

export function StatusPill({ status }: { status: "new" | "active" | "resolved" }) {
  const styles: Record<string, string> = {
    new: "bg-gold/16 text-gold",
    active: "bg-verdigris/16 text-verdigris",
    resolved: "bg-white/8 text-[oklch(0.72_0.016_88)]",
  };
  const labels: Record<string, string> = { new: "New", active: "In progress", resolved: "Resolved" };

  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-0.5 text-[0.7rem] font-semibold uppercase tracking-[0.08em]",
        styles[status],
      )}
    >
      {labels[status] ?? status}
    </span>
  );
}
