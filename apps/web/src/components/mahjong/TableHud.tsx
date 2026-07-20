import { Button } from "@/components/ui/button";

interface TableHudProps {
  roomName: string;
  seat: number;
  gameNumber: number;
  totalGames: number;
  dealer: number;
  scores: readonly number[];
  onLeave: () => void;
}

export function TableHud({
  roomName,
  seat,
  gameNumber,
  totalGames,
  dealer,
  scores,
  onLeave,
}: TableHudProps) {
  return (
    <header
      data-testid="table-hud"
      className="flex min-h-12 items-center justify-between gap-4 border-b bg-background/95 px-5 py-2 pr-24 backdrop-blur"
    >
      <div className="min-w-0">
        <h1 className="truncate text-sm font-semibold">{roomName}</h1>
        <p className="text-xs text-muted-foreground">
          Seat {seat + 1} · Game {gameNumber}/{totalGames} · Dealer {dealer + 1}
        </p>
      </div>
      <div className="flex items-center gap-5">
        <ol className="flex gap-3 text-xs" aria-label="Scores">
          {scores.map((score, index) => (
            <li key={index} className={index === dealer ? "font-semibold" : undefined}>
              S{index + 1} {score}
            </li>
          ))}
        </ol>
        <Button variant="outline" size="sm" onClick={onLeave}>
          Leave room
        </Button>
      </div>
    </header>
  );
}
