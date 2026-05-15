// agentcard wordmark. Rendered as a CSS mask over the current text color
// so it inherits whatever `color` the parent sets — light on dark surfaces,
// dark on light surfaces, a single accent for emphasis, etc. No inline
// SVG, no children, no theme branching. Just set `color:` on the parent.
//
// Chrome's SVG rendering can blur subpixel edges on hidpi displays. We
// force crisp edges via `image-rendering: crisp-edges` on webkit and the
// mask mode mask-repeat: no-repeat / mask-size: contain combo locks the
// aspect so it doesn't skew during layout.
//
// Two variants:
//   <Wordmark />    — full horizontal lockup (globe + "agentcard")
//   <Wordmark mark /> — just the globemark, useful for tight nav bars
//
// Props:
//   height — vertical size in px (default 28). Width auto-scales.
//   className — forwarded to the span for layout.

import type { CSSProperties } from 'react';



interface Props {
  height?: number;
  mark?: boolean;
  title?: string;
  className?: string;
  style?: CSSProperties;
}

export function Wordmark({
  height = 28,
  mark = false,
  title = 'agentcard',
  className,
  style,
}: Props) {
  if (mark) {
    return (
      <span
        role="img"
        aria-label={title}
        className={className}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: height,
          height: height,
          borderRadius: '2px',
          background: 'var(--accent)',
          color: 'white',
          fontFamily: 'var(--font-display)',
          fontSize: height * 0.7,
          fontWeight: 700,
          ...style,
        }}
      >
        A
      </span>
    );
  }

  return (
    <span
      aria-label={title}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontFamily: 'var(--font-display)',
        fontSize: height * 0.9,
        fontWeight: 500,
        letterSpacing: '-0.02em',
        background: 'linear-gradient(180deg, #ffffff 0%, #a1a1a1 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        filter: 'drop-shadow(0 0 8px rgba(255, 255, 255, 0.15))',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      AgentCard
    </span>
  );
}
