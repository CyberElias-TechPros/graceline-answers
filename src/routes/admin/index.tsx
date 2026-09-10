import { createFileRoute, redirect } from "@tanstack/react-router";

/** /admin is an alias for the inbox; there is no landing page to render. */
export const Route = createFileRoute("/admin/")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/inbox" });
  },
  component: () => null,
});
