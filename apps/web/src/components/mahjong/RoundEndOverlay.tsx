import type { RoomInfo } from "@new-mj/protocol";
import { Button } from "@/components/ui/button";

/**
 * junk's `JunkGameResult` shape (packages/core/src/rulesets/junk/types.ts),
 * read loosely off `view.result` the same way TableView reads `phase`/
 * `myClaimOptions` — not imported from @new-mj/core (architecture rule 6).
 */
type GameResultLike =
  | { type: "draw"; scoreDeltas: [number, number, number, number] }
  | {
      type: "win";
      winner: number;
      winners: number[];
      winType: "zimo" | "ron";
      from?: number;
      scoreDeltas: [number, number, number, number];
    };

interface RoundEndOverlayProps {
  result: GameResultLike;
  gameNumber: number;
  totalGames: number;
  players: RoomInfo["players"];
  myConfirmed: boolean;
  onConfirm: () => void;
}

const describeResult = (result: GameResultLike, players: RoomInfo["players"]): string => {
  const nameOf = (seat: number) => players[seat]?.nickname ?? `Seat ${seat + 1}`;
  if (result.type === "draw") return "Round drawn — the wall ran out.";
  const winners = result.winners.map(nameOf).join(", ");
  return result.winType === "zimo"
    ? `${winners} won by self-draw.`
    : `${winners} won off ${nameOf(result.from!)}'s discard.`;
};

/**
 * Shown while `RoomService.awaitingNextRound` is true (docs/contracts/
 * session-mechanics.md §6 局间确认) — every real seat must confirm via the
 * existing room:ready before the server deals the next game.
 */
export function RoundEndOverlay({
  result,
  gameNumber,
  totalGames,
  players,
  myConfirmed,
  onConfirm,
}: RoundEndOverlayProps) {
  const waitingOn = players
    .map((player, seat) => ({ player, seat }))
    .filter(({ player }) => player && !player.isBot && player.isReady !== true)
    .map(({ player, seat }) => player?.nickname ?? `Seat ${seat + 1}`);

  return (
    <div
      data-testid="round-end-overlay"
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="flex w-full max-w-sm flex-col gap-3 rounded-xl border bg-background p-5 text-center shadow-xl">
        <h2 className="text-lg font-semibold">
          Game {gameNumber} of {totalGames} finished
        </h2>
        <p className="text-sm">{describeResult(result, players)}</p>
        <ul className="text-sm text-muted-foreground">
          {result.scoreDeltas.map((delta, seat) => (
            <li key={seat}>
              {players[seat]?.nickname ?? `Seat ${seat + 1}`}: {delta >= 0 ? "+" : ""}
              {delta}
            </li>
          ))}
        </ul>
        {myConfirmed ? (
          <p className="text-sm text-muted-foreground">
            {waitingOn.length > 0
              ? `Waiting for: ${waitingOn.join(", ")}…`
              : "Starting next round…"}
          </p>
        ) : (
          <Button onClick={onConfirm}>Next round</Button>
        )}
      </div>
    </div>
  );
}
