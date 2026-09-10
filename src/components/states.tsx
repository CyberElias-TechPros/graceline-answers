import type { ReactNode } from "react";
import { AlertTriangle, Inbox, RefreshCw, SearchX } from "lucide-react";
import { Button } from "./button";

/**
 * The four states every asynchronous view must handle.
 *
 * Centralised so no screen can quietly render a blank box: loading, empty,
 * error and success all look intentional and say what to do next.
 */

export function LoadingState({ label = "Loading…", rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="gl-card p-6 sm:p-7" aria-hidden="true">
          <div className="gl-skeleton h-3 w-24" />
          <div className="gl-skeleton mt-4 h-5 w-3/4" />
          <div className="gl-skeleton mt-3 h-3.5 w-full" />
          <div className="gl-skeleton mt-2 h-3.5 w-5/6" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="gl-card flex flex-col items-center px-6 py-14 text-center sm:px-10">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-muted-foreground">
        {icon ?? <Inbox size={22} aria-hidden="true" />}
      </span>
      <h3 className="mt-5 text-[1.35rem] font-semibold text-foreground">{title}</h3>
      <p className="mt-2 max-w-md text-[0.97rem] leading-relaxed text-muted-foreground">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "We could not load that",
  description,
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="gl-card flex flex-col items-center border-clay/30 px-6 py-14 text-center sm:px-10"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-clay/12 text-clay">
        <AlertTriangle size={22} aria-hidden="true" />
      </span>
      <h3 className="mt-5 text-[1.35rem] font-semibold text-foreground">{title}</h3>
      <p className="mt-2 max-w-md text-[0.97rem] leading-relaxed text-muted-foreground">
        {description ?? "Something interrupted the request. Your connection may have dropped."}
      </p>
      {onRetry ? (
        <Button variant="outline" className="mt-6" onClick={onRetry}>
          <RefreshCw size={15} aria-hidden="true" />
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function NoResultsState({ query, onClear }: { query: string; onClear?: () => void }) {
  return (
    <EmptyState
      icon={<SearchX size={22} aria-hidden="true" />}
      title={`Nothing published for “${query}” yet`}
      description="Try a broader word, or ask the question yourself — a counselor will answer it privately, and it may be shared here later."
      action={
        onClear ? (
          <Button variant="outline" onClick={onClear}>
            Clear the search
          </Button>
        ) : undefined
      }
    />
  );
}

/** Inline form error, wired to its field with aria-describedby by the caller. */
export function FieldError({ id, children }: { id: string; children: ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-[0.85rem] font-medium text-destructive">
      {children}
    </p>
  );
}
