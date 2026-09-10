import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  KeyRound,
  Loader2,
  Lock,
  RefreshCw,
  Send,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch, RequestError } from "../../lib/api";
import type { SeekerThread, ThreadMessage } from "../../lib/api";
import { privateMeta } from "../../lib/seo";
import { CrisisBanner } from "../../components/crisis-banner";
import { ErrorState, LoadingState } from "../../components/states";
import { formatDateTime, formatRelative } from "../../lib/format";
import { LIMITS, THERAPY_DISCLAIMER } from "../../../shared/site";
import { cn } from "../../lib/utils";

/**
 * A seeker's private thread.
 *
 * Marked `noindex` and excluded from robots.txt: this page holds a real
 * person's unredacted question and must never reach a search index, even
 * though its URL is unguessable.
 *
 * Updates arrive over a long-poll held open by the Worker's ThreadRoom Durable
 * Object. The timeout is deliberately short — 8 seconds — because the request
 * passes through the Vercel proxy, whose serverless functions are capped at 10
 * seconds on the default plan. If streaming fails twice in a row the page
 * quietly falls back to plain polling, so a proxy that cannot hold a request
 * open degrades instead of breaking.
 */

const STREAM_TIMEOUT_MS = 8_000;
const FALLBACK_POLL_MS = 12_000;

export const Route = createFileRoute("/_public/t/$token")({
  head: () => {
    const seo = privateMeta("Your private conversation", "/t");
    return { meta: seo.meta };
  },
  component: ThreadPage,
});

function ThreadPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();

  const [thread, setThread] = useState<SeekerThread | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [failure, setFailure] = useState<string | undefined>();
  const [live, setLive] = useState(true);

  const watermark = useRef(0);
  const streamFailed = useRef(0);
  const cancelled = useRef(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const data = await apiFetch<SeekerThread>(`/threads/${encodeURIComponent(token)}`);
      if (cancelled.current) return;
      setThread(data);
      setMessages(data.messages);
      watermark.current = data.lastMessageId;
      setStatus("ready");
      setFailure(undefined);
    } catch (error) {
      if (cancelled.current) return;
      setStatus("error");
      setFailure(
        error instanceof RequestError && error.status === 404
          ? "We could not find that conversation. The link may be mistyped, or it may have been opened on another device."
          : "We could not load this conversation just now.",
      );
    }
  }, [token]);

  useEffect(() => {
    cancelled.current = false;
    void load();
    return () => {
      cancelled.current = true;
    };
  }, [load]);

  /** Long-poll loop. Falls back to timed polling if the proxy will not hold. */
  useEffect(() => {
    if (status !== "ready") return;
    cancelled.current = false;

    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      if (cancelled.current) return;
      try {
        const data = await apiFetch<{ messages: ThreadMessage[]; watermark: number }>(
          `/threads/${encodeURIComponent(token)}/stream?since=${watermark.current}&timeout=${STREAM_TIMEOUT_MS}`,
        );
        if (cancelled.current) return;
        streamFailed.current = 0;
        setLive(true);
        if (data.messages.length > 0) {
          setMessages((current) => {
            const known = new Set(current.map((message) => message.id));
            return [...current, ...data.messages.filter((message) => !known.has(message.id))];
          });
          watermark.current = Math.max(watermark.current, data.watermark);
        }
        // Reconnect immediately for the next wait.
        timer = setTimeout(() => void tick(), 200);
      } catch {
        if (cancelled.current) return;
        streamFailed.current += 1;
        // Two failures in a row means the environment will not hold a request
        // open. Switch to plain polling rather than hammering a dead path.
        if (streamFailed.current >= 2) {
          setLive(false);
          timer = setTimeout(() => void pollFallback(), FALLBACK_POLL_MS);
        } else {
          timer = setTimeout(() => void tick(), 1_500);
        }
      }
    };

    const pollFallback = async () => {
      if (cancelled.current) return;
      try {
        const data = await apiFetch<{ messages: ThreadMessage[]; watermark: number }>(
          `/threads/${encodeURIComponent(token)}/messages?since=${watermark.current}`,
        );
        if (cancelled.current) return;
        if (data.messages.length > 0) {
          setMessages((current) => {
            const known = new Set(current.map((message) => message.id));
            return [...current, ...data.messages.filter((message) => !known.has(message.id))];
          });
          watermark.current = Math.max(watermark.current, data.watermark);
        }
      } catch {
        // Polling failures are silent: the next tick retries.
      }
      timer = setTimeout(() => void pollFallback(), FALLBACK_POLL_MS);
    };

    void tick();
    return () => {
      cancelled.current = true;
      if (timer) clearTimeout(timer);
    };
  }, [status, token]);

  // Keep the newest message in view as the conversation grows.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages.length]);

  const forget = () => {
    if (typeof window === "undefined") return;
    try {
      const stored = JSON.parse(window.localStorage.getItem("graceline.threads") ?? "{}") as Record<
        string,
        unknown
      >;
      delete stored[token];
      window.localStorage.setItem("graceline.threads", JSON.stringify(stored));
    } catch {
      // Nothing to clean up.
    }
    toast.success("This link has been forgotten from this device", {
      description: "The conversation still exists — you will just need the link to reach it.",
    });
    navigate({ to: "/" });
  };

  if (status === "loading") {
    return (
      <div className="mx-auto w-full max-w-3xl px-5 py-16 sm:px-8">
        <LoadingState label="Opening your conversation" rows={2} />
      </div>
    );
  }

  if (status === "error" || !thread) {
    return (
      <div className="mx-auto w-full max-w-3xl px-5 py-16 sm:px-8">
        <ErrorState title="We could not open that thread" description={failure} onRetry={() => void load()} />
        <p className="mt-6 text-center text-[0.93rem] text-muted-foreground">
          Lost the link? <Link to="/ask" className="gl-link font-semibold text-gold-deep">Ask again</Link> and we
          will give you a new one.
        </p>
      </div>
    );
  }

  const hasReplies = messages.some((message) => message.sender === "counselor");

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="inline-flex items-center gap-2 text-[0.78rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <Lock size={13} aria-hidden="true" />
            Private thread
          </p>
          <h1 className="mt-3 text-[clamp(1.7rem,4vw,2.4rem)] font-semibold leading-[1.15] tracking-[-0.02em] text-foreground">
            {thread.question.title}
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.85rem] text-muted-foreground">
            <span>Asked {formatDateTime(thread.question.createdAt)}</span>
            <span className="inline-flex items-center gap-1.5">
              {live ? (
                <>
                  <Wifi size={13} aria-hidden="true" className="text-verdigris" />
                  Live
                </>
              ) : (
                <>
                  <WifiOff size={13} aria-hidden="true" />
                  Checking for replies
                </>
              )}
            </span>
          </p>
        </div>

        <button
          type="button"
          onClick={forget}
          className="gl-btn border border-border px-4 py-2 text-[0.85rem] font-medium text-muted-foreground hover:text-destructive"
        >
          <Trash2 size={14} aria-hidden="true" />
          Forget this link
        </button>
      </div>

      <div className="gl-rule my-8" />

      {thread.crisis.isCrisis ? <CrisisBanner className="mb-8" /> : null}

      {!hasReplies ? (
        <div className="mb-8 rounded-2xl border border-border bg-accent/50 p-5">
          <p className="text-[0.96rem] leading-relaxed text-muted-foreground">
            Your question is with the counseling team. Someone will read it and reply here —
            there is nothing else you need to do, and you do not need to keep this page open.
          </p>
        </div>
      ) : null}

      <ol className="space-y-4" aria-label="Conversation">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
      </ol>

      <div ref={bottomRef} />

      <ReplyBox
        token={token}
        onSent={(message) => {
          setMessages((current) =>
            current.some((item) => item.id === message.id) ? current : [...current, message],
          );
          watermark.current = Math.max(watermark.current, message.id);
        }}
      />

      <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
        <Link to="/" className="gl-link inline-flex items-center gap-2 text-[0.9rem] font-medium text-muted-foreground">
          <ArrowLeft size={15} aria-hidden="true" />
          Back to GraceLine
        </Link>
        <button
          type="button"
          onClick={() => void load()}
          className="gl-btn border border-border px-4 py-2 text-[0.85rem] font-medium text-muted-foreground"
        >
          <RefreshCw size={14} aria-hidden="true" />
          Refresh
        </button>
      </div>

      <p className="mt-8 rounded-xl bg-accent/60 p-4 text-[0.85rem] leading-relaxed text-muted-foreground">
        {thread.disclaimer || THERAPY_DISCLAIMER}
      </p>
    </div>
  );
}

function MessageBubble({ message }: { message: ThreadMessage }) {
  const isCounselor = message.sender === "counselor";

  return (
    <li
      className={cn("flex", isCounselor ? "justify-start" : "justify-end")}
      aria-label={isCounselor ? "Counselor's reply" : "Your message"}
    >
      <div
        className={cn(
          "gl-bubble max-w-[min(34rem,88%)]",
          isCounselor ? "gl-bubble-out" : "ml-auto border-gold/35 bg-gold/8",
        )}
      >
        <p className="text-[0.75rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {isCounselor ? (
            <span className="inline-flex items-center gap-1.5 text-gold-deep">
              <KeyRound size={12} aria-hidden="true" />
              Your counselor
            </span>
          ) : (
            "You"
          )}
        </p>
        <div className="mt-2 whitespace-pre-wrap text-[0.98rem] leading-relaxed text-foreground">
          {message.content}
        </div>
        <time
          dateTime={new Date(message.createdAt).toISOString()}
          className="mt-2.5 block text-[0.78rem] text-muted-foreground"
        >
          {formatRelative(message.createdAt)}
        </time>
      </div>
    </li>
  );
}

function ReplyBox({ token, onSent }: { token: string; onSent: (message: ThreadMessage) => void }) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const content = draft.trim();
    if (content.length < LIMITS.message.min) return;

    setSending(true);
    try {
      const result = await apiFetch<{ message: ThreadMessage }>(
        `/threads/${encodeURIComponent(token)}/messages`,
        { method: "POST", body: { content } },
      );
      setDraft("");
      onSent(result.message);
      toast.success("Message sent");
    } catch (error) {
      toast.error(
        error instanceof RequestError && error.status === 429
          ? "You are sending quickly — please wait a moment before the next message."
          : "We could not send that message. Please try again.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={send} className="mt-8">
      <label htmlFor="reply" className="sr-only">
        Write a reply to your counselor
      </label>
      <div className="rounded-2xl border border-border bg-card p-2 shadow-[var(--shadow-soft)] transition-colors focus-within:border-gold">
        <textarea
          id="reply"
          rows={3}
          value={draft}
          maxLength={LIMITS.message.max}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add anything else your counselor should know…"
          className="w-full resize-y bg-transparent px-3 py-2.5 text-[0.98rem] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/70"
        />
        <div className="flex items-center justify-between gap-3 px-2 pb-1">
          <span
            aria-hidden="true"
            className={cn(
              "text-[0.78rem] tabular-nums",
              draft.length > LIMITS.message.max * 0.9 ? "text-clay" : "text-muted-foreground",
            )}
          >
            {draft.length} / {LIMITS.message.max}
          </span>
          <button
            type="submit"
            disabled={sending || draft.trim().length < LIMITS.message.min}
            className="gl-btn bg-primary px-5 py-2.5 text-[0.9rem] font-semibold text-primary-foreground disabled:opacity-50"
          >
            {sending ? (
              <>
                <Loader2 size={15} aria-hidden="true" className="animate-spin" />
                Sending…
              </>
            ) : (
              <>
                Send
                <Send size={15} aria-hidden="true" />
              </>
            )}
          </button>
        </div>
      </div>
      <p className="mt-2.5 flex items-center gap-1.5 text-[0.8rem] text-muted-foreground">
        <Check size={13} aria-hidden="true" className="text-verdigris" />
        Only you and your counselor can read this thread.
      </p>
    </form>
  );
}
