import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

// Self-hosted: no third-party font request, no render-blocking cross-origin
// fetch, and no visitor data leaving for a font CDN.
import "@fontsource-variable/fraunces/soft.css";
import "@fontsource-variable/karla";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { jsonLd, organizationJsonLd, websiteJsonLd } from "../lib/seo";
import { SITE_URL } from "../lib/api";
import { DEFAULT_DESCRIPTION, SITE_NAME } from "../../shared/site";

function NotFoundComponent() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <p className="font-display text-[5rem] font-semibold leading-none text-gold-deep opacity-80">404</p>
      <h1 className="mt-4 text-[1.7rem] font-semibold text-foreground">This page has moved on</h1>
      <p className="mt-3 max-w-md text-[1rem] leading-relaxed text-muted-foreground">
        The link may be out of date. The archive is the best place to pick up a thread.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link to="/" className="gl-btn bg-primary px-5 py-2.5 text-[0.95rem] font-semibold text-primary-foreground">
          Back to the beginning
        </Link>
        <Link to="/archive" className="gl-btn border border-border px-5 py-2.5 text-[0.95rem] font-semibold">
          Browse answered questions
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    const err = error instanceof Error ? error : new Error(String(error));
    reportLovableError(err, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <h1 className="text-[1.6rem] font-semibold text-foreground">This page did not load</h1>
      <p className="mt-3 max-w-md text-[0.98rem] leading-relaxed text-muted-foreground">
        Something went wrong on our side. Nothing you wrote has been lost — please try again.
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="gl-btn bg-primary px-5 py-2.5 text-[0.95rem] font-semibold text-primary-foreground"
        >
          Try again
        </button>
        <Link to="/" className="gl-btn border border-border px-5 py-2.5 text-[0.95rem] font-semibold">
          Go home
        </Link>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#101a24" },
      { title: `${SITE_NAME} — Anonymous Bible Q&A and Christian Counseling` },
      { name: "description", content: DEFAULT_DESCRIPTION },
      { name: "format-detection", content: "telephone=no" },
      { property: "og:site_name", content: SITE_NAME },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "en_GB" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/site.webmanifest" },
      {
        rel: "alternate",
        type: "application/rss+xml",
        title: `${SITE_NAME} — recent answers`,
        href: `${SITE_URL}/feed.xml`,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        {/* Site-wide entities. Emitted in the server render so a crawler sees the
            organisation and website nodes without executing JavaScript. */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(organizationJsonLd()) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(websiteJsonLd()) }} />
      </head>
      <body className="flex min-h-screen flex-col antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}
