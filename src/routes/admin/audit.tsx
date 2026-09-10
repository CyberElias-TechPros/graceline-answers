import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollText, ShieldAlert } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { LoadingState } from "../../components/states";
import { formatDateTime } from "../../lib/format";
import { cn } from "../../lib/utils";

/**
 * Audit log.
 *
 * The accountability surface: every privileged action, attributed, in order.
 * It records no seeker IP address or device data, because none is ever
 * collected — the log answers "who changed what", never "where did they come
 * from".
 */

type AuditEntry = {
  id: number;
  actorEmail: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  meta: string | null;
  createdAt: number;
};

const RESOURCE_FILTERS = [
  { label: "Everything", value: "" },
  { label: "Questions", value: "question" },
  { label: "Team", value: "user" },
  { label: "Prayers", value: "prayer" },
] as const;

export const Route = createFileRoute("/admin/audit")({
  validateSearch: (search: Record<string, unknown>): { resource_type?: string } => ({
    resource_type:
      typeof search.resource_type === "string" &&
      RESOURCE_FILTERS.some((filter) => filter.value === search.resource_type)
        ? search.resource_type
        : undefined,
  }),
  component: AuditPage,
});

function AuditPage() {
  const navigate = Route.useNavigate();
  const resourceType = Route.useSearch().resource_type ?? "";
  const [cursor, setCursor] = useState<number | null>(null);
  const [history, setHistory] = useState<AuditEntry[]>([]);

  const audit = useQuery({
    queryKey: ["admin", "audit", resourceType, cursor],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ limit: "50" });
      if (resourceType) params.set("resource_type", resourceType);
      if (cursor) params.set("cursor", String(cursor));
      return apiFetch<{ items: AuditEntry[]; nextCursor: number | null; hasMore: boolean }>(
        `/admin/audit?${params}`,
        { signal },
      );
    },
  });

  const items = cursor === null ? (audit.data?.items ?? []) : [...history, ...(audit.data?.items ?? [])];

  if (audit.isLoading && items.length === 0) return <LoadingState label="Loading the audit log" rows={4} />;

  if (audit.isError && items.length === 0) {
    return (
      <div className="gl-card mx-auto max-w-xl p-10 text-center">
        <ShieldAlert size={22} aria-hidden="true" className="mx-auto text-clay" />
        <p className="mt-4 text-[1.15rem] font-semibold text-[oklch(0.95_0.012_88)]">
          The audit log could not be loaded
        </p>
        <p className="mt-2 text-[0.93rem] text-[oklch(0.66_0.016_88)]">
          This view is limited to administrators.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <header>
        <h1 className="flex items-center gap-2.5 text-[1.9rem] font-semibold leading-tight tracking-[-0.02em] text-[oklch(0.97_0.01_88)]">
          <ScrollText size={22} aria-hidden="true" className="text-gold" />
          Audit log
        </h1>
        <p className="mt-2 max-w-2xl text-[0.93rem] leading-relaxed text-[oklch(0.66_0.016_88)]">
          Every privileged action, attributed. Seeker addresses are never recorded here because they
          are never collected anywhere.
        </p>
      </header>

      <div className="mt-6 flex flex-wrap gap-2">
        {RESOURCE_FILTERS.map((filter) => {
          const active = resourceType === filter.value;
          return (
            <button
              key={filter.label}
              type="button"
              onClick={() => {
                setCursor(null);
                setHistory([]);
                void navigate({ search: { resource_type: filter.value || undefined }, replace: true });
              }}
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
      </div>

      {items.length === 0 ? (
        <div className="gl-card mt-6 p-12 text-center">
          <p className="text-[1.15rem] font-semibold text-[oklch(0.94_0.012_88)]">No entries yet</p>
          <p className="mt-2 text-[0.93rem] text-[oklch(0.66_0.016_88)]">
            Actions appear here as counselors publish, reply and manage accounts.
          </p>
        </div>
      ) : (
        <ol className="mt-6 space-y-2">
          {items.map((entry) => (
            <li key={entry.id} className="gl-card flex flex-wrap items-start justify-between gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <code className="rounded-md bg-white/6 px-2 py-0.5 font-mono text-[0.8rem] text-gold">
                    {entry.action}
                  </code>
                  <span className="text-[0.82rem] text-[oklch(0.6_0.016_88)]">
                    {entry.resourceType}
                    {entry.resourceId ? ` #${entry.resourceId}` : ""}
                  </span>
                </p>
                {entry.meta ? (
                  <p className="mt-1.5 truncate font-mono text-[0.78rem] text-[oklch(0.55_0.016_88)]">
                    {entry.meta}
                  </p>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[0.85rem] font-medium text-[oklch(0.9_0.012_88)]">
                  {entry.actorEmail ?? "system"}
                </p>
                <time
                  dateTime={new Date(entry.createdAt).toISOString()}
                  className="text-[0.78rem] text-[oklch(0.58_0.016_88)]"
                >
                  {formatDateTime(entry.createdAt)}
                </time>
              </div>
            </li>
          ))}
        </ol>
      )}

      {audit.data?.hasMore ? (
        <div className="mt-6 text-center">
          <button
            type="button"
            disabled={audit.isFetching}
            onClick={() => {
              if (audit.data?.items.length) {
                setHistory((current) => (cursor === null ? audit.data.items : [...current, ...audit.data.items]));
              }
              setCursor(audit.data?.nextCursor ?? null);
            }}
            className="gl-btn border border-white/14 px-6 py-2.5 text-[0.9rem] font-semibold disabled:opacity-50"
          >
            {audit.isFetching ? "Loading…" : "Load older entries"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
