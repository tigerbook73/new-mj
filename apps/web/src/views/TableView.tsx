import { useEffect, useState } from "react";
import type { GameEventEnvelope, GameSnapshot, SeatId } from "@new-mj/protocol";
import { Button } from "@/components/ui/button";
import { ack } from "@/lib/socket";
import { useSessionStore } from "@/store/session";

/**
 * junk 和 bloodbattle 的 view.ts 目前都用这几个字段名（phase/myClaimOptions），
 * 但那是玩法私有约定，不是 PlayerViewBase 的静态契约——protocol 的
 * PlayerViewBaseSchema 故意用 .catchall(z.unknown()) 放行这些字段，这里按约定
 * 读取，不 import 任何 ruleset 专属类型（架构铁律 6）。
 */
type ClaimOption = { action: Record<string, unknown> };
type ViewExtras = { phase?: string; myClaimOptions?: ClaimOption[] };

export function TableView() {
  const socket = useSessionStore((state) => state.socket);
  const view = useSessionStore((state) => state.view);
  const activeSocket = socket!;

  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sessionResult, setSessionResult] = useState<unknown>(null);

  useEffect(() => {
    const onSnapshot = (event: GameSnapshot) => {
      useSessionStore.getState().setView(event.view);
    };
    // 只对"事实型"事件（谁的回合、谁打了什么牌、我能声明什么）做增量更新；
    // "规则型"事件（吃/碰/杠成立、胡牌、结算）只记日志不解释——那部分逻辑只
    // 存在于 core 里，按玩法分开实现，web 不能重新实现一遍（架构铁律 6）。画面
    // 会在下一次 game:snapshot（下一局开始）时整体对齐，见 AGENTS.md。
    const onEvent = (message: GameEventEnvelope) => {
      const payload = message.event.payload as {
        type: string;
        seat?: number;
        tile?: number;
        options?: unknown[];
      };
      setLog((prev) => [...prev.slice(-9), `#${message.event.seq} ${payload.type}`]);
      const store = useSessionStore.getState();
      switch (payload.type) {
        case "TurnStarted":
          if (typeof payload.seat === "number") {
            store.applyTurnStarted(payload.seat as SeatId);
          }
          break;
        case "TileDiscarded":
          if (typeof payload.seat === "number" && typeof payload.tile === "number") {
            store.applyTileDiscarded(payload.seat as SeatId, payload.tile);
          }
          break;
        case "ClaimWindowOpened":
          store.applyClaimWindowOpened(payload.options ?? []);
          break;
        case "ClaimWindowResolved":
          store.applyClaimWindowResolved();
          break;
        default:
          break;
      }
    };
    const onSessionFinished = (message: { result: unknown }) => setSessionResult(message.result);

    activeSocket.on("game:snapshot", onSnapshot);
    activeSocket.on("game:event", onEvent);
    activeSocket.on("room:sessionFinished", onSessionFinished);
    return () => {
      activeSocket.off("game:snapshot", onSnapshot);
      activeSocket.off("game:event", onEvent);
      activeSocket.off("room:sessionFinished", onSessionFinished);
    };
  }, [activeSocket]);

  const sendAction = async (action: unknown) => {
    setError(null);
    const result = await ack(activeSocket, "game:action", { action });
    if (!result.ok) {
      setError(result.code);
    }
  };

  if (!view) {
    return <div className="p-6">Waiting for game data…</div>;
  }

  const extras = view as unknown as ViewExtras;
  const isMyTurn = view.currentSeat === view.seat && extras.phase === "playing";
  const claimOptions = extras.myClaimOptions ?? [];

  return (
    <div className="flex min-h-screen flex-col gap-4 p-6">
      <h1 className="text-lg font-medium">Table (Seat {view.seat})</h1>
      {sessionResult != null && (
        <p className="text-sm">Session finished: {JSON.stringify(sessionResult)}</p>
      )}
      <p className="text-sm">
        Phase: {extras.phase ?? "unknown"} | Current turn: seat {view.currentSeat} | Wall remaining:{" "}
        {view.wallCount}
      </p>
      <ul className="flex gap-4 text-sm">
        {view.seats.map((seat, index) => (
          <li key={index}>
            Seat {index}: {seat.handCount} tiles{index === view.seat ? " (you)" : ""}
          </li>
        ))}
      </ul>

      <div>
        <h2 className="text-sm font-medium">Your hand</h2>
        <div className="flex flex-wrap gap-1">
          {view.hand.map((tile, index) => (
            <Button
              key={`${tile}-${index}`}
              data-testid="hand-tile"
              variant="outline"
              size="sm"
              disabled={!isMyTurn}
              onClick={() => void sendAction({ type: "discard", tile })}
            >
              {tile}
            </Button>
          ))}
        </div>
      </div>

      {claimOptions.length > 0 && (
        <div>
          <h2 className="text-sm font-medium">Claims</h2>
          <div className="flex gap-2">
            {claimOptions.map((option, index) => (
              <Button key={index} onClick={() => void sendAction(option.action)}>
                {String(option.action["type"])}
              </Button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div>
        <h2 className="text-sm font-medium">Recent events</h2>
        <ul className="text-xs text-muted-foreground">
          {log.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
