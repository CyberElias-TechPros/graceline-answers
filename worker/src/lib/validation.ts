import { z } from "zod";
import { AppError } from "./errors";
import { CATEGORIES, LIMITS } from "../../../shared/site";

/**
 * Server-side validation. The frontend validates for UX; this is the actual
 * boundary, so nothing here trusts the client.
 */

const categorySchema = z
  .string()
  .trim()
  .refine((v) => (CATEGORIES as readonly string[]).includes(v), {
    message: "Please choose one of the listed topics.",
  });

/**
 * Optional seeker email. Always resolves to `string | null` — never `undefined`
 * — so "did they leave an address?" is an unambiguous question downstream.
 */
const optionalEmail = z
  .union([
    z.string().trim().min(3).max(LIMITS.email.max).email("Please enter a valid email address."),
    z.null(),
    z.undefined(),
  ])
  .transform((value) => (typeof value === "string" && value.trim() !== "" ? value.trim() : null));

export const submitQuestionSchema = z.object({
  title: z
    .string()
    .trim()
    .min(LIMITS.questionTitle.min, "Please write a title of at least 3 characters.")
    .max(LIMITS.questionTitle.max),
  content: z
    .string()
    .trim()
    .min(LIMITS.questionBody.min, "Please give us a little more detail so we can help properly.")
    .max(LIMITS.questionBody.max),
  category: categorySchema.optional().nullable(),
  email: optionalEmail.optional(),
});

export const seekerMessageSchema = z.object({
  token: z.string().trim().min(8).max(64),
  content: z.string().trim().min(LIMITS.message.min).max(LIMITS.message.max),
});

export const counselorMessageSchema = z.object({
  question_id: z.coerce.number().int().positive(),
  content: z.string().trim().min(LIMITS.message.min).max(LIMITS.message.max),
});

export const noteSchema = z.object({
  content: z.string().trim().min(LIMITS.note.min).max(LIMITS.note.max),
});

export const statusSchema = z.object({
  status: z.enum(["new", "active", "resolved"]),
});

/**
 * Publishing. The privacy rule is structural: `is_public` cannot be true unless
 * all three sanitized fields are present, so raw seeker text can never reach the
 * archive by accident.
 */
export const publishSchema = z
  .object({
    public_title: z.string().trim().max(LIMITS.publicTitle.max).optional().nullable(),
    public_content: z.string().trim().max(LIMITS.publicBody.max).optional().nullable(),
    public_answer: z.string().trim().max(LIMITS.publicAnswer.max).optional().nullable(),
    category: categorySchema.optional().nullable(),
    is_public: z.coerce.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.is_public) return;
    const required: Array<[string, string | null | undefined, number]> = [
      ["public_title", value.public_title, LIMITS.publicTitle.min],
      ["public_content", value.public_content, LIMITS.publicBody.min],
      ["public_answer", value.public_answer, LIMITS.publicAnswer.min],
    ];
    for (const [field, text, min] of required) {
      if (!text || text.length < min) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `Write the anonymized ${field.replace("public_", "").replace("_", " ")} before publishing.`,
        });
      }
    }
  });

export const prayerSchema = z.object({
  title: z.string().trim().min(LIMITS.prayerTitle.min).max(LIMITS.prayerTitle.max),
  content: z.string().trim().min(LIMITS.prayerBody.min).max(LIMITS.prayerBody.max),
});

export const loginSchema = z.object({
  email: z.string().trim().min(3).max(LIMITS.email.max),
  password: z.string().min(1).max(LIMITS.password.max),
});

export const teamCreateSchema = z.object({
  email: z.string().trim().toLowerCase().min(3).max(LIMITS.email.max).email("Please enter a valid email address."),
  name: z.string().trim().min(LIMITS.name.min).max(LIMITS.name.max).optional().nullable(),
  password: z
    .string()
    .min(LIMITS.password.min, `Please choose a password of at least ${LIMITS.password.min} characters.`)
    .max(LIMITS.password.max),
  role: z.enum(["admin", "counselor"]).default("counselor"),
});

export const passwordResetSchema = z.object({
  password: z
    .string()
    .min(LIMITS.password.min, `Please choose a password of at least ${LIMITS.password.min} characters.`)
    .max(LIMITS.password.max),
});

export const archiveQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  // Accepted as either the canonical name ("Bible Interpretation") or the slug
  // that appears in public URLs ("bible-interpretation"). Resolution to one
  // canonical form happens in the route, because a slug is what callers actually
  // have. Restricting this to names made every slug-form request a 422.
  category: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  cursor: z.coerce.number().int().nonnegative().optional(),
});

export const inboxQuerySchema = z.object({
  status: z.enum(["new", "active", "resolved", "all"]).default("new"),
  urgent: z.coerce.boolean().optional(),
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.coerce.number().int().nonnegative().optional(),
});

export const prayerQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(24),
  cursor: z.coerce.number().int().nonnegative().optional(),
});

/** Parse a schema, converting Zod issues into a single 422 with per-field detail. */
export function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  const details: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_";
    (details[key] ??= []).push(issue.message);
  }
  throw AppError.validation(details, result.error.issues[0]?.message ?? "Please check your input.");
}

/**
 * Parse a positive integer path segment.
 *
 * Guards D1 against NaN bindings, which previously surfaced as 500s for
 * malformed URLs like `/api/admin/questions/abc`.
 */
export function parseIdParam(value: string): number {
  if (!/^\d{1,15}$/.test(value)) {
    throw AppError.badRequest("That identifier is not valid.");
  }
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) {
    throw AppError.badRequest("That identifier is not valid.");
  }
  return n;
}
