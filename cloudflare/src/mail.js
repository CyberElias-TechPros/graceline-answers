/**
 * Email delivery via the Cloudflare Email Service binding (`env.MAIL.send`).
 *
 * Uses the EmailMessageBuilder form (single argument) per the current
 * Cloudflare docs — `send(message: EmailMessage | EmailMessageBuilder)`.
 *
 * The binding only exists when `send_email` is configured in wrangler.jsonc,
 * so all senders degrade gracefully:
 *   - local `wrangler dev`  → miniflare captures the message, writes .eml, logs it
 *   - production            → delivered to the configured destination addresses
 *   - binding absent        → skipped with a log line (never breaks requests)
 *
 * Production note: the `from` domain must be onboarded onto Cloudflare Email
 * Sending (`wrangler email sending enable yourdomain.com`) — configure it via
 * the EMAIL_FROM variable.
 */

const DEFAULT_FROM = 'notifications@graceline-answers.example';

export async function sendMail(env, { to, subject, text }) {
  if (!env.MAIL) {
    console.log('[graceline-answers] Mail binding not enabled, skipping email:', subject);
    return { sent: false, reason: 'mail_disabled' };
  }
  try {
    await env.MAIL.send({
      to,
      from: env.EMAIL_FROM || DEFAULT_FROM,
      subject,
      text,
    });
    return { sent: true };
  } catch (e) {
    console.error('[graceline-answers] mail error:', e && e.message ? e.message : e);
    return { sent: false, reason: 'send_failed' };
  }
}

/**
 * Notify the counselor pool that a new question arrived. Mirrors the cPanel
 * backend's notifyCounselors(): every counselor/admin gets one plain-text mail.
 */
export async function notifyCounselors(env, db, { title, category, isCrisis, trackingToken, base }) {
  const r = await db
    .prepare("SELECT email FROM users WHERE role IN ('admin','counselor') ORDER BY id ASC")
    .all();
  const rows = r.results || [];
  const result = { sent: 0, skipped: 0 };
  if (rows.length === 0) {
    console.log('[graceline-answers] No counselor accounts to notify yet.');
    return result;
  }
  const subject = `[GraceLine Answers] New question${isCrisis ? ' — URGENT' : ''}`;
  const text =
    'A new question was submitted.\n\n' +
    `Category: ${category || '—'}\n` +
    `Title: ${title}\n\n` +
    `Open the inbox: ${base}/admin/inbox` +
    (trackingToken ? `\nPrivate thread link: ${base}/t/${trackingToken}` : '');
  for (const row of rows) {
    const res = await sendMail(env, { to: row.email, subject, text });
    if (res.sent) result.sent += 1;
    else result.skipped += 1;
  }
  return result;
}
