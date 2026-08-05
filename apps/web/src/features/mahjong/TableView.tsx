import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { AnimatePresence } from "motion/react";
import type { GameAdviceResponse } from "@new-mj/protocol";
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
import { LeaveConfirmDialog } from "@/features/mahjong/components/LeaveConfirmDialog";
import { ResultBanner } from "@/features/mahjong/components/ResultBanner";
import { SessionFinishedPanel } from "@/features/mahjong/components/SessionFinishedPanel";
import { TableBoard, type TurnHighlight } from "@/features/mahjong/components/TableBoard";
import { DESKTOP_TABLE_SCENARIO } from "@/features/mahjong/components/scenarios/desktop";
import { TableHud, TableHudTrigger } from "@/features/mahjong/components/TableHud";
import {
  registerTableSnapshotAnimation,
  resetTableAnimationRuntime,
  tableAnimationMetadata,
} from "@/features/mahjong/animation/tableAnimationCoordinator";
import { tileKindOf, type TileKind } from "@/features/mahjong/lib/mahjongTiles";
import { buildStatusBadges } from "@/features/mahjong/lib/statusBadges";
import { usePrefersReducedMotion } from "@/shared/hooks/usePrefersReducedMotion";
import { ack } from "@/shared/lib/socket";
import { cn } from "@/shared/lib/utils";
import { useSessionStore } from "@/shared/store/session";
import { useIsIncrementalSnapshot } from "./useIsIncrementalSnapshot";
import { useTableActions } from "./useTableActions";
import { useTableSocket } from "./useTableSocket";
import { useTablePresentation } from "./useTablePresentation";

/** How long ResultBanner's "胡了！/自摸！/流局" flash stays up before RoundEndOverlay's settlement panel takes over. */
const RESULT_BANNER_DURATION_MS = 900;

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
  const debugOmniscient = useSessionStore((state) => state.debugOmniscient);
  const activeSocket = socket!;
  const prefersReducedMotion = usePrefersReducedMotion();

  const [error, setError] = useState<string | null>(null);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  // God mode (dev-only, protocol-shared.md §7): only chooses whether to
  // render the synchronous, server-gated debug snapshot already in the
  // store; it never changes what the server sends or makes a separate query.
  const [godMode, setGodMode] = useState(false);
  const isGodModeVisible = godMode && debugOmniscient !== null;
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
    resetTableAnimationRuntime();
    // A route/reconnect can hydrate the store before TableView mounts. The
    // reset above would otherwise leave that already-rendered first hand
    // without visual tokens, making its first discard fall back to the whole
    // hand zone. This is initialisation only, never an animation diff.
    if (!prefersReducedMotion && view) {
      registerTableSnapshotAnimation({
        previousSeq: null,
        nextSeq: 0,
        previousView: null,
        nextView: view,
        seat: view.seat,
        gameNumber: room?.gameNumber ?? 1,
        enabled: true,
      });
    }
    // Intentional mount-only snapshot: later snapshots go through the socket
    // handler below, whose seq guard owns all animation registration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { log, sessionResult } = useTableSocket({
    activeSocket,
    isGodModeVisible,
    prefersReducedMotion,
    navigate,
    setPendingDiscardOrigin,
  });

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

  const { confirmNextRound, sendAction, leave, endSession, forceLeave, handOff } = useTableActions({
    activeSocket,
    navigate,
    setError,
    setLeaveConfirmOpen,
  });

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
    godView: isGodModeVisible ? debugOmniscient : undefined,
    animation: tableAnimationMetadata(),
  });

  // Brief "胡了！/自摸！/流局" flash before RoundEndOverlay's settlement panel
  // takes over — only for a genuinely live result (isIncrementalSnapshot),
  // never replayed on reconnect. Hooks placed above the early returns below
  // since they must run unconditionally every render. The "turn on" edge is
  // derived during render (same technique as useIsIncrementalSnapshot —
  // this project's eslint forbids synchronous setState in a useEffect body);
  // useEffect is only used for the genuinely async part, the delayed
  // "turn off" timer.
  const showResultBannerCondition =
    presentation?.extras.result != null &&
    sessionResult == null &&
    isIncrementalSnapshot &&
    !prefersReducedMotion;
  const [prevShowResultBannerCondition, setPrevShowResultBannerCondition] = useState(
    showResultBannerCondition,
  );
  const [showResultBanner, setShowResultBanner] = useState(false);
  if (showResultBannerCondition !== prevShowResultBannerCondition) {
    setPrevShowResultBannerCondition(showResultBannerCondition);
    setShowResultBanner(showResultBannerCondition);
  }
  useEffect(() => {
    if (!showResultBanner) return;
    const timer = setTimeout(() => setShowResultBanner(false), RESULT_BANNER_DURATION_MS);
    return () => clearTimeout(timer);
  }, [showResultBanner]);

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
  const winningHands: Array<{ groups: TileKind[][]; winTile: TileKind } | undefined> = (
    extras.seats ?? []
  ).map((seat) => {
    if (!seat.winSnapshot) return undefined;
    const openMeldGroups = seat.melds.map((meld) => meld.tiles.map((tile) => tileKindOf(tile)));
    return {
      groups: [...openMeldGroups, ...seat.winSnapshot.groups],
      winTile: seat.winSnapshot.winTile,
    };
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
          // selects the synchronized debug payload — a screenshot/recording
          // is never
          // mistakable for a legitimate (non-omniscient) view.
          isGodModeVisible && "ring-4 ring-inset ring-fuchsia-500",
        )}
      >
        {isGodModeVisible && (
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
            {showResultBanner && extras.result && (
              <ResultBanner
                key="result-banner"
                result={extras.result as GameResultLike}
                reducedMotion={prefersReducedMotion}
              />
            )}
            {!showResultBanner &&
              extras.result &&
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
                  mySeat={view.seat}
                  dealer={extras.dealer}
                  dealerStreak={extras.dealerStreak}
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
                  mySeat={view.seat}
                  dealer={extras.dealer}
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
                  mySeat={view.seat}
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
            <SessionFinishedPanel
              sessionResult={sessionResult}
              room={room}
              onLeave={() => void leave()}
            />
          )}
        </main>

        <LeaveConfirmDialog
          open={leaveConfirmOpen}
          onOpenChange={setLeaveConfirmOpen}
          onHandOff={handOff}
          onForceLeave={() => void forceLeave()}
        />

        <details className="absolute right-3 bottom-3 z-20 max-h-[60dvh] w-72 overflow-auto rounded-lg border bg-background/95 p-2 text-xs shadow-lg">
          <summary className="cursor-pointer font-medium">Diagnostics</summary>
          {import.meta.env.DEV && (
            <div className="mt-3">
              <h2 className="font-medium">Debug: omniscient view (dev-only)</h2>
              <Button
                className="mt-1"
                variant={isGodModeVisible ? "default" : "outline"}
                size="sm"
                disabled={!debugOmniscient}
                onClick={() => setGodMode((current) => !current)}
              >
                {isGodModeVisible ? "God mode: on" : "God mode: off"}
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
