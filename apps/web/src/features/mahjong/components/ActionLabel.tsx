import type { CSSProperties } from "react";
import { cn } from "@/shared/lib/utils";

interface ActionLabelProps {
  text: string;
  className?: string;
  style?: CSSProperties;
}

// Fixed regardless of character count — this is what pins the rendered font
// size to the caller's box height alone, see below.
const VIEW_HEIGHT = 100;
const FONT_SIZE = 60;
// Full-width (CJK) glyphs advance ≈ 1em; estimating slightly over 1em means
// we only ever over-pad, never clip a real render.
const CHAR_ADVANCE = FONT_SIZE * 1.05;
const SIDE_PADDING = FONT_SIZE * 0.3;

/**
 * Renders text as SVG so its size scales with the element's own box height
 * (via viewBox) instead of CSS font-size, which has no percentage-of-own-
 * height syntax. Only `height` is caller-controlled (`width: auto` lets the
 * browser derive width from the viewBox's own aspect ratio, like a
 * replaced element) — so the rendered font size only ever depends on the
 * caller's height, identical across 1-, 2-, and 3-character labels; the
 * caller never needs to guess or sync a width ratio. Sizing is set via
 * inline `style`, not a Tailwind class, because `shared/ui/button.tsx`
 * force-applies `size-4` to any descendant `<svg>` whose class doesn't
 * itself contain "size-" — inline styles beat that class regardless of
 * cascade order. `aria-hidden` because the accessible name comes from the
 * caller's own `aria-label` — see ActionDock.tsx.
 */
export function ActionLabel({ text, className, style }: ActionLabelProps) {
  const viewWidth = Math.max(VIEW_HEIGHT, text.length * CHAR_ADVANCE + SIDE_PADDING * 2);
  return (
    <svg
      viewBox={`0 0 ${viewWidth} ${VIEW_HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      className={cn("block", className)}
      style={{ height: "100%", width: "auto", ...style }}
    >
      <text
        x={viewWidth / 2}
        y={VIEW_HEIGHT / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={FONT_SIZE}
        fill="currentColor"
      >
        {text}
      </text>
    </svg>
  );
}
