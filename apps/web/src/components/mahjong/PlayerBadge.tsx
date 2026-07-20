import { cn } from "@/lib/utils";

interface PlayerBadgeProps {
  nickname: string;
  handCount: number;
  isCurrentTurn: boolean;
  isBot: boolean;
  isSelf: boolean;
  isDealer?: boolean;
  score?: number | undefined;
  direction?: string | undefined;
  avatar?: string | undefined;
  isDisconnected?: boolean | undefined;
  isAutoPiloted?: boolean | undefined;
}

export function PlayerBadge({
  nickname,
  handCount,
  isCurrentTurn,
  isBot,
  isSelf,
  isDealer = false,
  score,
  direction,
  avatar,
  isDisconnected = false,
  isAutoPiloted = false,
}: PlayerBadgeProps) {
  return (
    <div
      data-testid="player-badge"
      data-seat-direction={direction}
      className={cn(
        "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
        isCurrentTurn ? "border-primary bg-primary/10 font-medium" : "border-border bg-background",
      )}
    >
      {avatar ? (
        <img src={avatar} alt="" className="size-5 rounded-full" />
      ) : (
        <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[10px]">
          {nickname.slice(0, 2).toUpperCase()}
        </span>
      )}
      <span>
        {nickname}
        {isSelf ? " (you)" : ""}
        {isDealer ? " · DEALER" : ""}
        {isBot ? " · BOT" : ""}
        {isDisconnected ? " · DISCONNECTED" : isAutoPiloted ? " · AI" : ""}
      </span>
      <span className="text-muted-foreground" data-testid="player-hand-count">
        {handCount}
      </span>
      {score !== undefined && <span className="text-muted-foreground">· {score}</span>}
    </div>
  );
}
