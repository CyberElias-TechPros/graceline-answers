import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { Wordmark } from "./wordmark";
import { cn } from "../lib/utils";

const NAV = [
  { to: "/ask", label: "Ask" },
  { to: "/archive", label: "Archive" },
  { to: "/prayer", label: "Prayer wall" },
  { to: "/about", label: "About" },
] as const;

/**
 * Site header.
 *
 * Condenses and gains a backdrop once the hero scrolls past, so it never covers
 * the opening composition but is always one tap away. The mobile menu is a real
 * disclosure with aria-expanded and focus kept inside the document flow.
 */
export function SiteHeader({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const dark = tone === "dark";

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-[background-color,box-shadow,backdrop-filter] duration-300",
        scrolled
          ? dark
            ? "bg-ink/88 shadow-[var(--shadow-lift)] backdrop-blur-xl"
            : "bg-background/88 shadow-[var(--shadow-lift)] backdrop-blur-xl"
          : "bg-transparent",
      )}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-gold focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-[oklch(0.22_0.05_70)]"
      >
        Skip to content
      </a>

      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-5 sm:h-[4.5rem] sm:px-8">
        <Link
          to="/"
          onClick={() => setOpen(false)}
          className={cn(
            "rounded-lg transition-opacity hover:opacity-80",
            dark ? "text-[oklch(0.96_0.012_88)]" : "text-foreground",
          )}
          aria-label="GraceLine Answers — home"
        >
          <Wordmark />
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "gl-link rounded-md px-3 py-2 text-[0.93rem] font-medium transition-colors",
                dark
                  ? "text-[oklch(0.86_0.014_88)] hover:text-[oklch(0.97_0.01_88)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
              activeProps={{ className: dark ? "text-gold" : "text-gold-deep" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            to="/ask"
            className="gl-btn hidden bg-gold px-5 py-2.5 text-[0.9rem] font-semibold text-[oklch(0.22_0.05_70)] shadow-[var(--shadow-lift)] hover:bg-gold/92 sm:inline-flex"
          >
            Ask a question
          </Link>

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            className={cn(
              "gl-btn h-10 w-10 border border-current/15 p-0 md:hidden",
              dark ? "text-[oklch(0.94_0.012_88)]" : "text-foreground",
            )}
          >
            {open ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
          </button>
        </div>
      </div>

      <nav
        id="mobile-nav"
        aria-label="Mobile"
        hidden={!open}
        className={cn(
          "border-t border-current/10 px-5 pb-6 pt-3 md:hidden",
          dark ? "bg-ink/96 text-[oklch(0.94_0.012_88)] backdrop-blur-xl" : "bg-background/96 backdrop-blur-xl",
        )}
      >
        {NAV.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            onClick={() => setOpen(false)}
            className="block border-b border-current/8 py-3.5 text-[1.05rem] font-medium last:border-0"
          >
            {item.label}
          </Link>
        ))}
        <Link
          to="/ask"
          onClick={() => setOpen(false)}
          className="gl-btn mt-5 w-full bg-gold py-3 font-semibold text-[oklch(0.22_0.05_70)]"
        >
          Ask a question
        </Link>
      </nav>
    </header>
  );
}
