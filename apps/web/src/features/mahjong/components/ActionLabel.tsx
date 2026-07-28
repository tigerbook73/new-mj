import { cn } from "@/shared/lib/utils";

interface ActionLabelProps {
  text: string;
  className?: string;
}

/**
 * Renders text as SVG so its size scales with the element's own box (via
 * viewBox) instead of CSS font-size, which has no percentage-of-own-height
 * syntax. `aria-hidden` because the accessible name comes from the caller's
 * own `aria-label` — see ActionDock.tsx.
 */
export function ActionLabel({ text, className }: ActionLabelProps) {
  const viewBoxWidth = text.length >= 2 ? 140 : 100;
  return (
    <svg
      viewBox={`0 0 ${viewBoxWidth} 100`}
      aria-hidden="true"
      className={cn("block size-full", className)}
    >
      <text
        x={viewBoxWidth / 2}
        y="50"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="60"
        fill="currentColor"
      >
        {text}
      </text>
    </svg>
  );
}
