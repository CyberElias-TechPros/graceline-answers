import { createFileRoute, Link, Outlet, redirect, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ClipboardList,
  Inbox,
  LogOut,
  ScrollText,
  Users,
} from "lucide-react";
import { apiFetch, RequestError } from "../../lib/api";
import type { SessionUser } from "../../lib/api";
import { privateMeta } from "../../lib/seo";
import { Wordmark } from "../../components/wordmark";
import { cn } from "../../lib/utils";

/**
 * Counselor console.
 *
 * Inverted to ink-dark on purpose: this is a tool people work in for hours, and
 * the visual break makes it unmistakable that they have left the public
 * ministry. It is excluded from robots.txt and marked noindex throughout.
 *
 * The session is resolved client-side rather than in a loader. Admin state is
 * deliberately not readable during SSR, so a logged-out crawl can never
 * accidentally render console markup, and a stale cookie cannot produce a
 * server-side page that then has to be torn down.
 */
export const Route = createFileRoute("/admin")({
  head: () => {
    const seo = privateMeta("Counselor console", "/admin");
    return { meta: seo.meta };
  },
  component: AdminLayout,
});

const NAV = [
  { to: "/admin/inbox", label: "Inbox", icon: Inbox },
  { to: "/admin/team", label: "Team", icon: Users, adminOnly: true },
  { to: "/admin/audit", label: "Audit log", icon: ScrollText, adminOnly: true },
] as const;

function AdminLayout() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isLogin = pathname === "/admin/login" || pathname === "/admin";

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin", "me"],
    queryFn: async () => {
      const result = await apiFetch<{ user: SessionUser | null }>("/admin/me");
      if (!result.user) throw new RequestError(401, { error: "unauthorized", message: "Not signed in" });
      return result.user;
    },
    retry: false,
    staleTime: 60_000,
    // The login page must be reachable while unauthenticated.
    enabled: !isLogin,
  });

  useEffect(() => {
    if (isLogin) return;
    if (data) return;
    if (isLoading) return;
    void navigate({ to: "/admin/login", search: { next: pathname }, replace: true });
  }, [data, isLoading, isLogin, navigate, pathname]);

  const signOut = async () => {
    try {
      await apiFetch("/admin/logout", { method: "POST" });
    } finally {
      queryClient.clear();
      toast.success("Signed out");
      void navigate({ to: "/admin/login", replace: true });
    }
  };

  // The login route owns its own full-bleed layout.
  if (isLogin) return <Outlet />;

  if (isLoading) {
    return (
      <div className="dark flex min-h-screen items-center justify-center bg-ink">
        <div className="gl-skeleton h-6 w-40" role="status" aria-label="Checking your session" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="dark flex min-h-screen items-center justify-center bg-ink px-6">
        <p className="text-[0.95rem] text-[oklch(0.8_0.014_88)]">
          Redirecting you to sign in…{" "}
          <button type="button" onClick={() => void refetch()} className="gl-link font-semibold text-gold">
            Retry
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="dark flex min-h-screen bg-ink text-[oklch(0.92_0.012_88)]">
      <div className="gl-grain" aria-hidden="true" />

      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-white/8 bg-[oklch(0.18_0.016_245)]/70 lg:flex">
        <div className="px-6 py-7 text-[oklch(0.96_0.012_88)]">
          <Link to="/" aria-label="GraceLine Answers — public site">
            <Wordmark compact />
          </Link>
          <p className="mt-3 text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[oklch(0.6_0.016_88)]">
            Counselor console
          </p>
        </div>

        <nav aria-label="Console" className="flex-1 space-y-1 px-3">
          {NAV.filter((item) => !("adminOnly" in item && item.adminOnly) || data.role === "admin").map(
            (item) => (
              <Link
                key={item.to}
                to={item.to}
                className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[0.94rem] font-medium text-[oklch(0.8_0.014_88)] transition-colors no-underline hover:bg-white/6 hover:text-[oklch(0.97_0.01_88)]"
                activeProps={{ className: "bg-gold/12 text-gold" }}
              >
                <item.icon size={17} aria-hidden="true" />
                {item.label}
              </Link>
            ),
          )}
        </nav>

        <div className="border-t border-white/8 p-4">
          <p className="truncate text-[0.9rem] font-medium text-[oklch(0.94_0.012_88)]">{data.name ?? data.email}</p>
          <p className="mt-0.5 truncate text-[0.8rem] text-[oklch(0.62_0.016_88)]">
            {data.role === "admin" ? "Administrator" : "Counselor"}
          </p>
          <button
            type="button"
            onClick={() => void signOut()}
            className="gl-btn mt-4 w-full border border-white/12 py-2 text-[0.87rem] font-medium hover:border-clay hover:text-clay"
          >
            <LogOut size={14} aria-hidden="true" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Compact top bar for phones, where the sidebar cannot fit. */}
        <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-white/8 bg-ink/92 px-4 py-3 backdrop-blur-xl lg:hidden">
          <Link to="/admin/inbox" className="text-[oklch(0.96_0.012_88)]">
            <Wordmark compact />
          </Link>
          <nav aria-label="Console" className="flex items-center gap-1">
            {NAV.filter((item) => !("adminOnly" in item && item.adminOnly) || data.role === "admin").map(
              (item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-label={item.label}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg text-[oklch(0.78_0.014_88)] transition-colors",
                    "hover:bg-white/8",
                  )}
                  activeProps={{ className: "bg-gold/14 text-gold" }}
                  >
                  <item.icon size={17} aria-hidden="true" />
                </Link>
              ),
            )}
            <button
              type="button"
              onClick={() => void signOut()}
              aria-label="Sign out"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-[oklch(0.78_0.014_88)] hover:bg-white/8"
            >
              <LogOut size={17} aria-hidden="true" />
            </button>
          </nav>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-9 lg:py-9">
          <Outlet />
        </main>

        <footer className="flex items-center gap-2 border-t border-white/8 px-4 py-4 text-[0.8rem] text-[oklch(0.58_0.016_88)] sm:px-6 lg:px-9">
          <ClipboardList size={13} aria-hidden="true" />
          Every action in this console is logged for accountability.
        </footer>
      </div>
    </div>
  );
}
