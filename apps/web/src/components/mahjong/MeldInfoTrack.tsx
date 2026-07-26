import type { ReactNode } from "react";
import type { SeatDirection } from "@/lib/seatLayout";

/** Owns the local containing block; leaf services render its child Zones. */
export function MeldInfoTrack({
  direction,
  children,
}: {
  direction: SeatDirection;
  children: ReactNode;
}) {
  return (
    <div data-testid={`meld-info-track-${direction}`} className="relative h-full w-full">
      {children}
    </div>
  );
}
