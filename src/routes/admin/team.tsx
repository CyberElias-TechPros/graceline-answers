import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, Loader2, ShieldCheck, UserPlus, UserX } from "lucide-react";
import { apiFetch, RequestError } from "../../lib/api";
import { FieldError } from "../../components/states";
import { formatDateTime } from "../../lib/format";
import { LIMITS } from "../../../shared/site";
import { cn } from "../../lib/utils";

/**
 * Team management. Admin only — the API returns 403 to a counselor, and the
 * sidebar hides this link for them, so the page is never reachable in the UI by
 * someone who cannot use it. The server check is what actually enforces it.
 */

type TeamMember = {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "counselor";
  isActive: boolean;
  lastLoginAt: number | null;
  createdAt: number;
};

export const Route = createFileRoute("/admin/team")({
  component: TeamPage,
});

function TeamPage() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);

  const team = useQuery({
    queryKey: ["admin", "team"],
    queryFn: ({ signal }) => apiFetch<{ items: TeamMember[] }>("/admin/team", { signal }),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "team"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
  };

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiFetch(`/admin/team/${id}`, { method: "PATCH", body: { is_active: isActive } }),
    onSuccess: (_data, variables) => {
      toast.success(variables.isActive ? "Account reactivated" : "Access revoked");
      refresh();
    },
    onError: (error) =>
      toast.error(
        error instanceof RequestError && error.status === 409
          ? "That is the last administrator, so it cannot be removed from the team."
          : error instanceof RequestError
            ? error.message
            : "Could not update that account.",
      ),
  });

  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: "admin" | "counselor" }) =>
      apiFetch(`/admin/team/${id}`, { method: "PATCH", body: { role } }),
    onSuccess: () => {
      toast.success("Role updated");
      refresh();
    },
    onError: (error) =>
      toast.error(
        error instanceof RequestError && error.status === 409
          ? "At least one administrator must remain."
          : "Could not change that role.",
      ),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/admin/team/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Account deleted");
      refresh();
    },
    onError: (error) =>
      toast.error(
        error instanceof RequestError && error.status === 400
          ? "The last administrator cannot be deleted."
          : "Could not delete that account.",
      ),
  });

  if (team.isLoading) {
    return <p className="text-[0.95rem] text-[oklch(0.7_0.016_88)]">Loading the team…</p>;
  }

  if (team.isError) {
    return (
      <div className="gl-card mx-auto max-w-xl p-10 text-center">
        <p className="text-[1.15rem] font-semibold text-[oklch(0.95_0.012_88)]">
          You do not have access to this page
        </p>
        <p className="mt-2 text-[0.93rem] text-[oklch(0.66_0.016_88)]">
          Team management is limited to administrators.
        </p>
      </div>
    );
  }

  const members = team.data?.items ?? [];
  const activeAdmins = members.filter((member) => member.role === "admin" && member.isActive).length;

  return (
    <div className="mx-auto w-full max-w-4xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.9rem] font-semibold leading-tight tracking-[-0.02em] text-[oklch(0.97_0.01_88)]">
            Team
          </h1>
          <p className="mt-1.5 text-[0.93rem] text-[oklch(0.66_0.016_88)]">
            {activeAdmins} administrator{activeAdmins === 1 ? "" : "s"} · {members.length} account
            {members.length === 1 ? "" : "s"} total
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="gl-btn bg-gold px-5 py-2.5 text-[0.9rem] font-semibold text-[oklch(0.22_0.05_70)]"
        >
          <UserPlus size={15} aria-hidden="true" />
          Add a counselor
        </button>
      </header>

      {creating ? <CreateMember onDone={() => { setCreating(false); refresh(); }} onCancel={() => setCreating(false)} /> : null}

      <ul className="mt-7 space-y-3">
        {members.map((member) => (
          <li key={member.id} className={cn("gl-card p-5", !member.isActive && "opacity-70")}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[1.05rem] font-semibold text-[oklch(0.96_0.012_88)]">
                    {member.name ?? member.email}
                  </h2>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.7rem] font-semibold uppercase tracking-[0.08em]",
                      member.role === "admin" ? "bg-gold/16 text-gold" : "bg-white/8 text-[oklch(0.72_0.016_88)]",
                    )}
                  >
                    {member.role === "admin" ? <ShieldCheck size={11} aria-hidden="true" /> : null}
                    {member.role}
                  </span>
                  {!member.isActive ? (
                    <span className="rounded-full bg-clay/16 px-2.5 py-0.5 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-clay">
                      Revoked
                    </span>
                  ) : null}
                </div>
                <p className="mt-1.5 text-[0.85rem] text-[oklch(0.62_0.016_88)]">
                  {member.email}
                </p>
                <p className="mt-1 text-[0.8rem] text-[oklch(0.55_0.016_88)]">
                  Last signed in {member.lastLoginAt ? formatDateTime(member.lastLoginAt) : "never"} ·
                  added {formatDateTime(member.createdAt)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label={`Role for ${member.email}`}
                  value={member.role}
                  onChange={(event) =>
                    changeRole.mutate({ id: member.id, role: event.target.value as "admin" | "counselor" })
                  }
                  className="rounded-xl border border-white/12 bg-[oklch(0.18_0.016_245)] px-3 py-2 text-[0.85rem] text-[oklch(0.9_0.012_88)] outline-none focus:border-gold"
                >
                  <option value="counselor">Counselor</option>
                  <option value="admin">Administrator</option>
                </select>

                <button
                  type="button"
                  onClick={() => toggleActive.mutate({ id: member.id, isActive: !member.isActive })}
                  disabled={toggleActive.isPending}
                  className={cn(
                    "gl-btn border px-4 py-2 text-[0.85rem] font-medium",
                    member.isActive ? "border-white/12" : "border-verdigris/40 text-verdigris",
                  )}
                >
                  {member.isActive ? (
                    <>
                      <UserX size={14} aria-hidden="true" />
                      Revoke
                    </>
                  ) : (
                    "Restore access"
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Delete the account for ${member.email}? This cannot be undone.`)) {
                      remove.mutate(member.id);
                    }
                  }}
                  disabled={remove.isPending}
                  className="gl-btn border border-white/12 px-4 py-2 text-[0.85rem] font-medium hover:border-clay hover:text-clay"
                >
                  Delete
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-7 text-[0.82rem] leading-relaxed text-[oklch(0.55_0.016_88)]">
        Revoking access takes effect immediately — sessions are re-checked against the account on
        every request. Deleting an account keeps their past audit entries intact.
      </p>
    </div>
  );
}

function CreateMember({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"counselor" | "admin">("counselor");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      apiFetch("/admin/team", {
        method: "POST",
        body: { email: email.trim(), name: name.trim() || null, password, role },
      }),
    onSuccess: () => {
      toast.success("Counselor added", { description: "Share their sign-in details securely." });
      onDone();
    },
    onError: (err) =>
      setError(
        err instanceof RequestError
          ? err.status === 409
            ? "Someone already has an account with that email."
            : err.message
          : "Could not create that account.",
      ),
  });

  const tooShort = password.length > 0 && password.length < LIMITS.password.min;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        if (!email.trim() || tooShort || password.length < LIMITS.password.min) return;
        create.mutate();
      }}
      noValidate
      className="gl-card mt-7 space-y-5 p-6"
    >
      <h2 className="text-[1.25rem] font-semibold text-[oklch(0.96_0.012_88)]">Add a counselor</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="new-email" className="block text-[0.85rem] font-medium text-[oklch(0.85_0.014_88)]">
            Email
          </label>
          <input
            id="new-email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1.5 w-full rounded-xl border border-white/12 bg-[oklch(0.16_0.016_245)] px-3.5 py-2.5 text-[0.93rem] text-[oklch(0.94_0.012_88)] outline-none focus:border-gold"
          />
        </div>
        <div>
          <label htmlFor="new-name" className="block text-[0.85rem] font-medium text-[oklch(0.85_0.014_88)]">
            Display name
          </label>
          <input
            id="new-name"
            value={name}
            maxLength={LIMITS.name.max}
            onChange={(event) => setName(event.target.value)}
            className="mt-1.5 w-full rounded-xl border border-white/12 bg-[oklch(0.16_0.016_245)] px-3.5 py-2.5 text-[0.93rem] text-[oklch(0.94_0.012_88)] outline-none focus:border-gold"
          />
        </div>
        <div>
          <label htmlFor="new-password" className="block text-[0.85rem] font-medium text-[oklch(0.85_0.014_88)]">
            Temporary password
          </label>
          <input
            id="new-password"
            type="text"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1.5 w-full rounded-xl border border-white/12 bg-[oklch(0.16_0.016_245)] px-3.5 py-2.5 font-mono text-[0.9rem] text-[oklch(0.94_0.012_88)] outline-none focus:border-gold"
          />
          <FieldError id="new-password-error">
            {tooShort ? `At least ${LIMITS.password.min} characters.` : null}
          </FieldError>
        </div>
        <div>
          <label htmlFor="new-role" className="block text-[0.85rem] font-medium text-[oklch(0.85_0.014_88)]">
            Role
          </label>
          <select
            id="new-role"
            value={role}
            onChange={(event) => setRole(event.target.value as "counselor" | "admin")}
            className="mt-1.5 w-full rounded-xl border border-white/12 bg-[oklch(0.16_0.016_245)] px-3.5 py-2.5 text-[0.93rem] text-[oklch(0.94_0.012_88)] outline-none focus:border-gold"
          >
            <option value="counselor">Counselor</option>
            <option value="admin">Administrator</option>
          </select>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-[0.88rem] font-medium text-clay">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={create.isPending || tooShort}
          className="gl-btn bg-gold px-5 py-2.5 text-[0.9rem] font-semibold text-[oklch(0.22_0.05_70)] disabled:opacity-50"
        >
          {create.isPending ? (
            <Loader2 size={15} aria-hidden="true" className="animate-spin" />
          ) : (
            <>
              <KeyRound size={15} aria-hidden="true" />
              Create account
            </>
          )}
        </button>
        <button type="button" onClick={onCancel} className="gl-btn border border-white/14 px-5 py-2.5 text-[0.9rem] font-semibold">
          Cancel
        </button>
      </div>
    </form>
  );
}
