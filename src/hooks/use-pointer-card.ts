import { useCallback, useRef } from "react";

/**
 * Cursor-tracked highlight for interactive cards.
 *
 * Writes two CSS custom properties on the element instead of React state, so
 * moving the pointer never triggers a render. Only ever attached on devices
 * that report a fine pointer, and the CSS keeps the effect inside a
 * `(hover: hover)` query so touch users never see a stuck highlight.
 */
export function usePointerCard<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);

  const onPointerMove = useCallback((event: { clientX: number; clientY: number }) => {
    const element = ref.current;
    if (!element) return;
    if (typeof window === "undefined" || !window.matchMedia?.("(hover: hover)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const rect = element.getBoundingClientRect();
    element.style.setProperty("--mx", `${event.clientX - rect.left}px`);
    element.style.setProperty("--my", `${event.clientY - rect.top}px`);
  }, []);

  return { ref, onPointerMove };
}
