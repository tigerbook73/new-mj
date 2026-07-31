import { ScaleText } from "./ScaleText";

interface CenterStatusProps {
  phase: string;
  currentSeat: number;
  wallCount: number;
  error?: string | null;
}

export function CenterStatus({ phase, currentSeat, wallCount, error }: CenterStatusProps) {
  return (
    <section
      data-testid="table-center-status"
      className="flex min-h-0 flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border bg-background/90 p-2 text-center text-xs shadow-sm"
    >
      <ScaleText text={`Phase: ${phase}`} className="h-4 w-full" />
      <ScaleText
        text={`Turn: seat ${currentSeat + 1} · Wall: ${wallCount}`}
        className="h-4 w-full"
      />
      {error && <ScaleText text={error} className="h-4 w-full text-destructive" />}
    </section>
  );
}
