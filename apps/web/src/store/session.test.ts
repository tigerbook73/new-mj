import type { PlayerViewBase, RoomInfo } from "@new-mj/protocol";
import { beforeEach, describe, expect, it } from "vitest";
import { useSessionStore } from "./session";

const view = (currentSeat: 0 | 1 | 2 | 3): PlayerViewBase => ({
  seat: 0,
  hand: [],
  seats: [{ handCount: 0 }, { handCount: 0 }, { handCount: 0 }, { handCount: 0 }],
  wallCount: 60,
  currentSeat,
});

const room = (id: string, gameNumber: number): RoomInfo => ({ id, gameNumber }) as RoomInfo;

describe("session authoritative snapshots", () => {
  beforeEach(() => {
    useSessionStore.setState({ room: null, view: null, gameSeq: null });
  });

  it("accepts initial, equal, and newer seq while rejecting an older snapshot", () => {
    const store = useSessionStore.getState();
    store.applyGameSnapshot({ view: view(0), seq: 10 });
    store.applyGameSnapshot({ view: view(1), seq: 10 });
    store.applyGameSnapshot({ view: view(2), seq: 9 });
    expect(useSessionStore.getState()).toMatchObject({ view: view(1), gameSeq: 10 });

    store.applyGameSnapshot({ view: view(3), seq: 11 });
    expect(useSessionStore.getState()).toMatchObject({ view: view(3), gameSeq: 11 });
  });

  it("resets the seq epoch for a new game or room and clears game state on leave", () => {
    const store = useSessionStore.getState();
    store.setRoom(room("room-a", 1));
    store.applyGameSnapshot({ view: view(0), seq: 20 });

    store.setRoom(room("room-a", 2));
    expect(useSessionStore.getState().gameSeq).toBeNull();
    store.applyGameSnapshot({ view: view(1), seq: 1 });
    expect(useSessionStore.getState()).toMatchObject({ view: view(1), gameSeq: 1 });

    store.setRoom(room("room-b", 1));
    expect(useSessionStore.getState().gameSeq).toBeNull();
    store.setRoom(null);
    expect(useSessionStore.getState()).toMatchObject({ room: null, view: null, gameSeq: null });
  });
});
