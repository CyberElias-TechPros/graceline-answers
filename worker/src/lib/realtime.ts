import { logger } from "./logging";
import type { Env } from "../types";

/**
 * Live-thread coordination.
 *
 * A conversation is addressed by its question id, so the seeker (who holds a
 * tracking token) and the counselor (who holds the numeric id) end up in the
 * same room and see each other's messages without polling.
 *
 * All calls go through `stub.fetch()` — the Durable Object stub — because a DO
 * is addressed by its stub, not by a routable hostname.
 */

export function threadRoom(env: Env, questionId: number): DurableObjectStub {
  return env.THREAD_ROOM.get(env.THREAD_ROOM.idFromName(`thread:${questionId}`));
}

const ROOM_ORIGIN = "https://thread-room.internal";

/**
 * Tell the room that a new message exists.
 *
 * Called with `waitUntil` from the write path so the person sending the message
 * never waits on fan-out. A failure here degrades gracefully: waiting clients
 * simply time out and re-poll, so delivery is delayed rather than lost.
 */
export async function notifyThread(env: Env, questionId: number, messageId: number): Promise<void> {
  try {
    const response = await threadRoom(env, questionId).fetch(`${ROOM_ORIGIN}/notify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messageId }),
    });
    if (!response.ok) {
      logger.warn("thread_notify_failed", { question_id: questionId, status: response.status });
    }
  } catch (cause) {
    logger.warn("thread_notify_failed", {
      question_id: questionId,
      error: cause instanceof Error ? cause.message : String(cause),
    });
  }
}

/**
 * Wait for the room's watermark to move past `since`.
 *
 * Returns the watermark, which the caller compares against D1 to decide whether
 * a read is needed. The object never holds message content, so there is nothing
 * to leak if a caller asks with the wrong watermark.
 */
export async function waitForActivity(
  env: Env,
  questionId: number,
  since: number,
  timeoutMs: number,
): Promise<number> {
  try {
    const response = await threadRoom(env, questionId).fetch(
      `${ROOM_ORIGIN}/wait?since=${since}&timeout=${timeoutMs}`,
      { method: "GET" },
    );
    if (!response.ok) return since;
    const body = (await response.json()) as { watermark?: number };
    return Number(body.watermark ?? since);
  } catch (cause) {
    logger.warn("thread_wait_failed", {
      question_id: questionId,
      error: cause instanceof Error ? cause.message : String(cause),
    });
    return since;
  }
}
