import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Dialog } from "@base-ui/react/dialog";
import type {
  DebugOmniscientView,
  GameAdviceResponse,
  GameEventEnvelope,
  GameSnapshot,
  RoomReadyChangedEvent,
  SeatId,
  SessionResult,
} from "@new-mj/protocol";
import { Button } from "@/components/ui/button";
import { CenterStatus } from "@/components/mahjong/CenterStatus";
import type { DiscardEntry } from "@/components/mahjong/DiscardPile";
import type { Meld } from "@/components/mahjong/MeldGroup";
import { RoundEndOverlay } from "@/components/mahjong/RoundEndOverlay";
import { TableBoard, type SeatContent } from "@/components/mahjong/TableBoard";
import { TableHud } from "@/components/mahjong/TableHud";
import { ack } from "@/lib/socket";
import { directionOf, seatAt, SEAT_DIRECTIONS, type SeatDirection } from "@/lib/seatLayout";
import { useSessionStore } from "@/store/session";

/**
 * junk 和 bloodbattle 的 view.ts 目前都用这几个字段名（phase/myClaimOptions），
 * 但那是玩法私有约定，不是 PlayerViewBase 的静态契约——protocol 的
 * PlayerViewBaseSchema 故意用 .catchall(z.unknown()) 放行这些字段，这里按约定
 * 读取，不 import 任何 ruleset 专属类型（架构铁律 6）。
 */
type ClaimOption = { action: Record<string, unknown> };
type JunkSeatExtra = {
  handCount: number;
  melds: Meld[];
  discards: DiscardEntry[];
  /** Public: this seat just drew and hasn't acted yet — see docs/variants/junk.md §7. */
  justDrawn: boolean;
};
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
type ViewExtras = {
  phase?: string;
  myClaimOptions?: ClaimOption[];
  seats?: JunkSeatExtra[];
  /** Private: only present when it's my own seat's just-drawn tile. */
  justDrawn?: number;
  /** Public: the single most recent discard on the table — see docs/variants/junk.md §7. */
  lastDiscard?: { seat: SeatId; tile: number };
  /** Public: present once `phase==="finished"` — drives RoundEndOverlay below. */
  result?: GameResultLike;
};

const EMPTY_SEAT: JunkSeatExtra = { handCount: 0, melds: [], discards: [], justDrawn: false };

export function TableView() {
  const navigate = useNavigate();
  const socket = useSessionStore((state) => state.socket);
  const userId = useSessionStore((state) => state.userId);
  const room = useSessionStore((state) => state.room);
  const view = useSessionStore((state) => state.view);
  const gameSeq = useSessionStore((state) => state.gameSeq);
  const gameDeadline = useSessionStore((state) => state.gameDeadline);
  const snapshotRevision = useSessionStore((state) => state.snapshotRevision);
  const setRoom = useSessionStore((state) => state.setRoom);
  const activeSocket = socket!;

  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sessionResult, setSessionResult] = useState<SessionResult | null>(null);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [debugView, setDebugView] = useState<DebugOmniscientView | null>(null);

  useEffect(() => {
    const onSnapshot = (event: GameSnapshot) => {
      useSessionStore.getState().applyGameSnapshot(event);
    };
    const onEvent = (message: GameEventEnvelope) => {
      const payload = message.event.payload as { type: string };
      setLog((prev) => [...prev.slice(-9), `#${message.event.seq} ${payload.type}`]);
    };
    const onScoreUpdated = (message: {
      scores: [number, number, number, number];
      gameNumber: number;
      totalGames?: number;
    }) => {
      useSessionStore.setState((state) =>
        state.room
          ? {
              room: {
                ...state.room,
                scores: message.scores,
                gameNumber: message.gameNumber,
                ...(message.totalGames !== undefined ? { totalGames: message.totalGames } : {}),
              },
            }
          : state,
      );
    };
    const onDealerChanged = (message: { dealer: 0 | 1 | 2 | 3; gameNumber: number }) => {
      useSessionStore.setState((state) =>
        state.room
          ? { room: { ...state.room, dealer: message.dealer, gameNumber: message.gameNumber } }
          : state,
      );
      useSessionStore.getState().resetGameSeq();
    };
    const onSessionFinished = (message: { result: SessionResult }) =>
      setSessionResult(message.result);
    // Reused for the between-rounds confirm gate too, not just pre-game ready-up
    // — see docs/contracts/session-mechanics.md §6.
    const onReadyChanged = (event: RoomReadyChangedEvent) => {
      useSessionStore.getState().applyReadyChanged(event.seat, event.ready);
    };
    const onClosed = ({ reason }: { reason: string }) => {
      const notice =
        reason === "hostLeft" ? "The owner closed this room." : "This room was closed.";
      setRoom(null);
      void navigate("/games", { state: { notice } });
    };

    activeSocket.on("game:snapshot", onSnapshot);
    activeSocket.on("game:event", onEvent);
    activeSocket.on("room:scoreUpdated", onScoreUpdated);
    activeSocket.on("room:dealerChanged", onDealerChanged);
    activeSocket.on("room:sessionFinished", onSessionFinished);
    activeSocket.on("room:readyChanged", onReadyChanged);
    activeSocket.on("room:closed", onClosed);
    return () => {
      activeSocket.off("game:snapshot", onSnapshot);
      activeSocket.off("game:event", onEvent);
      activeSocket.off("room:scoreUpdated", onScoreUpdated);
      activeSocket.off("room:dealerChanged", onDealerChanged);
      activeSocket.off("room:readyChanged", onReadyChanged);
      activeSocket.off("room:sessionFinished", onSessionFinished);
      activeSocket.off("room:closed", onClosed);
    };
  }, [activeSocket, navigate, setRoom]);

  useEffect(() => {
    if (!view || gameSeq === null) return;
    const requestedRevision = snapshotRevision;
    let cancelled = false;
    void ack<GameAdviceResponse>(activeSocket, "game:advice", {}).then((result) => {
      if (cancelled) return;
      const store = useSessionStore.getState();
      if (result.ok) store.applyGameAdvice(result.data, requestedRevision);
      else store.clearGameAdvice(requestedRevision);
    });
    return () => {
      cancelled = true;
    };
  }, [activeSocket, gameDeadline, gameSeq, snapshotRevision, view]);

  const confirmNextRound = async () => {
    setError(null);
    const result = await ack(activeSocket, "room:ready", { ready: true });
    if (!result.ok) setError(result.code);
  };

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
    // The table loader (router.tsx) only ever lets a `!view` room through
    // when the caller's own seat is permanently auto-piloted (session-
    // mechanics.md §6/§12) — every other "not resumable" case is redirected
    // to /lobby/:id before this ever mounts. The generic fallback text below
    // only covers a genuinely transient in-flight state, not a real dead end.
    const mySeat = room?.players.find((player) => player?.userId === userId);
    if (mySeat?.isAutoPiloted) {
      return (
        <div className="flex h-[100dvh] w-full flex-col items-center justify-center gap-3 overflow-hidden p-6 text-center">
          <p>This seat has been taken over by AI — you're spectating, not playing.</p>
          <Link to="/games" className="text-sm underline">
            Back to games
          </Link>
        </div>
      );
    }
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center overflow-hidden p-6">
        Waiting for game data…
      </div>
    );
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

  const seats = Object.fromEntries(
    SEAT_DIRECTIONS.map((direction) => {
      const seat = seatAt(view.seat, direction);
      const data = seatData(seat);
      const player = playerInfo(seat);
      const drawnVisible = direction === "bottom" ? extras.justDrawn !== undefined : data.justDrawn;
      const content: SeatContent = {
        melds: data.melds.map((meld) => ({
          ...meld,
          ...(meld.from !== undefined
            ? { fromDirection: directionOf(view.seat, meld.from as SeatId) }
            : {}),
        })),
        // The just-drawn tile is pinned separately below — drop it from the main row/count so
        // it isn't shown (or counted) twice.
        handCount: drawnVisible ? data.handCount - 1 : data.handCount,
        info: player?.nickname ?? `Seat ${seat + 1}`,
        justDrawn:
          direction === "bottom"
            ? {
                visible: extras.justDrawn !== undefined,
                ...(extras.justDrawn !== undefined ? { tileId: extras.justDrawn } : {}),
                ...(extras.justDrawn !== undefined && isMyTurn
                  ? {
                      onClick: () => void sendAction({ type: "discard", tile: extras.justDrawn }),
                    }
                  : {}),
              }
            : { visible: data.justDrawn },
        ...(direction === "bottom"
          ? {
              hand:
                extras.justDrawn !== undefined
                  ? view.hand.filter((tile) => tile !== extras.justDrawn)
                  : view.hand,
              interactive: isMyTurn,
              onDiscard: (tile: number) => void sendAction({ type: "discard", tile }),
            }
          : {}),
      };
      return [direction, content];
    }),
  ) as Record<SeatDirection, SeatContent>;

  const discards = Object.fromEntries(
    SEAT_DIRECTIONS.map((direction) => {
      const seat = seatAt(view.seat, direction);
      const entries = seatData(seat).discards.map((entry) => ({
        ...entry,
        claimedByDirection:
          entry.claimedBy !== undefined
            ? directionOf(view.seat, entry.claimedBy as SeatId)
            : undefined,
        justDiscarded: extras.lastDiscard?.seat === seat && extras.lastDiscard.tile === entry.tile,
      }));
      return [direction, entries];
    }),
  ) as Record<SeatDirection, DiscardEntry[]>;

  const currentDirection = SEAT_DIRECTIONS.find(
    (direction) => seatAt(view.seat, direction) === view.currentSeat,
  );

  return (
    <div
      data-testid="table-page"
      className="flex h-[100dvh] w-full flex-col overflow-hidden bg-background pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]"
    >
      <TableHud
        roomName={room?.name ?? "Mahjong table"}
        seat={view.seat}
        gameNumber={room?.gameNumber ?? 1}
        totalGames={room?.totalGames ?? 1}
        dealer={room?.dealer ?? 0}
        scores={room?.scores ?? [0, 0, 0, 0]}
        onLeave={() => {
          if (isOwner && hasOtherPlayers) setLeaveConfirmOpen(true);
          else void leave();
        }}
      />

      <main
        data-testid="table-stage"
        className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden p-4"
        style={{ containerType: "size" }}
      >
        <TableBoard
          seats={seats}
          discards={discards}
          currentDirection={currentDirection}
          center={
            <CenterStatus
              phase={extras.phase ?? "unknown"}
              currentSeat={view.currentSeat}
              wallCount={view.wallCount}
              actions={
                claimOptions.length > 0 ? (
                  <div className="flex flex-wrap justify-center gap-1">
                    {claimOptions.map((option, index) => (
                      <Button key={index} size="sm" onClick={() => void sendAction(option.action)}>
                        {String(option.action["type"])}
                      </Button>
                    ))}
                  </div>
                ) : undefined
              }
              error={error}
            />
          }
        />
        {extras.result && sessionResult == null && room && (
          <RoundEndOverlay
            result={extras.result}
            gameNumber={room.gameNumber}
            totalGames={room.totalGames ?? 1}
            players={room.players}
            myConfirmed={room.players[view.seat]?.isReady === true}
            onConfirm={() => void confirmNextRound()}
          />
        )}
      </main>

      {sessionResult != null && (
        <div className="absolute bottom-3 left-3 z-20 max-w-md rounded-lg border bg-background/95 p-3 text-sm shadow-lg">
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

      <details className="absolute right-3 bottom-3 z-20 max-h-[60dvh] w-72 overflow-auto rounded-lg border bg-background/95 p-2 text-xs shadow-lg">
        <summary className="cursor-pointer font-medium">Diagnostics</summary>
        {import.meta.env.DEV && (
          <div className="mt-3">
            <h2 className="font-medium">Debug: omniscient view (dev-only)</h2>
            <Button
              className="mt-1"
              variant="outline"
              size="sm"
              onClick={() => void fetchDebugOmniscientView()}
            >
              Show all hands + wall
            </Button>
            {debugView && (
              <pre className="mt-2 max-w-full overflow-x-auto text-muted-foreground">
                {JSON.stringify(debugView, null, 2)}
              </pre>
            )}
          </div>
        )}
        <div className="mt-3">
          <h2 className="font-medium">Recent events</h2>
          <ul className="text-muted-foreground">
            {log.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
        </div>
      </details>
    </div>
  );
}
