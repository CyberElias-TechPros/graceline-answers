import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, Loader2, Lock, ShieldAlert } from "lucide-react";
import { apiFetch, RequestError } from "../../lib/api";
import type { SessionUser } from "../../lib/api";
import { privateMeta } from "../../lib/seo";
import { Wordmark } from "../../components/wordmark";
import { FieldError } from "../../components/states";
import { cn } from "../../lib/utils";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Counselor sign-in.
 *
 * The form says nothing about which half of the credential pair was wrong,
 * because the API deliberately answers identically for an unknown email and a
 * wrong password. Repeating that behaviour here is what stops the interface
 * leaking what the server refuses to.
 */

const loginSchema = z.object({
  email: z.string().trim().email("Enter the email address on your counselor account."),
  password: z.string().min(1, "Enter your password."),
});

type LoginValues = z.infer<typeof loginSchema>;

export const Route = createFileRoute("/admin/login")({
  validateSearch: (search: Record<string, unknown>): { next?: string } => ({
    next: typeof search.next === "string" && search.next.startsWith("/admin") ? search.next : undefined,
  }),
  head: () => {
    const seo = privateMeta("Counselor sign in", "/admin/login");
    return { meta: seo.meta };
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const next = Route.useSearch().next;
  const [locked, setLocked] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const submit = async (values: LoginValues) => {
    try {
      await apiFetch<{ user: SessionUser }>("/admin/login", {
        method: "POST",
        body: { email: values.email.trim(), password: values.password },
      });
      // Drop any cached 401s from before authentication.
      queryClient.clear();
      toast.success("Signed in");
      void navigate({ to: next ?? "/admin/inbox", replace: true });
    } catch (error) {
      if (error instanceof RequestError && error.status === 429) {
        setLocked(true);
        const retryAfter = Number(error.details?.retryAfterSeconds?.[0] ?? 0);
        toast.error("Too many attempts", {
          description: retryAfter
            ? `Sign-in is paused for about ${Math.ceil(retryAfter / 60)} minutes to protect these accounts.`
            : "Sign-in is paused briefly to protect these accounts.",
        });
        return;
      }
      // Identical for an unknown address and a wrong password, by design.
      toast.error("Those details did not match an active counselor account.");
    }
  };

  return (
    <div className="dark relative flex min-h-screen items-center justify-center overflow-hidden bg-ink px-5 py-16">
      <div className="gl-aurora opacity-70" aria-hidden="true" />
      <div className="gl-grain" aria-hidden="true" />

      <div className="relative w-full max-w-md">
        <div className="mb-8 text-[oklch(0.96_0.012_88)]">
          <Wordmark />
        </div>

        <div className="gl-card border-white/8 bg-[oklch(0.2_0.016_245)]/70 p-7 backdrop-blur-md sm:p-8">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/14 text-gold">
              <Lock size={18} aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-[1.35rem] font-semibold leading-tight text-[oklch(0.97_0.01_88)]">
                Counselor sign in
              </h1>
              <p className="mt-0.5 text-[0.85rem] text-[oklch(0.66_0.016_88)]">
                Private area — not indexed
              </p>
            </div>
          </div>

          {locked ? (
            <div
              role="alert"
              className="mt-6 flex items-start gap-3 rounded-xl border border-clay/35 bg-clay/10 p-4"
            >
              <ShieldAlert size={17} aria-hidden="true" className="mt-0.5 shrink-0 text-clay" />
              <p className="text-[0.9rem] leading-relaxed text-[oklch(0.9_0.012_88)]">
                Sign-in is temporarily paused after several failed attempts. This protects the
                accounts of everyone on the team. Please wait a little while and try again.
              </p>
            </div>
          ) : null}

          <form onSubmit={handleSubmit(submit)} noValidate className="mt-7 space-y-5">
            <div>
              <label htmlFor="email" className="block text-[0.9rem] font-semibold text-[oklch(0.9_0.012_88)]">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                autoFocus
                aria-invalid={errors.email ? "true" : undefined}
                aria-describedby={errors.email ? "email-error" : undefined}
                {...register("email")}
                className={cn(
                  "mt-2 w-full rounded-xl border bg-[oklch(0.16_0.016_245)] px-4 py-3 text-[0.98rem] text-[oklch(0.95_0.012_88)] outline-none transition-colors placeholder:text-[oklch(0.55_0.016_88)]",
                  errors.email ? "border-clay" : "border-white/12 focus:border-gold",
                )}
              />
              <FieldError id="email-error">{errors.email?.message}</FieldError>
            </div>

            <div>
              <label htmlFor="password" className="block text-[0.9rem] font-semibold text-[oklch(0.9_0.012_88)]">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                aria-invalid={errors.password ? "true" : undefined}
                aria-describedby={errors.password ? "password-error" : undefined}
                {...register("password")}
                className={cn(
                  "mt-2 w-full rounded-xl border bg-[oklch(0.16_0.016_245)] px-4 py-3 text-[0.98rem] text-[oklch(0.95_0.012_88)] outline-none transition-colors",
                  errors.password ? "border-clay" : "border-white/12 focus:border-gold",
                )}
              />
              <FieldError id="password-error">{errors.password?.message}</FieldError>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || locked}
              className="gl-btn w-full bg-gold py-3.5 font-semibold text-[oklch(0.22_0.05_70)] disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} aria-hidden="true" className="animate-spin" />
                  Checking…
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight size={16} aria-hidden="true" />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 flex items-start gap-2 text-[0.82rem] leading-relaxed text-[oklch(0.6_0.016_88)]">
          <AlertTriangle size={13} aria-hidden="true" className="mt-0.5 shrink-0" />
          Accounts are issued by an administrator. Sessions expire after 30 days and can be revoked
          at any time.
        </p>
      </div>
    </div>
  );
}
