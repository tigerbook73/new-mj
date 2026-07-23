import type { ReactNode } from "react";
import type { SeatDirection } from "@/lib/seatLayout";

/** Owns the local containing block; leaf services render its child Zones. */
export function MeldInfoTrack({
  direction,
  testId,
  contentTestId,
  children,
}: {
  direction: SeatDirection;
  testId?: string;
  contentTestId?: string;
  children: ReactNode;
}) {
  return (
    <div data-testid={testId ?? `meld-info-track-${direction}`} className="relative h-full w-full">
      <div
        data-testid={contentTestId ?? "meld-info-content"}
        className="relative h-full w-full"
        style={{ boxSizing: "border-box" }}
      >
        {children}
      </div>
    </div>
  );
}
