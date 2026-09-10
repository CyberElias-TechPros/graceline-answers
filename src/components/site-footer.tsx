import { Link } from "@tanstack/react-router";
import { Wordmark } from "./wordmark";
import { THERAPY_DISCLAIMER } from "../../shared/site";

/**
 * Site footer.
 *
 * Also the internal-linking backbone: every indexable section is reachable from
 * here in one hop, which keeps no public page orphaned.
 */
export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="gl-no-print relative mt-auto overflow-hidden bg-ink text-[oklch(0.9_0.012_88)]">
      <div className="gl-grain" aria-hidden="true" />
      <div className="relative mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div>
            <div className="text-[oklch(0.96_0.012_88)]">
              <Wordmark />
            </div>
            <p className="mt-5 max-w-xs text-[0.93rem] leading-relaxed text-[oklch(0.75_0.016_88)]">
              Anonymous Bible Q&amp;A and faith-centered Christian counseling. Every question is
              read by a real person.
            </p>
            <p className="mt-4 max-w-xs text-[0.82rem] leading-relaxed text-[oklch(0.62_0.016_88)]">
              {THERAPY_DISCLAIMER}
            </p>
          </div>

          <FooterColumn
            heading="Explore"
            links={[
              { to: "/ask", label: "Ask a question" },
              { to: "/archive", label: "Answered archive" },
              { to: "/prayer", label: "Prayer wall" },
              { to: "/about", label: "About GraceLine" },
            ]}
          />

          <FooterColumn
            heading="Topics"
            links={[
              { to: "/archive/category/anxiety", label: "Anxiety" },
              { to: "/archive/category/faith-crisis", label: "Faith crisis" },
              { to: "/archive/category/marriage", label: "Marriage" },
              { to: "/archive/category/bible-interpretation", label: "Bible interpretation" },
            ]}
          />

          <FooterColumn
            heading="Trust"
            links={[
              { to: "/privacy", label: "Privacy promise" },
              { to: "/about", label: "How we work" },
              { to: "/admin/login", label: "Counselor sign in" },
            ]}
          />
        </div>

        <div className="gl-rule mt-14" aria-hidden="true" />

        <div className="mt-6 flex flex-col gap-2 text-[0.82rem] text-[oklch(0.62_0.016_88)] sm:flex-row sm:items-center sm:justify-between">
          <span>
            © {year} GraceLine Answers. Rooted in grace, offered in truth.
          </span>
          <a href="/feed.xml" className="gl-link hover:text-gold">
            Recent answers (RSS)
          </a>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ heading, links }: { heading: string; links: { to: string; label: string }[] }) {
  return (
    <nav aria-label={heading}>
      <h2 className="font-sans text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-gold">
        {heading}
      </h2>
      <ul className="mt-4 space-y-2.5">
        {links.map((link) => (
          <li key={link.to + link.label}>
            <Link
              to={link.to}
              className="gl-link text-[0.93rem] text-[oklch(0.8_0.014_88)] hover:text-[oklch(0.96_0.012_88)]"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
