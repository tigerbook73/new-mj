import { Link } from "react-router";
import type { RoomInfo, SessionResult } from "@new-mj/protocol";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";

interface SessionFinishedPanelProps {
  sessionResult: SessionResult;
  room: RoomInfo;
  onLeave: () => void;
}

/** Ranking + replay-links overlay shown once `room:sessionFinished` fires. */
export function SessionFinishedPanel({ sessionResult, room, onLeave }: SessionFinishedPanelProps) {
  return (
    <div
      data-testid="session-finished-overlay"
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="flex w-full max-w-sm flex-col gap-3 rounded-xl border bg-background p-5 text-center shadow-xl">
        <h2 className="text-lg font-semibold">Session finished</h2>
        <p className="text-sm text-muted-foreground">
          {sessionResult.gamesPlayed} game{sessionResult.gamesPlayed === 1 ? "" : "s"} played
        </p>
        <ol className="flex flex-col gap-1 text-sm">
          {sessionResult.ranking.map((entry, index) => (
            <li
              key={entry.seatId}
              className={cn(
                "flex items-center justify-between rounded-md px-2 py-1",
                entry.seatId === sessionResult.winner && "bg-primary/10 font-semibold",
              )}
            >
              <span>
                #{index + 1} {room.players[entry.seatId]?.nickname ?? `Seat ${entry.seatId + 1}`}
                {entry.seatId === sessionResult.winner ? " \u{1F3C6}" : ""}
              </span>
              <span>{entry.score}</span>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap justify-center gap-2 text-sm">
          {Array.from({ length: sessionResult.gamesPlayed }, (_, index) => index + 1).map(
            (gameNumber) => (
              <Link key={gameNumber} to={`/replay/${room.id}/${gameNumber}`} className="underline">
                Replay game {gameNumber}
              </Link>
            ),
          )}
        </div>
        <Button variant="outline" onClick={onLeave}>
          Back to games
        </Button>
      </div>
    </div>
  );
}
