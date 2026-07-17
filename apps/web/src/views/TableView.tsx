import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Dialog } from "@base-ui/react/dialog";
import type {
  DebugOmniscientView,
  GameEventEnvelope,
  GameSnapshot,
  SeatId,
  SessionResult,
} from "@new-mj/protocol";
import { Button } from "@/components/ui/button";
import { DiscardPile, type DiscardEntry } from "@/components/mahjong/DiscardPile";
import { HandRow } from "@/components/mahjong/HandRow";
import { MeldGroup, type Meld } from "@/components/mahjong/MeldGroup";
import { PlayerBadge } from "@/components/mahjong/PlayerBadge";
import { WallStack } from "@/components/mahjong/WallStack";
import { ack } from "@/lib/socket";
import { seatAt, SEAT_DIRECTIONS, type SeatDirection } from "@/lib/seatLayout";
import { useSessionStore } from "@/store/session";
import { useTableLayoutStore } from "@/store/tableLayout";

/**
 * junk 和 bloodbattle 的 view.ts 目前都用这几个字段名（phase/myClaimOptions），
 * 但那是玩法私有约定，不是 PlayerViewBase 的静态契约——protocol 的
 * PlayerViewBaseSchema 故意用 .catchall(z.unknown()) 放行这些字段，这里按约定
 * 读取，不 import 任何 ruleset 专属类型（架构铁律 6）。
 */
type ClaimOption = { action: Record<string, unknown> };
type JunkSeatExtra = { handCount: number; melds: Meld[]; discards: DiscardEntry[] };
type ViewExtras = { phase?: string; myClaimOptions?: ClaimOption[]; seats?: JunkSeatExtra[] };

const EMPTY_SEAT: JunkSeatExtra = { handCount: 0, melds: [], discards: [] };

/** Grid unit ~= container width / 20 (mj-next's convention: 4 hand rows + gutters per side). */
const TILE_UNIT_DIVISOR = 20;

export function TableView() {
  const navigate = useNavigate();
  const socket = useSessionStore((state) => state.socket);
  const userId = useSessionStore((state) => state.userId);
  const room = useSessionStore((state) => state.room);
  const view = useSessionStore((state) => state.view);
  const setRoom = useSessionStore((state) => state.setRoom);
  const activeSocket = socket!;
  const setTileUnit = useTableLayoutStore((state) => state.setTileUnit);
  const tileUnit = useTableLayoutStore((state) => state.tileUnit);

  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sessionResult, setSessionResult] = useState<SessionResult | null>(null);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [debugView, setDebugView] = useState<DebugOmniscientView | null>(null);

  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;
    const updateUnit = () => setTileUnit(el.clientWidth / TILE_UNIT_DIVISOR);
    const observer = new ResizeObserver(updateUnit);
    observer.observe(el);
    updateUnit();
    return () => observer.disconnect();
  }, [setTileUnit]);

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
    const onSessionFinished = (message: { result: SessionResult }) =>
      setSessionResult(message.result);
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

  // Dev/test-only escape hatch (decisions.md D19, protocol-shared.md §7) —
  // raw TileIds, no tile-face rendering; server rejects unless
  // ALLOW_DEBUG_OMNISCIENT is set, so this is a no-op against a normal deploy.
  const fetchDebugOmniscientView = async () => {
    setError(null);
    const result = await ack<DebugOmniscientView>(activeSocket, "debug:omniscientView", {});
    if (!result.ok) {
      setError(result.code);
      return;
    }
    setDebugView(result.data);
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

  const seatData = (seat: SeatId): JunkSeatExtra => extras.seats?.[seat] ?? EMPTY_SEAT;
  const playerInfo = (seat: SeatId) => room?.players[seat];
  const wallPerSide = Math.floor(view.wallCount / 4);

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
        <div className="text-sm">
          <p>Session finished: {JSON.stringify(sessionResult)}</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {Array.from({ length: sessionResult.gamesPlayed }, (_, index) => index + 1).map(
              (gameNumber) => (
                <Link
                  key={gameNumber}
                  to={`/replay/${room?.id}/${gameNumber}`}
                  className="underline"
                >
                  Replay game {gameNumber}
                </Link>
              ),
            )}
          </div>
        </div>
      )}

      {/* Three nested grids (outer=hands, middle=wall stacks, inner=discards+melds),
          mirroring the mj-next reference layout. tileUnit === 0 means the
          ResizeObserver hasn't measured yet — skip rendering to avoid a frame of
          zero-sized tiles. */}
      <div
        ref={tableRef}
        className="mx-auto grid aspect-square w-full max-w-3xl min-w-[320px] grid-cols-[10%_1fr_10%] grid-rows-[10%_1fr_10%] overflow-hidden rounded-lg bg-green-800 ring-2 ring-border dark:bg-green-950"
      >
        {tileUnit > 0 &&
          SEAT_DIRECTIONS.map((direction) => {
            const seat = seatAt(view.seat, direction);
            const data = seatData(seat);
            const player = playerInfo(seat);
            const isBottom = direction === "bottom";
            const gridArea: Record<SeatDirection, string> = {
              top: "col-start-2 row-start-1",
              left: "col-start-1 row-start-2",
              right: "col-start-3 row-start-2",
              bottom: "col-start-2 row-start-3",
            };
            const badge = (
              <PlayerBadge
                nickname={player?.nickname ?? `Seat ${seat}`}
                handCount={data.handCount}
                isCurrentTurn={view.currentSeat === seat}
                isBot={player?.isBot ?? false}
                isSelf={seat === view.seat}
              />
            );
            const hand = (
              <HandRow
                direction={direction}
                hand={isBottom ? view.hand : undefined}
                handCount={data.handCount}
                interactive={isBottom && isMyTurn}
                onDiscard={(tile) => void sendAction({ type: "discard", tile })}
              />
            );
            // Badge sits on the outer edge, hand tiles sit closer to the wall.
            return (
              <div
                key={direction}
                className={`flex items-center justify-center gap-1 overflow-hidden ${gridArea[direction]} ${direction === "top" || direction === "bottom" ? "flex-col" : "flex-row"}`}
              >
                {direction === "top" || direction === "left" ? (
                  <>
                    {badge}
                    {hand}
                  </>
                ) : (
                  <>
                    {hand}
                    {badge}
                  </>
                )}
              </div>
            );
          })}

        <div className="col-start-2 row-start-2 grid grid-cols-[13%_1fr_13%] grid-rows-[13%_1fr_13%] overflow-hidden">
          {SEAT_DIRECTIONS.map((direction) => {
            const gridArea: Record<SeatDirection, string> = {
              top: "col-start-2 row-start-1",
              left: "col-start-1 row-start-2",
              right: "col-start-3 row-start-2",
              bottom: "col-start-2 row-start-3",
            };
            return (
              <div
                key={direction}
                className={`flex items-center justify-center overflow-hidden ${gridArea[direction]}`}
              >
                <WallStack direction={direction} count={wallPerSide} />
              </div>
            );
          })}

          <div className="col-start-2 row-start-2 grid grid-cols-[15%_1fr_15%] grid-rows-[15%_1fr_15%] overflow-hidden">
            {SEAT_DIRECTIONS.map((direction) => {
              const seat = seatAt(view.seat, direction);
              const data = seatData(seat);
              const gridArea: Record<SeatDirection, string> = {
                top: "col-start-2 row-start-1",
                left: "col-start-1 row-start-2",
                right: "col-start-3 row-start-2",
                bottom: "col-start-2 row-start-3",
              };
              return (
                <div
                  key={direction}
                  className={`flex items-center justify-center gap-1 overflow-hidden ${gridArea[direction]} ${direction === "top" || direction === "bottom" ? "flex-col" : "flex-row"}`}
                >
                  <MeldGroup direction={direction} melds={data.melds} />
                  <DiscardPile direction={direction} discards={data.discards} />
                </div>
              );
            })}

            <div className="col-start-2 row-start-2 flex flex-col items-center justify-center gap-2 overflow-auto bg-background/90 p-2 text-center text-xs">
              <p>
                Phase: {extras.phase ?? "unknown"} | Turn: seat {view.currentSeat} | Wall:{" "}
                {view.wallCount}
              </p>
              {claimOptions.length > 0 && (
                <div className="flex flex-wrap justify-center gap-1">
                  {claimOptions.map((option, index) => (
                    <Button key={index} size="sm" onClick={() => void sendAction(option.action)}>
                      {String(option.action["type"])}
                    </Button>
                  ))}
                </div>
              )}
              {error && <p className="text-destructive">{error}</p>}
            </div>
          </div>
        </div>
      </div>

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

      {import.meta.env.DEV && (
        <div>
          <h2 className="text-sm font-medium">Debug: omniscient view (dev-only)</h2>
          <Button variant="outline" size="sm" onClick={() => void fetchDebugOmniscientView()}>
            Show all hands + wall
          </Button>
          {debugView && (
            <pre className="mt-2 max-w-full overflow-x-auto text-xs text-muted-foreground">
              {JSON.stringify(debugView, null, 2)}
            </pre>
          )}
        </div>
      )}

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
