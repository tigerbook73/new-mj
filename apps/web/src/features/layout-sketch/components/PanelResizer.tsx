import type { HTMLAttributes } from "react";

/** Shared pointer-capture handle for horizontal panel splits in Layout Lab. */
export function HorizontalPanelResizer({
  label,
  testId,
  onResize,
  className,
}: {
  label: string;
  testId: string;
  onResize: (clientY: number) => void;
  className?: HTMLAttributes<HTMLDivElement>["className"];
}) {
  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation="horizontal"
      data-testid={testId}
      className={`h-2 cursor-row-resize touch-none bg-transparent hover:bg-amber-400/40 ${className ?? ""}`}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        onResize(event.clientY);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) onResize(event.clientY);
      }}
    />
  );
}
