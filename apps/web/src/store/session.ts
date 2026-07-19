import { create } from "zustand";
import type { Socket } from "socket.io-client";
import type { PlayerViewBase, RoomInfo, SeatId } from "@new-mj/protocol";
import { clearDevSession } from "@/lib/devAuth";
import { ack } from "@/lib/socket";
import { supabase } from "@/lib/supabase";

export interface ActiveRoomHint {
  roomId: string;
  phase: string;
}

// 骨架先行：字段形状由 3c（socket/user）、3d（room）、3e（view）逐步填充实现。
export type SessionState = {
  socket: Socket | null;
  userId: string | null;
  nickname: string | null;
  room: RoomInfo | null;
  view: PlayerViewBase | null;
  /** Core event seq is scoped to one game and resets when the next game starts. */
  gameSeq: number | null;
  gameDeadline: number | null;
  /** Set by the session:kicked handler (sessionBootstrap.ts) so the login
   * screen can show a "taken over" message without a URL query param —
   * cleared on the next connect attempt. */
  kicked: boolean;
  /**
   * session:identity's cheap activeRoom hint (roomId+phase, no full RoomInfo)
   * — lets the /games loader (router.tsx) redirect to the right place right
   * after a fresh connect, before any room-specific loader has fetched the
   * real `room`. Superseded by `room` the moment it's set (setRoom clears
   * this) so a stale hint can never re-route someone back into a room they
   * already left.
   */
  activeRoomHint: ActiveRoomHint | null;
  setSocket: (socket: Socket | null) => void;
  setUser: (userId: string, nickname: string) => void;
  setKicked: (kicked: boolean) => void;
  setActiveRoomHint: (hint: ActiveRoomHint | null) => void;
  signOut: () => Promise<void>;
  setRoom: (room: RoomInfo | null) => void;
  applyGameSnapshot: (snapshot: {
    view: PlayerViewBase;
    seq: number;
    deadline?: number | undefined;
  }) => void;
  resetGameSeq: () => void;
  /**
   * room:playerJoined 事件只带 {seat,nickname,isBot}，没有 userId——client 不
   * 需要知道别人的 userId（自己的座位号靠自己的 userId 在初始快照里就能定位，
   * 不依赖这里补的占位值）。
   */
  applyPlayerJoined: (seat: SeatId, nickname: string, isBot: boolean, avatar?: string) => void;
  applyReadyChanged: (seat: SeatId, ready: boolean) => void;
};

export const useSessionStore = create<SessionState>((set) => ({
  socket: null,
  userId: null,
  nickname: null,
  room: null,
  view: null,
  gameSeq: null,
  gameDeadline: null,
  kicked: false,
  activeRoomHint: null,
  setSocket: (socket) => set({ socket }),
  setUser: (userId, nickname) => set({ userId, nickname }),
  setKicked: (kicked) => set({ kicked }),
  setActiveRoomHint: (activeRoomHint) => set({ activeRoomHint }),
  signOut: async () => {
    const { socket, room } = useSessionStore.getState();
    if (socket && room)
      await Promise.race([
        ack(socket, "room:leave", {}),
        new Promise((resolve) => setTimeout(resolve, 1000)),
      ]);
    await supabase?.auth.signOut();
    clearDevSession();
    socket?.disconnect();
    set({
      socket: null,
      userId: null,
      nickname: null,
      room: null,
      view: null,
      gameSeq: null,
      gameDeadline: null,
      kicked: false,
      activeRoomHint: null,
    });
  },
  setRoom: (room) =>
    set((state) => {
      if (!room)
        return {
          room: null,
          view: null,
          gameSeq: null,
          gameDeadline: null,
          activeRoomHint: null,
        };
      const changedRoom = state.room?.id !== room.id;
      const changedGame = changedRoom || state.room?.gameNumber !== room.gameNumber;
      return {
        room,
        activeRoomHint: null,
        ...(changedRoom ? { view: null } : {}),
        ...(changedGame ? { gameSeq: null, gameDeadline: null } : {}),
      };
    }),
  applyGameSnapshot: ({ view, seq, deadline }) =>
    set((state) =>
      state.gameSeq === null || seq >= state.gameSeq
        ? { view, gameSeq: seq, gameDeadline: deadline ?? null }
        : state,
    ),
  resetGameSeq: () => set({ gameSeq: null, gameDeadline: null }),
  applyPlayerJoined: (seat, nickname, isBot, avatar) =>
    set((state) => {
      if (!state.room) return state;
      const players = [...state.room.players] as RoomInfo["players"];
      players[seat] = {
        userId: "",
        seatId: seat,
        nickname,
        isBot,
        isReady: false,
        isAutoPiloted: false,
        isDisconnected: false,
        ...(avatar ? { avatar } : {}),
      };
      return { room: { ...state.room, players } };
    }),
  applyReadyChanged: (seat, ready) =>
    set((state) => {
      const player = state.room?.players[seat];
      if (!state.room || !player) return state;
      const players = [...state.room.players] as RoomInfo["players"];
      players[seat] = { ...player, isReady: ready };
      return { room: { ...state.room, players } };
    }),
}));
