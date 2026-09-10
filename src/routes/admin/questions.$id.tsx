import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  MessageSquare,
  Send,
  StickyNote,
  UserPlus,
} from "lucide-react";
import { apiFetch, RequestError } from "../../lib/api";
import type { ThreadMessage } from "../../lib/api";
import { StatusPill } from "./inbox";
import { FieldError, LoadingState } from "../../components/states";
import { formatDateTime, formatRelative } from "../../lib/format";
import { CATEGORIES, LIMITS, SITE_NAME, detectCrisis } from "../../../shared/site";
import { cn } from "../../lib/utils";

/**
 * One conversation, from the counselor's side.
 *
 * Three separate surfaces on purpose: the seeker's own words, the reply thread,
 * and internal notes the seeker never sees. Keeping them visually distinct is
 * a safety property — a note written to a colleague must never be mistaken for
 * something the person asking will read.
 *
 * Publishing is a distinct panel that requires all three rewritten fields
 * before it will submit, mirroring the API's own 422 rule, so a half-written
 * publish cannot be sent.
 */

type AdminThread = {
  question: {
    id: number;
    trackingToken: string;
    seekerEmail: string | null;
    category: string | null;
    title: string;
    content: string;
    isUrgent: boolean;
    status: "new" | "active" | "resolved";
    assignedTo: string | null;
    isPublic: boolean;
    publicTitle: string | null;
    publicContent: string | null;
    publicAnswer: string | null;
    publicSlug: string | null;
    publishedAt: number | null;
    createdAt: number;
    updatedAt: number;
  };
  messages: ThreadMessage[];
  notes: { id: number; content: string; authorName: string | null; createdAt: number }[];
  lastMessageId: number;
};

export const Route = createFileRoute("/admin/questions/$id")({
  component: QuestionPage,
});

function QuestionPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["admin", "question", id],
    queryFn: ({ signal }) => apiFetch<AdminThread>(`/admin/questions/${encodeURIComponent(id)}`, { signal }),
  });

  const thread = query.data;
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const watermark = useRef(0);
  const cancelled = useRef(false);

  useEffect(() => {
    if (!thread) return;
    setMessages(thread.messages);
    watermark.current = thread.lastMessageId;
  }, [thread]);

  // Long-poll for seeker replies. Short timeout, because the request passes
  // through the Vercel proxy whose functions are capped at 10 seconds.
  useEffect(() => {
    if (!thread) return;
    cancelled.current = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      if (cancelled.current) return;
      try {
        const data = await apiFetch<{ messages: ThreadMessage[]; watermark: number }>(
          `/admin/threads/${encodeURIComponent(id)}/stream?since=${watermark.current}&timeout=8000`,
        );
        if (cancelled.current) return;
        if (data.messages.length > 0) {
          setMessages((current) => {
            const known = new Set(current.map((message) => message.id));
            return [...current, ...data.messages.filter((message) => !known.has(message.id))];
          });
          watermark.current = Math.max(watermark.current, data.watermark);
          void queryClient.invalidateQueries({ queryKey: ["admin", "question", id] });
        }
        timer = setTimeout(() => void tick(), 200);
      } catch {
        if (!cancelled.current) timer = setTimeout(() => void tick(), 4_000);
      }
    };

    void tick();
    return () => {
      cancelled.current = true;
      if (timer) clearTimeout(timer);
    };
  }, [thread, id, queryClient]);

  if (query.isLoading) return <LoadingState label="Opening the conversation" rows={2} />;

  if (query.isError || !thread) {
    const status = query.error instanceof RequestError ? query.error.status : 0;
    return (
      <div className="gl-card mx-auto max-w-xl p-10 text-center">
        <h1 className="text-[1.3rem] font-semibold text-[oklch(0.95_0.012_88)]">
          {status === 404 ? "That conversation does not exist" : "We could not open that conversation"}
        </h1>
        <p className="mt-2 text-[0.94rem] text-[oklch(0.66_0.016_88)]">
          {status === 404
            ? "It may have been removed, or the link may be wrong."
            : "Your session may have expired. Try reloading the console."}
        </p>
      </div>
    );
  }

  const crisis = detectCrisis(`${thread.question.title}\n${thread.question.content}`);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={thread.question.status} />
            {thread.question.isUrgent || crisis.isCrisis ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-clay/16 px-2.5 py-0.5 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-clay">
                <AlertTriangle size={11} aria-hidden="true" />
                Crisis language
              </span>
            ) : null}
            {thread.question.isPublic ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-verdigris/16 px-2.5 py-0.5 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-verdigris">
                <Eye size={11} aria-hidden="true" />
                Published
              </span>
            ) : null}
          </div>

          <h1 className="mt-3 text-[1.7rem] font-semibold leading-tight tracking-[-0.02em] text-[oklch(0.97_0.01_88)]">
            {thread.question.title}
          </h1>

          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.83rem] text-[oklch(0.62_0.016_88)]">
            <span>#{thread.question.id}</span>
            {thread.question.category ? <span>{thread.question.category}</span> : null}
            <span>Asked {formatDateTime(thread.question.createdAt)}</span>
            {thread.question.seekerEmail ? (
              <span className="inline-flex items-center gap-1.5">
                <Mail size={12} aria-hidden="true" />
                {thread.question.seekerEmail}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <Lock size={12} aria-hidden="true" />
                Fully anonymous
              </span>
            )}
          </p>
        </div>

        <ThreadActions id={thread.question.id} thread={thread.question} />
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.5fr_1fr] lg:items-start">
        <div className="space-y-6">
          <section aria-labelledby="seeker-question" className="gl-card p-6">
            <h2
              id="seeker-question"
              className="text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-[oklch(0.6_0.016_88)]"
            >
              As written by the seeker
            </h2>
            <div className="mt-3 whitespace-pre-wrap text-[0.99rem] leading-relaxed text-[oklch(0.93_0.012_88)]">
              {thread.question.content}
            </div>
          </section>

          <section aria-labelledby="thread" className="gl-card p-6">
            <h2
              id="thread"
              className="flex items-center gap-2 text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-[oklch(0.6_0.016_88)]"
            >
              <MessageSquare size={13} aria-hidden="true" />
              Conversation
            </h2>

            <ol className="mt-5 space-y-4">
              {messages.length === 0 ? (
                <li className="rounded-xl border border-white/8 bg-white/4 p-5 text-[0.93rem] text-[oklch(0.66_0.016_88)]">
                  No replies yet. The first message you send here is what this person will read.
                </li>
              ) : (
                messages.map((message) => (
                  <li
                    key={message.id}
                    className={cn("flex", message.sender === "counselor" ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[min(32rem,92%)] rounded-2xl border px-4 py-3",
                        message.sender === "counselor"
                          ? "border-gold/30 bg-gold/8"
                          : "border-white/10 bg-white/4",
                      )}
                    >
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[oklch(0.6_0.016_88)]">
                        {message.sender === "counselor" ? "You" : "Seeker"}
                      </p>
                      <p className="mt-1.5 whitespace-pre-wrap text-[0.96rem] leading-relaxed text-[oklch(0.93_0.012_88)]">
                        {message.content}
                      </p>
                      <time
                        dateTime={new Date(message.createdAt).toISOString()}
                        className="mt-2 block text-[0.75rem] text-[oklch(0.55_0.016_88)]"
                      >
                        {formatRelative(message.createdAt)}
                      </time>
                    </div>
                  </li>
                ))
              )}
            </ol>

            <ReplyBox
              id={thread.question.id}
              onSent={(message) => {
                setMessages((current) =>
                  current.some((item) => item.id === message.id) ? current : [...current, message],
                );
                watermark.current = Math.max(watermark.current, message.id);
                void queryClient.invalidateQueries({ queryKey: ["admin", "question", id] });
                void queryClient.invalidateQueries({ queryKey: ["admin", "inbox"] });
              }}
            />
          </section>
        </div>

        <div className="space-y-6">
          <NotesPanel id={thread.question.id} notes={thread.notes} />
          <PublishPanel id={thread.question.id} question={thread.question} />
        </div>
      </div>
    </div>
  );
}

function ThreadActions({ id, thread }: { id: number; thread: AdminThread["question"] }) {
  const queryClient = useQueryClient();
  const counselors = useQuery({
    queryKey: ["admin", "counselors"],
    queryFn: ({ signal }) =>
      apiFetch<{ items: { id: string; name: string; role: "admin" | "counselor" }[] }>(
        "/admin/counselors",
        { signal },
      ),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "question", String(id)] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "inbox"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
  };

  const setStatus = useMutation({
    mutationFn: (status: "new" | "active" | "resolved") =>
      apiFetch(`/admin/questions/${id}/status`, { method: "POST", body: { status } }),
    onSuccess: (_data, status) => {
      toast.success(status === "resolved" ? "Marked resolved" : "Status updated");
      invalidate();
    },
    onError: () => toast.error("Could not update the status."),
  });

  const assign = useMutation({
    mutationFn: (assignedTo: string | null) =>
      apiFetch(`/admin/questions/${id}/assign`, { method: "POST", body: { assigned_to: assignedTo } }),
    onSuccess: () => {
      toast.success("Assignment updated");
      invalidate();
    },
    onError: () => toast.error("Could not change the assignment."),
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Assign to a counselor"
        value={thread.assignedTo ?? ""}
        onChange={(event) => assign.mutate(event.target.value || null)}
        className="rounded-xl border border-white/12 bg-[oklch(0.18_0.016_245)] px-3 py-2 text-[0.87rem] text-[oklch(0.9_0.012_88)] outline-none focus:border-gold"
      >
        <option value="">Unassigned</option>
        {(counselors.data?.items ?? []).map((person) => (
          <option key={person.id} value={person.id}>
            {person.name}
          </option>
        ))}
      </select>

      {thread.status !== "resolved" ? (
        <button
          type="button"
          onClick={() => setStatus.mutate("resolved")}
          disabled={setStatus.isPending}
          className="gl-btn border border-white/12 px-4 py-2 text-[0.87rem] font-medium"
        >
          <Check size={14} aria-hidden="true" />
          Mark resolved
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setStatus.mutate("active")}
          disabled={setStatus.isPending}
          className="gl-btn border border-white/12 px-4 py-2 text-[0.87rem] font-medium"
        >
          Reopen
        </button>
      )}
    </div>
  );
}

function ReplyBox({ id, onSent }: { id: number; onSent: (message: ThreadMessage) => void }) {
  const [draft, setDraft] = useState("");

  const send = useMutation({
    // Counselor replies live under /admin/threads, not /admin/questions: the
    // Worker groups every message operation for a thread together.
    mutationFn: () =>
      apiFetch<{ id: number; createdAt: number }>(`/admin/threads/${id}/messages`, {
        method: "POST",
        body: { content: draft.trim() },
      }),
    onSuccess: (data) => {
      const content = draft.trim();
      setDraft("");
      onSent({ id: data.id, sender: "counselor", content, createdAt: data.createdAt });
      toast.success("Reply sent");
    },
    onError: (error) =>
      toast.error(
        error instanceof RequestError ? error.message : "We could not send that reply.",
      ),
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (draft.trim().length >= LIMITS.message.min) send.mutate();
      }}
      className="mt-6"
    >
      <label htmlFor="counselor-reply" className="sr-only">
        Write a reply to the seeker
      </label>
      <textarea
        id="counselor-reply"
        rows={5}
        value={draft}
        maxLength={LIMITS.message.max}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Write the reply this person will read. It is the only thing they will see from you."
        className="w-full resize-y rounded-xl border border-white/12 bg-[oklch(0.16_0.016_245)] px-4 py-3 text-[0.96rem] leading-relaxed text-[oklch(0.94_0.012_88)] outline-none transition-colors placeholder:text-[oklch(0.5_0.016_88)] focus:border-gold"
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-[0.78rem] tabular-nums text-[oklch(0.55_0.016_88)]">
          {draft.length} / {LIMITS.message.max}
        </span>
        <button
          type="submit"
          disabled={send.isPending || draft.trim().length < LIMITS.message.min}
          className="gl-btn bg-gold px-5 py-2.5 text-[0.9rem] font-semibold text-[oklch(0.22_0.05_70)] disabled:opacity-50"
        >
          {send.isPending ? (
            <Loader2 size={15} aria-hidden="true" className="animate-spin" />
          ) : (
            <>
              Send reply
              <Send size={15} aria-hidden="true" />
            </>
          )}
        </button>
      </div>
    </form>
  );
}

function NotesPanel({
  id,
  notes,
}: {
  id: number;
  notes: { id: number; content: string; authorName: string | null; createdAt: number }[];
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");

  const add = useMutation({
    mutationFn: () =>
      apiFetch(`/admin/questions/${id}/notes`, { method: "POST", body: { content: draft.trim() } }),
    onSuccess: () => {
      setDraft("");
      void queryClient.invalidateQueries({ queryKey: ["admin", "question", String(id)] });
      toast.success("Note added");
    },
    onError: (error) =>
      toast.error(error instanceof RequestError ? error.message : "Could not save that note."),
  });

  return (
    <section aria-labelledby="notes" className="gl-card border-clay/25 p-6">
      <h2
        id="notes"
        className="flex items-center gap-2 text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-clay"
      >
        <StickyNote size={13} aria-hidden="true" />
        Internal notes
      </h2>
      <p className="mt-1.5 text-[0.83rem] leading-relaxed text-[oklch(0.62_0.016_88)]">
        Visible to the counseling team only. The seeker never sees these.
      </p>

      {notes.length > 0 ? (
        <ul className="mt-5 space-y-3">
          {notes.map((note) => (
            <li key={note.id} className="rounded-xl border border-white/8 bg-white/4 p-3.5">
              <p className="whitespace-pre-wrap text-[0.92rem] leading-relaxed text-[oklch(0.9_0.012_88)]">
                {note.content}
              </p>
              <p className="mt-2 text-[0.75rem] text-[oklch(0.55_0.016_88)]">
                {note.authorName ?? "A counselor"} · {formatRelative(note.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 text-[0.9rem] text-[oklch(0.6_0.016_88)]">No notes yet.</p>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.trim()) add.mutate();
        }}
        className="mt-5"
      >
        <label htmlFor="note" className="sr-only">
          Add an internal note
        </label>
        <textarea
          id="note"
          rows={3}
          value={draft}
          maxLength={LIMITS.note.max}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Something the next counselor should know…"
          className="w-full resize-y rounded-xl border border-white/12 bg-[oklch(0.16_0.016_245)] px-3.5 py-2.5 text-[0.92rem] text-[oklch(0.93_0.012_88)] outline-none transition-colors placeholder:text-[oklch(0.5_0.016_88)] focus:border-clay"
        />
        <button
          type="submit"
          disabled={add.isPending || !draft.trim()}
          className="gl-btn mt-3 w-full border border-clay/40 py-2.5 text-[0.88rem] font-semibold text-clay disabled:opacity-50"
        >
          {add.isPending ? <Loader2 size={14} aria-hidden="true" className="animate-spin" /> : "Add note"}
        </button>
      </form>
    </section>
  );
}

function PublishPanel({ id, question }: { id: number; question: AdminThread["question"] }) {
  const queryClient = useQueryClient();
  const [isPublic, setIsPublic] = useState(question.isPublic);
  const [title, setTitle] = useState(question.publicTitle ?? "");
  const [content, setContent] = useState(question.publicContent ?? "");
  const [answer, setAnswer] = useState(question.publicAnswer ?? "");
  const [category, setCategory] = useState(question.category ?? "");

  const publish = useMutation({
    mutationFn: () =>
      apiFetch<{ slug: string | null }>(`/admin/questions/${id}/publish`, {
        method: "POST",
        body: {
          is_public: isPublic,
          public_title: isPublic ? title.trim() : null,
          public_content: isPublic ? content.trim() : null,
          public_answer: isPublic ? answer.trim() : null,
          category: isPublic && category ? category : null,
        },
      }),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "question", String(id)] });
      toast.success(
        isPublic ? "Published to the archive" : "Withdrawn from the archive",
        isPublic && data.slug
          ? { description: `Live at /archive/${data.slug}`, action: { label: "View", onClick: () => window.open(`/archive/${data.slug}`, "_blank", "noopener") } }
          : undefined,
      );
    },
    onError: (error) =>
      toast.error(
        error instanceof RequestError
          ? error.status === 422
            ? "All three public fields are required before publishing."
            : error.message
          : "Could not save that.",
      ),
  });

  // Mirrors the server's rule client-side, so the reason a submit is blocked is
  // visible rather than discovered after a round trip.
  const incomplete = isPublic && (!title.trim() || !content.trim() || !answer.trim());

  return (
    <section aria-labelledby="publish" className="gl-card p-6">
      <h2
        id="publish"
        className="flex items-center gap-2 text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-verdigris"
      >
        {isPublic ? <Eye size={13} aria-hidden="true" /> : <EyeOff size={13} aria-hidden="true" />}
        Public archive
      </h2>

      <label className="mt-4 flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={isPublic}
          onChange={(event) => setIsPublic(event.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[var(--verdigris)]"
        />
        <span>
          <span className="block text-[0.93rem] font-medium text-[oklch(0.93_0.012_88)]">
            {isPublic ? "Visible in the public archive" : "Private — not in the archive"}
          </span>
          <span className="mt-0.5 block text-[0.82rem] leading-relaxed text-[oklch(0.6_0.016_88)]">
            Rewrite the question and answer below. The seeker&apos;s original words are never shown.
          </span>
        </span>
      </label>

      {isPublic ? (
        <div className="mt-5 space-y-4">
          <div>
            <label htmlFor="public-title" className="block text-[0.85rem] font-medium text-[oklch(0.85_0.014_88)]">
              Public title
            </label>
            <input
              id="public-title"
              value={title}
              maxLength={LIMITS.publicTitle.max}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-white/12 bg-[oklch(0.16_0.016_245)] px-3.5 py-2.5 text-[0.93rem] text-[oklch(0.94_0.012_88)] outline-none focus:border-verdigris"
            />
          </div>

          <div>
            <label htmlFor="public-content" className="block text-[0.85rem] font-medium text-[oklch(0.85_0.014_88)]">
              Rewritten question
            </label>
            <textarea
              id="public-content"
              rows={4}
              value={content}
              maxLength={LIMITS.publicBody.max}
              onChange={(event) => setContent(event.target.value)}
              className="mt-1.5 w-full resize-y rounded-xl border border-white/12 bg-[oklch(0.16_0.016_245)] px-3.5 py-2.5 text-[0.93rem] leading-relaxed text-[oklch(0.94_0.012_88)] outline-none focus:border-verdigris"
            />
          </div>

          <div>
            <label htmlFor="public-answer" className="block text-[0.85rem] font-medium text-[oklch(0.85_0.014_88)]">
              Public answer
            </label>
            <textarea
              id="public-answer"
              rows={6}
              value={answer}
              maxLength={LIMITS.publicAnswer.max}
              onChange={(event) => setAnswer(event.target.value)}
              className="mt-1.5 w-full resize-y rounded-xl border border-white/12 bg-[oklch(0.16_0.016_245)] px-3.5 py-2.5 text-[0.93rem] leading-relaxed text-[oklch(0.94_0.012_88)] outline-none focus:border-verdigris"
            />
          </div>

          <div>
            <label htmlFor="public-category" className="block text-[0.85rem] font-medium text-[oklch(0.85_0.014_88)]">
              Category
            </label>
            <select
              id="public-category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-white/12 bg-[oklch(0.16_0.016_245)] px-3.5 py-2.5 text-[0.93rem] text-[oklch(0.94_0.012_88)] outline-none focus:border-verdigris"
            >
              <option value="">No category</option>
              {CATEGORIES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {incomplete ? (
            <FieldError id="publish-incomplete">
              A title, a rewritten question and an answer are all required before publishing.
            </FieldError>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => publish.mutate()}
          disabled={publish.isPending || incomplete}
          className={cn(
            "gl-btn px-5 py-2.5 text-[0.9rem] font-semibold disabled:opacity-50",
            isPublic
              ? "bg-verdigris text-[oklch(0.16_0.02_180)]"
              : "border border-white/14 text-[oklch(0.9_0.012_88)]",
          )}
        >
          {publish.isPending ? (
            <Loader2 size={15} aria-hidden="true" className="animate-spin" />
          ) : isPublic ? (
            <>
              <UserPlus size={15} aria-hidden="true" />
              {question.isPublic ? "Update" : "Publish"}
            </>
          ) : (
            "Withdraw from archive"
          )}
        </button>

        {question.isPublic && question.publicSlug ? (
          <a
            href={`/archive/${question.publicSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="gl-link inline-flex items-center gap-1.5 text-[0.85rem] font-semibold text-verdigris"
          >
            <ExternalLink size={13} aria-hidden="true" />
            View live
          </a>
        ) : null}
      </div>

      <p className="mt-4 text-[0.78rem] leading-relaxed text-[oklch(0.55_0.016_88)]">
        Publishing is attributed to you in the audit log and appears on {SITE_NAME} immediately.
      </p>
    </section>
  );
}
