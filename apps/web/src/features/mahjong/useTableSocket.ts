import { useEffect, useState } from "react";
import type { NavigateFunction } from "react-router";
import type { Socket } from "socket.io-client";
import type {
  GameEventEnvelope,
  GameSnapshot,
  RoomReadyChangedEvent,
  SessionResult,
} from "@new-mj/protocol";
import {
  registerTableSnapshotAnimation,
  resetTableAnimationRuntime,
} from "@/features/mahjong/animation/tableAnimationCoordinator";
import { tileKindOf } from "@/features/mahjong/lib/mahjongTiles";
import { playSound, type SoundName } from "@/shared/lib/sounds";
import { useSessionStore } from "@/shared/store/session";

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

interface UseTableSocketOptions {
  activeSocket: Socket;
  isGodModeVisible: boolean;
  prefersReducedMotion: boolean;
  navigate: NavigateFunction;
  setPendingDiscardOrigin: (origin: { tile: number; rect: DOMRect } | null) => void;
}

/** Registers all TableView `game:*`/`room:*` socket listeners for one mount. */
export function useTableSocket({
  activeSocket,
  isGodModeVisible,
  prefersReducedMotion,
  navigate,
  setPendingDiscardOrigin,
}: UseTableSocketOptions) {
  const setRoom = useSessionStore((state) => state.setRoom);
  const [log, setLog] = useState<string[]>([]);
  const [sessionResult, setSessionResult] = useState<SessionResult | null>(null);

  useEffect(() => {
    const onSnapshot = (event: GameSnapshot) => {
      // registerSnapshotDiff must read the *pre-update* view/gameSeq and run
      // before applyGameSnapshot swaps them — see animationLedger.ts's
      // shouldRegisterSnapshotDiff for the seq guard's exact semantics.
      const {
        gameSeq: currentGameSeq,
        view: currentView,
        room: currentRoom,
        debugOmniscient: currentDebugOmniscient,
      } = useSessionStore.getState();
      const { autoDiscardOrigin } = registerTableSnapshotAnimation({
        previousSeq: currentGameSeq,
        nextSeq: event.seq,
        previousView: currentView,
        nextView: event.view,
        seat: event.view.seat,
        gameNumber: currentRoom?.gameNumber ?? 1,
        enabled: !prefersReducedMotion,
        previousGodHands: isGodModeVisible ? currentDebugOmniscient?.hands : undefined,
        nextGodHands: isGodModeVisible ? event.debugOmniscient?.hands : undefined,
      });
      if (autoDiscardOrigin) setPendingDiscardOrigin(autoDiscardOrigin);
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
      resetTableAnimationRuntime();
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
  }, [
    activeSocket,
    isGodModeVisible,
    navigate,
    prefersReducedMotion,
    setPendingDiscardOrigin,
    setRoom,
  ]);

  return { log, sessionResult };
}
