/** Cloudflare binding surface for the GraceLine API Worker. */
export interface Env {
  /** D1 relational store — questions, messages, notes, prayers, users, audit log. */
  DB: D1Database;
  /** KV — rate limiting, response cache, config/feature flags. */
  CACHE: KVNamespace;
  /** Async outbound email. Never sent inline on a user-facing request. */
  EMAIL_QUEUE: Queue;
  /** Per-thread coordination object backing live conversation streaming. */
  THREAD_ROOM: DurableObjectNamespace;

  /** Absolute origin of the public site (Vercel). No trailing slash. */
  PUBLIC_SITE_URL: string;
  /** Absolute origin of this Worker. Used for canonical API links in emails. */
  API_BASE_URL?: string;

  /** HMAC-SHA256 session signing key. Must be >= 32 chars in production. */
  JWT_SECRET: string;

  /** Seeded on first boot when the users table is empty. */
  ADMIN_BOOTSTRAP_EMAIL?: string;
  ADMIN_BOOTSTRAP_PASSWORD?: string;

  /** Outbound email HTTP provider. "resend" | "postmark" | "log". */
  EMAIL_PROVIDER?: string;
  EMAIL_API_KEY?: string;
  EMAIL_FROM?: string;

  /** "development" | "preview" | "production" | "test" */
  ENVIRONMENT?: string;
  SITE_NAME?: string;

  /** Frontend origins allowed to call the API directly (comma separated). */
  ALLOWED_ORIGINS?: string;

  /** Retention window for the audit log, in days. Default 365. */
  AUDIT_RETENTION_DAYS?: string;
}

export type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  name: string | null;
  role: "admin" | "counselor";
  is_active: number;
  failed_login_count: number;
  locked_until: number | null;
  last_login_at: number | null;
  created_at: number;
  updated_at: number;
};

export type PublicUser = {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "counselor";
};

export type QuestionRow = {
  id: number;
  tracking_token: string;
  seeker_email: string | null;
  category: string | null;
  raw_title: string;
  raw_content: string;
  public_title: string | null;
  public_content: string | null;
  public_answer: string | null;
  public_slug: string | null;
  is_public: number;
  published_at: number | null;
  published_by: string | null;
  is_urgent: number;
  status: "new" | "active" | "resolved";
  assigned_to: string | null;
  last_message_at: number | null;
  seeker_read_at: number | null;
  counselor_read_at: number | null;
  created_at: number;
  updated_at: number;
};

export type MessageRow = {
  id: number;
  question_id: number;
  sender_type: "seeker" | "counselor";
  sender_user_id: string | null;
  content: string;
  created_at: number;
};

export type NoteRow = {
  id: number;
  question_id: number;
  author_id: string;
  content: string;
  created_at: number;
  author_name?: string | null;
};

export type PrayerRow = {
  id: number;
  title: string;
  content: string;
  prayed_count: number;
  is_hidden: number;
  created_at: number;
};

/** Messages produced onto EMAIL_QUEUE. */
export type EmailJob =
  | {
      type: "counselor_new_question";
      to: string[];
      questionId: number;
      title: string;
      category: string | null;
      isUrgent: boolean;
      createdAt: number;
    }
  | {
      type: "seeker_reply";
      to: string;
      questionId: number;
      trackingToken: string;
      preview: string;
      createdAt: number;
    }
  | {
      type: "urgent_escalation_digest";
      to: string[];
      questionIds: number[];
      createdAt: number;
    };
