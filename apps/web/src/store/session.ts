import { create } from "zustand";
import type { Socket } from "socket.io-client";
import type { PlayerViewBase, RoomInfo, SeatId } from "@new-mj/protocol";
import { ack } from "@/lib/socket";
import { supabase } from "@/lib/supabase";

// 骨架先行：字段形状由 3c（socket/user）、3d（room）、3e（view）逐步填充实现。
export type SessionState = {
  socket: Socket | null;
  userId: string | null;
  nickname: string | null;
  room: RoomInfo | null;
  view: PlayerViewBase | null;
  restoring: boolean;
  setSocket: (socket: Socket | null) => void;
  setUser: (userId: string, nickname: string) => void;
  signOut: () => Promise<void>;
  setRoom: (room: RoomInfo | null) => void;
  setView: (view: PlayerViewBase | null) => void;
  setRestoring: (restoring: boolean) => void;
  /**
   * room:playerJoined 事件只带 {seat,nickname,isBot}，没有 userId——client 不
   * 需要知道别人的 userId（自己的座位号靠自己的 userId 在初始快照里就能定位，
   * 不依赖这里补的占位值）。
   */
  applyPlayerJoined: (seat: SeatId, nickname: string, isBot: boolean, avatar?: string) => void;
  applyReadyChanged: (seat: SeatId, ready: boolean) => void;
  /**
   * 只对"事实型" game:event 做增量更新（谁的回合、谁打出了什么牌、我能声明
   * 什么），"规则型"事件（吃碰杠成立/胡牌/结算）不在这里解释——那部分逻辑
   * 只存在于 core 里，按玩法分开实现，web 不能碰（架构铁律 6）。规则型事件
   * 发生后画面会暂时不同步，等下一次 game:snapshot（下一局开始）整体对齐，
   * 见 apps/web/AGENTS.md。
   */
  applyTurnStarted: (seat: SeatId) => void;
  applyTileDiscarded: (seat: SeatId, tile: number) => void;
  applyClaimWindowOpened: (options: unknown[]) => void;
  applyClaimWindowResolved: () => void;
};

export const useSessionStore = create<SessionState>((set) => ({
  socket: null,
  userId: null,
  nickname: null,
  room: null,
  view: null,
  restoring: true,
  setSocket: (socket) => set({ socket }),
  setUser: (userId, nickname) => set({ userId, nickname }),
  signOut: async () => {
    const { socket, room } = useSessionStore.getState();
    if (socket && room)
      await Promise.race([
        ack(socket, "room:leave", {}),
        new Promise((resolve) => setTimeout(resolve, 1000)),
      ]);
    await supabase?.auth.signOut();
    localStorage.removeItem("new-mj:dev-session");
    socket?.disconnect();
    set({ socket: null, userId: null, nickname: null, room: null, view: null });
  },
  setRoom: (room) => {
    if (room) localStorage.setItem("new-mj:last-room", room.id);
    else localStorage.removeItem("new-mj:last-room");
    set({ room });
  },
  setView: (view) => set({ view }),
  setRestoring: (restoring) => set({ restoring }),
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
  applyTurnStarted: (seat) =>
    set((state) => {
      if (!state.view) return state;
      const { myClaimOptions: _drop, ...rest } = state.view;
      return { view: { ...rest, currentSeat: seat } };
    }),
  applyTileDiscarded: (seat, tile) =>
    set((state) => {
      if (!state.view) return state;
      const seats = state.view.seats.map((entry, index) => {
        if (index !== seat) return entry;
        // junk-private field (discards), see TableView's ViewExtras comment —
        // not on every ruleset's seats shape, so only append when present.
        const extra = entry as { discards?: { tile: number; claimedBy?: SeatId }[] };
        const discards = extra.discards ? [...extra.discards, { tile }] : extra.discards;
        return { ...entry, handCount: entry.handCount - 1, ...(discards && { discards }) };
      });
      const hand =
        seat === state.view.seat ? state.view.hand.filter((t) => t !== tile) : state.view.hand;
      return { view: { ...state.view, seats, hand } };
    }),
  applyClaimWindowOpened: (options) =>
    set((state) => (state.view ? { view: { ...state.view, myClaimOptions: options } } : state)),
  applyClaimWindowResolved: () =>
    set((state) => {
      if (!state.view) return state;
      const { myClaimOptions: _drop, ...rest } = state.view;
      return { view: rest };
    }),
}));
