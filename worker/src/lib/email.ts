import { excerpt } from "../../../shared/site";
import { logger } from "./logging";
import type { EmailJob, Env } from "../types";

/**
 * Outbound email.
 *
 * Nothing here is sent inline on a user-facing request. Routes enqueue an
 * `EmailJob`; the queue consumer delivers it with retries and a dead-letter
 * queue. That keeps submission latency independent of a third party's uptime,
 * which matters most on the crisis path where a slow mail provider would delay
 * the response a distressed person is waiting for.
 *
 * Workers cannot open SMTP sockets, so the legacy nodemailer transport is
 * replaced by an HTTP email API. Resend and Postmark are supported out of the
 * box; `EMAIL_PROVIDER=log` records deliveries to the log for local development.
 */

export async function enqueueEmail(env: Env, job: EmailJob): Promise<void> {
  try {
    await env.EMAIL_QUEUE.send(job);
  } catch (cause) {
    // A queue outage must not fail the user's request. Log loudly so it is
    // visible in observability; the action itself already succeeded.
    logger.error("email_enqueue_failed", {
      job_type: job.type,
      error: cause instanceof Error ? cause.message : String(cause),
    });
  }
}

type RenderedEmail = { subject: string; text: string; html: string };

export function renderEmail(siteUrl: string, siteName: string, job: EmailJob): RenderedEmail | null {
  switch (job.type) {
    case "counselor_new_question": {
      const subject = `${job.isUrgent ? "URGENT — " : ""}New question: ${excerpt(job.title, 70)}`;
      const lines = [
        `A new question arrived on ${siteName}.`,
        "",
        `Topic:    ${job.category ?? "General"}`,
        `Title:    ${job.title}`,
        job.isUrgent ? "Flagged:  URGENT — crisis language detected. Please prioritise." : "",
        "",
        `Open the inbox:  ${siteUrl}/admin/inbox`,
        `Open this thread: ${siteUrl}/admin/questions/${job.questionId}`,
      ].filter(Boolean);
      return {
        subject,
        text: lines.join("\n"),
        html: wrapHtml(
          siteName,
          job.isUrgent ? "Urgent question waiting" : "New question waiting",
          `<p>${escapeHtml(job.title)}</p>
           <p><strong>Topic:</strong> ${escapeHtml(job.category ?? "General")}</p>
           ${job.isUrgent ? `<p class="alert">Crisis language was detected. Please prioritise this one.</p>` : ""}
           <p><a class="btn" href="${siteUrl}/admin/questions/${job.questionId}">Open the thread</a></p>`,
        ),
      };
    }

    case "seeker_reply": {
      return {
        subject: `A counselor replied to your question — ${siteName}`,
        text: [
          `A counselor has replied to your question on ${siteName}.`,
          "",
          excerpt(job.preview, 240),
          "",
          `Read the full conversation: ${siteUrl}/t/${job.trackingToken}`,
          "",
          "Please save that link — it is the only way back to this conversation.",
          "",
          `${siteName} is a ministry, not a substitute for licensed therapy or emergency care.`,
          "If you are in crisis, contact local emergency services or a crisis hotline now.",
        ].join("\n"),
        html: wrapHtml(
          siteName,
          "You have a new reply",
          `<p>A counselor has responded to your question.</p>
           <blockquote>${escapeHtml(excerpt(job.preview, 240))}</blockquote>
           <p><a class="btn" href="${siteUrl}/t/${escapeHtml(job.trackingToken)}">Read the conversation</a></p>
           <p class="muted">Please save that link — it is the only way back to this conversation.</p>`,
        ),
      };
    }

    case "urgent_escalation_digest": {
      if (job.questionIds.length === 0) return null;
      return {
        subject: `${job.questionIds.length} question${job.questionIds.length === 1 ? "" : "s"} still waiting for a reply`,
        text: [
          `These questions on ${siteName} have not received a first reply yet:`,
          "",
          ...job.questionIds.map((id) => `  • ${siteUrl}/admin/questions/${id}`),
          "",
          `Open the inbox: ${siteUrl}/admin/inbox`,
        ].join("\n"),
        html: wrapHtml(
          siteName,
          "Questions waiting for a reply",
          `<p>These conversations are still waiting for a first response:</p>
           <ul>${job.questionIds.map((id) => `<li><a href="${siteUrl}/admin/questions/${id}">Question #${id}</a></li>`).join("")}</ul>
           <p><a class="btn" href="${siteUrl}/admin/inbox">Open the inbox</a></p>`,
        ),
      };
    }

    default:
      return null;
  }
}

/**
 * Deliver one job. Throws on a retryable failure so the queue retries and,
 * after `max_retries`, routes the message to the dead-letter queue.
 */
export async function deliverEmail(env: Env, job: EmailJob): Promise<void> {
  const siteUrl = (env.PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
  const siteName = env.SITE_NAME ?? "GraceLine Answers";
  const rendered = renderEmail(siteUrl, siteName, job);
  if (!rendered) return;

  const recipients = "to" in job ? (Array.isArray(job.to) ? job.to : [job.to]) : [];
  if (recipients.length === 0) return;

  const provider = (env.EMAIL_PROVIDER ?? "log").toLowerCase();
  const from = env.EMAIL_FROM ?? "GraceLine Answers <hello@gracelineanswers.com>";

  if (provider === "log" || !env.EMAIL_API_KEY) {
    logger.info("email_skipped", { job_type: job.type, to: recipients.length, provider });
    return;
  }

  if (provider === "postmark") {
    await Promise.all(
      recipients.map((to) =>
        sendHttp(
          "https://api.postmarkapp.com/email",
          {
            From: from,
            To: to,
            Subject: rendered.subject,
            TextBody: rendered.text,
            HtmlBody: rendered.html,
            MessageStream: "outbound",
          },
          { "X-Postmark-Server-Token": env.EMAIL_API_KEY!, "Content-Type": "application/json" },
        ),
      ),
    );
    return;
  }

  // Default: Resend-compatible API.
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.EMAIL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    // 4xx (bad key, rejected address) will not succeed on retry — but we still
    // throw so the message lands in the DLQ where an operator can see it.
    throw new Error(`email_provider_error ${response.status}: ${detail.slice(0, 300)}`);
  }
}

async function sendHttp(url: string, body: unknown, headers: Record<string, string>): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`email_provider_error ${response.status}: ${detail.slice(0, 300)}`);
  }
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Minimal inline-styled HTML email. No external assets, so nothing is blocked. */
function wrapHtml(siteName: string, heading: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:#f4f1ea;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;font-family:Georgia,'Times New Roman',serif;color:#22303c;">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#8a6d3b;">${escapeHtml(siteName)}</p>
    <h1 style="margin:0 0 20px;font-size:24px;line-height:1.25;color:#16232e;">${escapeHtml(heading)}</h1>
    <div style="background:#fffdf8;border:1px solid #e6ddc9;border-radius:14px;padding:24px;font-size:15px;line-height:1.65;">
      ${bodyHtml}
    </div>
    <p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#6b7280;">
      ${escapeHtml(siteName)} is a ministry, not a substitute for licensed therapy or emergency care.
      If you are in crisis, contact local emergency services or a crisis hotline immediately.
    </p>
  </div>
</body></html>`;
}
