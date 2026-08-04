import type { NavigateFunction } from "react-router";
import type { Socket } from "socket.io-client";
import { ack } from "@/shared/lib/socket";
import { useSessionStore } from "@/shared/store/session";

interface UseTableActionsOptions {
  activeSocket: Socket;
  navigate: NavigateFunction;
  setError: (code: string | null) => void;
  setLeaveConfirmOpen: (open: boolean) => void;
}

/** TableView's server-write actions: ready-up, discards/claims, and the leave-room paths. */
export function useTableActions({
  activeSocket,
  navigate,
  setError,
  setLeaveConfirmOpen,
}: UseTableActionsOptions) {
  const setRoom = useSessionStore((state) => state.setRoom);

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

  return { confirmNextRound, sendAction, leave, endSession, forceLeave, handOff };
}
