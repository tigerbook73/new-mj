import { cn } from "@/shared/lib/utils";

interface ScaleTextProps {
  text: string;
  className?: string;
}

const VIEW_WIDTH = 200;
const VIEW_HEIGHT = 60;
const FONT_SIZE = 32;
const PADDING = 10;

/**
 * Renders text as SVG, top-left aligned within a caller-sized box (both
 * axes fixed by `className`, unlike ActionLabel's height-only sizing).
 * Long content just hard-clips at the SVG's own bounds (no ellipsis): SVG2's
 * `inline-size`-driven text layout — the only spec mechanism that could add
 * a "…" here — isn't implemented by current engines (verified against
 * Chromium: the property parses and shows up in computed style, but has no
 * effect on layout at all), so there's no reliable way to render one. The
 * clip itself is free — the root `<svg>` defaults to `overflow: hidden`.
 * `aria-hidden` because the accessible name comes from the caller's own
 * `aria-label`/context, not this decorative label.
 */
export function ScaleText({ text, className }: ScaleTextProps) {
  return (
    <svg
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      className={cn("block size-full", className)}
    >
      <text
        x={PADDING}
        y={PADDING}
        textAnchor="start"
        dominantBaseline="hanging"
        fontSize={FONT_SIZE}
        fill="currentColor"
      >
        {text}
      </text>
    </svg>
  );
}
