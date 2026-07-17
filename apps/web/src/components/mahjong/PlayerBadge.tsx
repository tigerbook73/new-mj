import { cn } from "@/lib/utils";

interface PlayerBadgeProps {
  nickname: string;
  handCount: number;
  isCurrentTurn: boolean;
  isBot: boolean;
  isSelf: boolean;
}

export function PlayerBadge({
  nickname,
  handCount,
  isCurrentTurn,
  isBot,
  isSelf,
}: PlayerBadgeProps) {
  return (
    <div
      data-testid="player-badge"
      className={cn(
        "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
        isCurrentTurn ? "border-primary bg-primary/10 font-medium" : "border-border bg-background",
      )}
    >
      <span>
        {nickname}
        {isSelf ? " (you)" : ""}
        {isBot ? " · BOT" : ""}
      </span>
      <span className="text-muted-foreground" data-testid="player-hand-count">
        {handCount}
      </span>
    </div>
  );
}
