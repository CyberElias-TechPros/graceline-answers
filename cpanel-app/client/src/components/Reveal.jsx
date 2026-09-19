import { useRef } from 'react';
import { useReveal } from '../lib/motion';

/**
 * Scroll-reveal wrapper.
 *   <Reveal variant="up" delay={120}>…</Reveal>
 * variants: up | fade | left | right | zoom
 */
export default function Reveal({
  as: Tag = 'div',
  variant = 'up',
  delay = 0,
  className = '',
  children,
  ...rest
}) {
  const ref = useRef(null);
  useReveal(ref);
  return (
    <Tag
      ref={ref}
      data-reveal={variant}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={className || undefined}
      {...rest}
    >
      {children}
    </Tag>
  );
}
