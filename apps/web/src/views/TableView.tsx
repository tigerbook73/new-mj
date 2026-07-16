import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Dialog } from "@base-ui/react/dialog";
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
  const navigate = useNavigate();
  const socket = useSessionStore((state) => state.socket);
  const userId = useSessionStore((state) => state.userId);
  const room = useSessionStore((state) => state.room);
  const view = useSessionStore((state) => state.view);
  const setRoom = useSessionStore((state) => state.setRoom);
  const activeSocket = socket!;

  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sessionResult, setSessionResult] = useState<unknown>(null);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);

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
    const onClosed = ({ reason }: { reason: string }) => {
      const notice =
        reason === "hostLeft" ? "The owner closed this room." : "This room was closed.";
      setRoom(null);
      void navigate("/games", { state: { notice } });
    };

    activeSocket.on("game:snapshot", onSnapshot);
    activeSocket.on("game:event", onEvent);
    activeSocket.on("room:sessionFinished", onSessionFinished);
    activeSocket.on("room:closed", onClosed);
    return () => {
      activeSocket.off("game:snapshot", onSnapshot);
      activeSocket.off("game:event", onEvent);
      activeSocket.off("room:sessionFinished", onSessionFinished);
      activeSocket.off("room:closed", onClosed);
    };
  }, [activeSocket, navigate, setRoom]);

  const sendAction = async (action: unknown) => {
    setError(null);
    const result = await ack(activeSocket, "game:action", { action });
    if (!result.ok) {
      setError(result.code);
    }
  };

  const leave = async () => {
    setError(null);
    const result = await ack(activeSocket, "room:leave", {});
    if (!result.ok) {
      setError(result.code);
      return;
    }
    setRoom(null);
    void navigate("/games");
  };

  if (!view) {
    return <div className="p-6">Waiting for game data…</div>;
  }

  const extras = view as unknown as ViewExtras;
  const isMyTurn = view.currentSeat === view.seat && extras.phase === "playing";
  const claimOptions = extras.myClaimOptions ?? [];
  const isOwner = room?.ownerUserId === userId;
  const hasOtherPlayers = room?.players.some(
    (player, seat) => player !== null && seat !== view.seat,
  );

  return (
    <div className="flex min-h-screen flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-4 pr-20">
        <h1 className="text-lg font-medium">Table (Seat {view.seat})</h1>
        <Button
          variant="outline"
          onClick={() => {
            if (isOwner && hasOtherPlayers) setLeaveConfirmOpen(true);
            else void leave();
          }}
        >
          Leave room
        </Button>
      </div>
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

      <Dialog.Root open={leaveConfirmOpen} onOpenChange={setLeaveConfirmOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex w-96 max-w-[calc(100vw-3rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 rounded-xl border bg-background p-6 shadow-xl">
            <Dialog.Title className="text-lg font-semibold">Leave room?</Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground">
              Other players are still in this room. Are you sure you want to leave?
            </Dialog.Description>
            <div className="flex justify-end gap-2">
              <Dialog.Close render={<Button variant="outline">Cancel</Button>} />
              <Button
                variant="destructive"
                onClick={() => {
                  setLeaveConfirmOpen(false);
                  void leave();
                }}
              >
                Leave room
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

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
