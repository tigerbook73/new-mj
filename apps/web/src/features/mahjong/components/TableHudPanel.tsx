import { BookOpen } from "lucide-react";
import type { Player } from "@new-mj/protocol";
import { Button } from "@/shared/ui/button";
import { Separator } from "@/shared/ui/separator";
import { initials, rulesetLabel } from "@/shared/lib/playerDisplay";

export interface TableHudPanelProps {
  rulesetId: string;
  roomName: string;
  gameNumber: number;
  totalGames: number;
  dealer: number;
  scores: readonly number[];
  players: readonly (Player | null)[];
  onLeave: () => void;
}

/** Pure content of the sidebar — kept apart from TableHud's Dialog shell so it stays
 * testable via static markup (this repo's component tests don't simulate interaction). */
export function TableHudPanel({
  rulesetId,
  roomName,
  gameNumber,
  totalGames,
  dealer,
  scores,
  players,
  onLeave,
}: TableHudPanelProps) {
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">
          {rulesetLabel(rulesetId)} · {roomName}
        </p>
        <p className="text-xs text-muted-foreground">
          Game {gameNumber}/{totalGames}
        </p>
      </div>

      <Separator />

      <ol className="flex flex-col gap-3">
        {players.map((player, seat) => (
          <li key={seat} className="flex items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-background bg-muted">
              {player?.avatar ? (
                <img src={player.avatar} alt="" className="size-full rounded-full object-cover" />
              ) : (
                <span className="text-xs font-semibold">
                  {initials(player?.nickname ?? `S${seat + 1}`)}
                </span>
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">
                {player?.nickname ?? `Seat ${seat + 1}`}
                {seat === dealer ? " · Dealer" : ""}
              </p>
              <p className="text-xs text-muted-foreground">{scores[seat] ?? 0} points</p>
            </div>
          </li>
        ))}
      </ol>

      <Separator />

      {/* Reserved for the ruleset rules page — link target TBD, not wired up yet. */}
      <div
        aria-disabled="true"
        className="flex cursor-not-allowed items-center gap-2 text-sm text-muted-foreground/60"
      >
        <BookOpen className="size-4" />
        <span>玩法规则</span>
      </div>

      <div className="mt-auto">
        <Button variant="outline" onClick={onLeave} className="w-full">
          Leave room
        </Button>
      </div>
    </div>
  );
}
