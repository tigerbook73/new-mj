import type { ReactNode } from "react";

interface CenterStatusProps {
  phase: string;
  currentSeat: number;
  wallCount: number;
  actions?: ReactNode;
  error?: string | null;
}

export function CenterStatus({ phase, currentSeat, wallCount, actions, error }: CenterStatusProps) {
  return (
    <section
      data-testid="table-center-status"
      className="flex min-h-0 flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border bg-background/90 p-2 text-center text-xs shadow-sm"
    >
      <p>Phase: {phase}</p>
      <p>
        Turn: seat {currentSeat + 1} · Wall: {wallCount}
      </p>
      {actions}
      {error && <p className="text-destructive">{error}</p>}
    </section>
  );
}
