import { Outlet, createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "../components/site-header";
import { SiteFooter } from "../components/site-footer";

/**
 * Public site shell.
 *
 * Every indexable page renders through here, so the header, the footer's
 * internal links and the document outline are identical across the site —
 * which is also what makes the archive's category pages reachable from
 * anywhere in one hop.
 */
export const Route = createFileRoute("/_public")({
  component: PublicLayout,
});

function PublicLayout() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <SiteFooter />
    </>
  );
}
