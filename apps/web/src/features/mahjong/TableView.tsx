import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Dialog } from "@base-ui/react/dialog";
import { AnimatePresence } from "motion/react";
import type {
  DebugOmniscientView,
  GameAdviceResponse,
  GameEventEnvelope,
  GameSnapshot,
  RoomReadyChangedEvent,
  SessionResult,
} from "@new-mj/protocol";
import { Button } from "@/shared/ui/button";
import { SidebarProvider } from "@/shared/ui/sidebar";
import { ActionDock } from "@/features/mahjong/components/ActionDock";
import { CenterStatus } from "@/features/mahjong/components/CenterStatus";
import {
  HangzhouRoundEndOverlay,
  type HangzhouGameResultLike,
} from "@/features/mahjong/components/HangzhouRoundEndOverlay";
import {
  JunkRoundEndOverlay,
  type JunkGameResultLike,
} from "@/features/mahjong/components/JunkRoundEndOverlay";
import {
  RoundEndOverlay,
  type GameResultLike,
} from "@/features/mahjong/components/RoundEndOverlay";
import { TableBoard, type TurnHighlight } from "@/features/mahjong/components/TableBoard";
import { DESKTOP_TABLE_SCENARIO } from "@/features/mahjong/components/scenarios/desktop";
import { TableHud, TableHudTrigger } from "@/features/mahjong/components/TableHud";
import {
  registerSnapshotDiff,
  resetAnimationLedger,
  shouldRegisterSnapshotDiff,
} from "@/features/mahjong/lib/animationLedger";
import { soleDiscardedTile } from "@/features/mahjong/lib/diffPlayerView";
import { tileKindOf, type TileKind } from "@/features/mahjong/lib/mahjongTiles";
import { playSound, type SoundName } from "@/shared/lib/sounds";
import { buildStatusBadges } from "@/features/mahjong/lib/statusBadges";
import { usePrefersReducedMotion } from "@/shared/hooks/usePrefersReducedMotion";
import { ack } from "@/shared/lib/socket";
import { cn } from "@/shared/lib/utils";
import { useSessionStore } from "@/shared/store/session";
import { useIsIncrementalSnapshot } from "./useIsIncrementalSnapshot";
import { useTablePresentation } from "./useTablePresentation";

// Sound-effect scope, matching the actual
// clip set provided: 8 action clips (chi/peng/gang/angang/bugang/hu/zimo/pass) plus
// a full 34-kind tile-name voice set (public/sounds/{1m,...,7z}.m4a, same naming as
// TileKind) — a discard announces the discarded tile's name instead of a generic
// click. `game:event` fires once per live occurrence (not replayed on reconnect,
// see apps/web AGENTS.md), so no dedup is needed beyond what onEvent already does
// for its debug log below.
// - GangMade carries no `gangType` at all for a claimed open kong (junk/claims.ts's
//   applyClaimResponse only sets `gangType` for anGang/buGang — see hangzhou/junk
//   state-machine.ts) — that's the "gang" (明杠) case below.
// - HuDeclared's `winType` distinguishes self-draw (zimo) from off-discard (hu).
// - ClaimResponded is seat-visible only to the responder, so this only ever fires
//   for *my own* pass — other seats' passes never reach my `game:event` stream.
// - A discard is always public (TileId shown is the actual discarded tile — no
//   visibility concern, unlike a concealed hand), so tileKindOf is safe here.
const soundForEvent = (payload: {
  type: string;
  [key: string]: unknown;
}): SoundName | undefined => {
  switch (payload.type) {
    case "TileDiscarded":
      return tileKindOf(payload.tile as number);
    case "ChiMade":
      return "chi";
    case "PengMade":
      return "peng";
    case "GangMade": {
      const gangType = payload.gangType as "anGang" | "buGang" | undefined;
      return gangType === "anGang" ? "angang" : gangType === "buGang" ? "bugang" : "gang";
    }
    case "HuDeclared":
      return payload.winType === "zimo" ? "zimo" : "hu";
    case "ClaimResponded":
      return (payload.action as { type: string }).type === "pass" ? "pass" : undefined;
    default:
      return undefined;
  }
};

/**
 * junk 和 bloodbattle 的 view.ts 目前都用这几个字段名（phase/myActionOptions），
 * 但那是玩法私有约定，不是 PlayerViewBase 的静态契约——protocol 的
 * PlayerViewBaseSchema 故意用 .catchall(z.unknown()) 放行这些字段，这里按约定
 * 读取，不 import 任何 ruleset 专属类型（架构铁律 6）。
 */
export function TableView() {
  const navigate = useNavigate();
  const socket = useSessionStore((state) => state.socket);
  const userId = useSessionStore((state) => state.userId);
  const room = useSessionStore((state) => state.room);
  const view = useSessionStore((state) => state.view);
  const gameSeq = useSessionStore((state) => state.gameSeq);
  const gameDeadline = useSessionStore((state) => state.gameDeadline);
  const advice = useSessionStore((state) => state.advice);
  const snapshotRevision = useSessionStore((state) => state.snapshotRevision);
  const setRoom = useSessionStore((state) => state.setRoom);
  const activeSocket = socket!;
  const prefersReducedMotion = usePrefersReducedMotion();

  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sessionResult, setSessionResult] = useState<SessionResult | null>(null);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  // God mode (dev-only, protocol-shared.md §7): renders every seat's real
  // hand + anGang tiles with the same face-up treatment the bottom seat
  // gets — see useTablePresentation's `godView` param.
  const [godMode, setGodMode] = useState(false);
  const [godView, setGodView] = useState<DebugOmniscientView | null>(null);
  // Pure geometry for the discard-flying-out ghost (see DiscardFlipGhost.tsx
  // / HandRow.tsx's captureTileRect) — never read as game state, only handed
  // to useTablePresentation to attach onto the matching DiscardEntry once
  // the server's own snapshot actually lands. Set either from my own hand's
  // click handler below (`onDiscard`), or — for an auto-submitted (timeout)
  // discard that never went through a click — synchronously measured in
  // onSnapshot below via soleDiscardedTile, while the old DOM (still showing
  // the tile in hand) is still mounted. An opponent's discard never
  // populates this either way, on purpose; see DiscardEntry's `flightOrigin`
  // doc (DiscardPile.tsx) for why a flight there isn't worth it.
  // Deliberately never explicitly cleared: a TileId never repeats within a
  // round (see docs/architecture/frontend-layout.md §5), and DiscardPile's per-entry slot
  // (DiscardTileSlot) only ever reads this once, at the single render where
  // it mounts — so a stale value just sits unread forever until a later
  // click overwrites it; no correctness or leak concern worth a clearing
  // effect (which this project's lint config forbids doing synchronously
  // in an effect body anyway — react-hooks/set-state-in-effect).
  const [pendingDiscardOrigin, setPendingDiscardOrigin] = useState<{
    tile: number;
    rect: DOMRect;
  } | null>(null);

  // Drops any residue from a prior mount (StrictMode double-mount, e2e
  // remounts) — the ledger is a module singleton, not component state, so
  // nothing else clears it when this component first mounts.
  useEffect(() => {
    resetAnimationLedger();
  }, []);

  useEffect(() => {
    const onSnapshot = (event: GameSnapshot) => {
      // registerSnapshotDiff must read the *pre-update* view/gameSeq and run
      // before applyGameSnapshot swaps them — see animationLedger.ts's
      // shouldRegisterSnapshotDiff for the seq guard's exact semantics.
      const {
        gameSeq: currentGameSeq,
        view: currentView,
        room: currentRoom,
      } = useSessionStore.getState();
      if (!prefersReducedMotion && shouldRegisterSnapshotDiff(currentGameSeq, event.seq)) {
        registerSnapshotDiff(
          currentView,
          event.view,
          event.view.seat,
          currentRoom?.gameNumber ?? 1,
        );
        // Closes the gap for an auto-submitted (timeout) discard, which never
        // ran through onDiscard's click-time capture below — measure the
        // departing hand tile's own rect now, before this render swaps it out.
        if (currentView) {
          const discardedTile = soleDiscardedTile(currentView, event.view);
          if (discardedTile !== undefined) {
            const rect = document
              .querySelector(`[data-tile-id="${discardedTile}"]`)
              ?.getBoundingClientRect();
            if (rect) setPendingDiscardOrigin({ tile: discardedTile, rect });
          }
        }
      }
      useSessionStore.getState().applyGameSnapshot(event);
    };
    const onEvent = (message: GameEventEnvelope) => {
      const payload = message.event.payload as { type: string; [key: string]: unknown };
      setLog((prev) => [...prev.slice(-9), `#${message.event.seq} ${payload.type}`]);
      const sound = soundForEvent(payload);
      if (sound) playSound(sound);
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
      resetAnimationLedger();
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
  }, [activeSocket, navigate, prefersReducedMotion, setRoom]);

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

  // Refetches on every snapshot while god mode is on, same shape as the
  // game:advice effect above — a fresh in-flight request always wins over a
  // stale one via the snapshotRevision guard (session.ts's applyGameAdvice
  // idiom), since debug:omniscientView's ack carries no seq of its own to
  // correlate against.
  useEffect(() => {
    if (!godMode || !view) return;
    const requestedRevision = snapshotRevision;
    let cancelled = false;
    void ack<DebugOmniscientView>(activeSocket, "debug:omniscientView", {}).then((result) => {
      if (cancelled || useSessionStore.getState().snapshotRevision !== requestedRevision) return;
      if (result.ok) setGodView(result.data);
      // Fails closed and silent (e.g. ALLOW_DEBUG_OMNISCIENT off server-side)
      // — a dev toggle degrading invisibly, not a user-facing error.
      else setGodMode(false);
    });
    return () => {
      cancelled = true;
    };
  }, [activeSocket, godMode, snapshotRevision, view]);

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

  /**
   * room:end — ends the whole session immediately for every seat (see
   * docs/contracts/session-mechanics.md §6 "提前结束整场对局"), distinct
   * from `leave()`'s in-game path (permanent auto-pilot, session continues
   * for everyone else). Two entry points share this: the round-end
   * overlay's "End" button, and the Leave room dialog's "Force exit"
   * option (which follows up with its own `leave()` to actually navigate
   * away — see `forceLeave` below).
   */
  const endSession = async (): Promise<boolean> => {
    setError(null);
    const result = await ack(activeSocket, "room:end", {});
    if (!result.ok) {
      setError(result.code);
      return false;
    }
    return true;
  };

  const forceLeave = async () => {
    setLeaveConfirmOpen(false);
    if (await endSession()) void leave();
  };

  const handOff = () => {
    setLeaveConfirmOpen(false);
    void leave();
  };

  const isIncrementalSnapshot = useIsIncrementalSnapshot(gameSeq);
  const presentation = useTablePresentation({
    view,
    players: room?.players,
    onDiscard: (tile, originRect) => {
      if (originRect) setPendingDiscardOrigin({ tile, rect: originRect });
      void sendAction({ type: "discard", tile });
    },
    pendingDiscardOrigin,
    gameNumber: room?.gameNumber ?? 1,
    rulesetId: room?.rulesetId,
    dealer: room?.dealer,
    godView: godMode ? (godView ?? undefined) : undefined,
  });

  if (!view) {
    // The table loader (router.tsx) only ever lets a `!view` room through
    // when the caller's own seat is permanently auto-piloted (session-
    // mechanics.md §6/§12) — every other "not resumable" case is redirected
    // to /lobby/:id before this ever mounts. The generic fallback text below
    // only covers a genuinely transient in-flight state, not a real dead end.
    const mySeat = room?.players.find((player) => player?.userId === userId);
    if (mySeat?.isAutoPiloted) {
      return (
        <div className="flex h-dvh w-full flex-col items-center justify-center gap-3 overflow-hidden p-6 text-center">
          <p>This seat has been taken over by AI — you're spectating, not playing.</p>
          <Link to="/games" className="text-sm underline">
            Back to games
          </Link>
        </div>
      );
    }
    return (
      <div className="flex h-dvh w-full items-center justify-center overflow-hidden p-6">
        Waiting for game data…
      </div>
    );
  }

  if (!presentation) {
    throw new Error("MISSING_TABLE_PRESENTATION");
  }

  const { actionOptions, currentDirection, discards, extras, hasDockActions, seats } = presentation;
  // currentSeat is still the discarder during awaiting-claims (see
  // junk/state-machine.ts's applyDiscard), not a new "whoever can claim" seat — so
  // the center box's highlighted edge switches to a cooler "pending" color and
  // drops the arrow, rather than looking like a live turn for that seat.
  // Per-seat final hand for the settlement panel — already-declared open melds
  // (converted TileId→TileKind) plus the concealed decomposition actually used,
  // undefined for a seat that didn't win.
  const winningHands: Array<TileKind[][] | undefined> = (extras.seats ?? []).map((seat) => {
    if (!seat.winSnapshot) return undefined;
    const openMeldGroups = seat.melds.map((meld) => meld.tiles.map((tile) => tileKindOf(tile)));
    return [...openMeldGroups, ...seat.winSnapshot.groups];
  });
  const turnHighlight: TurnHighlight | undefined = currentDirection && {
    direction: currentDirection,
    tone: extras.phase === "awaiting-claims" ? "pending" : "active",
  };
  const recommendedAction =
    advice?.recommendedActionIndex === undefined
      ? undefined
      : advice.actions[advice.recommendedActionIndex];
  return (
    <SidebarProvider defaultOpen={false} className="contents">
      <div
        data-testid="table-page"
        className={cn(
          "flex h-dvh w-full flex-col overflow-hidden bg-background pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]",
          // Unmissable, always-on treatment tied to the same boolean that
          // drives the fetch effect above — god mode can't be on without
          // this also being on, so a screenshot/recording is never
          // mistakable for a legitimate (non-omniscient) view.
          godMode && "ring-4 ring-inset ring-fuchsia-500",
        )}
      >
        {godMode && (
          <div className="pointer-events-none fixed inset-x-0 top-0 z-50 bg-fuchsia-600 py-1 text-center text-xs font-bold tracking-widest text-white">
            GOD MODE — dev-only, all hands visible
          </div>
        )}
        <main
          data-testid="table-stage"
          className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden p-4"
          style={{ containerType: "size" }}
        >
          <div className="relative">
            <TableHud
              rulesetId={room?.rulesetId ?? ""}
              roomName={room?.name ?? "Mahjong table"}
              gameNumber={room?.gameNumber ?? 1}
              totalGames={room?.totalGames ?? 1}
              dealer={room?.dealer ?? 0}
              scores={room?.scores ?? [0, 0, 0, 0]}
              players={room?.players ?? [null, null, null, null]}
              onLeave={() => setLeaveConfirmOpen(true)}
            />
            <TableBoard
              scenario={DESKTOP_TABLE_SCENARIO}
              seats={seats}
              discards={discards}
              turnHighlight={turnHighlight}
              gameInfo={room && <TableHudTrigger rulesetId={room.rulesetId} />}
              center={
                <CenterStatus
                  phase={extras.phase ?? "unknown"}
                  wallCount={view.wallCount}
                  error={error}
                  dealerStreak={extras.dealerStreak}
                  badges={buildStatusBadges(extras)}
                />
              }
              actionDock={
                hasDockActions ? (
                  <ActionDock
                    actions={actionOptions}
                    hand={view.hand}
                    melds={extras.seats?.[view.seat]?.melds}
                    deadline={gameDeadline}
                    error={error}
                    lastDiscard={extras.lastDiscard?.tile}
                    recommendedAction={
                      typeof recommendedAction === "object" && recommendedAction !== null
                        ? (recommendedAction as Record<string, unknown>)
                        : undefined
                    }
                    justDrawn={extras.justDrawn}
                    config={DESKTOP_TABLE_SCENARIO.config}
                    onAction={(action) => void sendAction(action)}
                  />
                ) : undefined
              }
            />
          </div>
          <AnimatePresence>
            {extras.result &&
              sessionResult == null &&
              room &&
              (room.rulesetId === "hangzhou" ? (
                <HangzhouRoundEndOverlay
                  key="round-end-overlay"
                  result={
                    // hangzhou's HangzhouGameResult shape genuinely differs from
                    // bloodbattle's (winners is a fan-detail array, not plain
                    // seat numbers) — see HangzhouRoundEndOverlay.tsx.
                    extras.result as unknown as HangzhouGameResultLike
                  }
                  gameNumber={room.gameNumber}
                  totalGames={room.totalGames ?? 1}
                  players={room.players}
                  myConfirmed={room.players[view.seat]?.isReady === true}
                  onConfirm={() => void confirmNextRound()}
                  onEnd={() => void endSession()}
                  entering={isIncrementalSnapshot && !prefersReducedMotion}
                  reducedMotion={prefersReducedMotion}
                  winningHands={winningHands}
                />
              ) : room.rulesetId === "junk" ? (
                <JunkRoundEndOverlay
                  key="round-end-overlay"
                  result={
                    // junk keeps numeric winner seats for the shared room
                    // contract and exposes fan data separately as winnerDetails.
                    extras.result as unknown as JunkGameResultLike
                  }
                  gameNumber={room.gameNumber}
                  totalGames={room.totalGames ?? 1}
                  players={room.players}
                  myConfirmed={room.players[view.seat]?.isReady === true}
                  onConfirm={() => void confirmNextRound()}
                  onEnd={() => void endSession()}
                  entering={isIncrementalSnapshot && !prefersReducedMotion}
                  reducedMotion={prefersReducedMotion}
                  winningHands={winningHands}
                />
              ) : (
                <RoundEndOverlay
                  key="round-end-overlay"
                  result={
                    // bloodbattle's winners are plain seat numbers, unlike junk/
                    // hangzhou's fan-detail arrays — see RoundEndOverlay.tsx.
                    extras.result as unknown as GameResultLike
                  }
                  gameNumber={room.gameNumber}
                  totalGames={room.totalGames ?? 1}
                  players={room.players}
                  myConfirmed={room.players[view.seat]?.isReady === true}
                  onConfirm={() => void confirmNextRound()}
                  onEnd={() => void endSession()}
                  entering={isIncrementalSnapshot && !prefersReducedMotion}
                  reducedMotion={prefersReducedMotion}
                  winningHands={winningHands}
                />
              ))}
          </AnimatePresence>

          {sessionResult != null && room && (
            <div
              data-testid="session-finished-overlay"
              className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4"
            >
              <div className="flex w-full max-w-sm flex-col gap-3 rounded-xl border bg-background p-5 text-center shadow-xl">
                <h2 className="text-lg font-semibold">Session finished</h2>
                <p className="text-sm text-muted-foreground">
                  {sessionResult.gamesPlayed} game{sessionResult.gamesPlayed === 1 ? "" : "s"}{" "}
                  played
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
                        #{index + 1}{" "}
                        {room.players[entry.seatId]?.nickname ?? `Seat ${entry.seatId + 1}`}
                        {entry.seatId === sessionResult.winner ? " \u{1F3C6}" : ""}
                      </span>
                      <span>{entry.score}</span>
                    </li>
                  ))}
                </ol>
                <div className="flex flex-wrap justify-center gap-2 text-sm">
                  {Array.from({ length: sessionResult.gamesPlayed }, (_, index) => index + 1).map(
                    (gameNumber) => (
                      <Link
                        key={gameNumber}
                        to={`/replay/${room.id}/${gameNumber}`}
                        className="underline"
                      >
                        Replay game {gameNumber}
                      </Link>
                    ),
                  )}
                </div>
                <Button variant="outline" onClick={() => void leave()}>
                  Back to games
                </Button>
              </div>
            </div>
          )}
        </main>

        <Dialog.Root open={leaveConfirmOpen} onOpenChange={setLeaveConfirmOpen}>
          <Dialog.Portal>
            <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50" />
            <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex w-96 max-w-[calc(100vw-3rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 rounded-xl border bg-background p-6 shadow-xl">
              <Dialog.Title className="text-lg font-semibold">Leave room?</Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground">
                Hand off: an AI takes over your seat and the game continues for everyone else. Force
                exit: the whole session ends now for every player, straight to settlement.
              </Dialog.Description>
              <div className="flex justify-end gap-2">
                <Dialog.Close render={<Button variant="outline">Cancel</Button>} />
                <Button variant="secondary" onClick={handOff}>
                  Hand off to AI
                </Button>
                <Button variant="destructive" onClick={() => void forceLeave()}>
                  Force exit
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
                variant={godMode ? "default" : "outline"}
                size="sm"
                onClick={() => setGodMode((current) => !current)}
              >
                {godMode ? "God mode: on" : "God mode: off"}
              </Button>
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
    </SidebarProvider>
  );
}
