import type { CSSProperties, ElementType, ReactNode } from "react";
import { useReveal } from "../hooks/use-reveal";
import { cn } from "../lib/utils";

/**
 * Scroll-reveal wrapper.
 *
 * `as` lets a heading or list item reveal without introducing an extra wrapper
 * element that would break the document outline.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
  variant = "fade",
  ...rest
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: ElementType;
  variant?: "fade" | "line";
} & Record<string, unknown>) {
  const { ref, visible } = useReveal<HTMLDivElement>();
  const style = { "--reveal-delay": `${delay}ms` } as CSSProperties;

  return (
    <Tag
      ref={ref}
      style={style}
      className={cn(variant === "line" ? "gl-line-mask" : "gl-reveal", visible && "gl-reveal-in", className)}
      {...rest}
    >
      {variant === "line" ? <span>{children}</span> : children}
    </Tag>
  );
}
