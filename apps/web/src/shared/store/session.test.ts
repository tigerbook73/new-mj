import type {
  DebugOmniscientSnapshot,
  GameAdviceResponse,
  PlayerViewBase,
  RoomInfo,
} from "@new-mj/protocol";
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
const debug: DebugOmniscientSnapshot = {
  hands: [[1], [2], [3], [4]],
  melds: [[], [], [], []],
};

describe("session authoritative snapshots", () => {
  beforeEach(() => {
    useSessionStore.setState({
      room: null,
      view: null,
      debugOmniscient: null,
      gameSeq: null,
      gameDeadline: null,
      snapshotRevision: 0,
      advice: null,
    });
  });

  it("accepts advice only for the exact seq, deadline, and snapshot revision", () => {
    const store = useSessionStore.getState();
    store.applyGameSnapshot({ view: view(0), seq: 10, deadline: 1_000 });
    const revision = useSessionStore.getState().snapshotRevision;
    const current: GameAdviceResponse = {
      seq: 10,
      deadline: 1_000,
      actions: [{ type: "discard", tile: 1 }],
      recommendedActionIndex: 0,
    };
    store.applyGameAdvice(current, revision);
    expect(useSessionStore.getState().advice).toEqual(current);

    store.applyGameSnapshot({ view: view(1), seq: 10, deadline: 1_000 });
    expect(useSessionStore.getState().advice).toBeNull();
    store.applyGameAdvice(current, revision);
    expect(useSessionStore.getState().advice).toBeNull();

    const nextRevision = useSessionStore.getState().snapshotRevision;
    store.applyGameAdvice({ ...current, seq: 9 }, nextRevision);
    store.applyGameAdvice({ ...current, deadline: 2_000 }, nextRevision);
    expect(useSessionStore.getState().advice).toBeNull();
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

  it("updates or clears deadline with accepted snapshots and ignores stale deadline", () => {
    const store = useSessionStore.getState();
    store.applyGameSnapshot({ view: view(0), seq: 10, deadline: 1_000 });
    expect(useSessionStore.getState().gameDeadline).toBe(1_000);

    store.applyGameSnapshot({ view: view(1), seq: 9, deadline: 2_000 });
    expect(useSessionStore.getState().gameDeadline).toBe(1_000);

    store.applyGameSnapshot({ view: view(2), seq: 10 });
    expect(useSessionStore.getState().gameDeadline).toBeNull();
  });

  it("adopts debug data atomically with an accepted snapshot and rejects stale pairs", () => {
    const store = useSessionStore.getState();
    store.applyGameSnapshot({ view: view(0), seq: 10, debugOmniscient: debug });
    expect(useSessionStore.getState().debugOmniscient).toEqual(debug);

    store.applyGameSnapshot({ view: view(1), seq: 9 });
    expect(useSessionStore.getState()).toMatchObject({ view: view(0), debugOmniscient: debug });

    store.applyGameSnapshot({ view: view(2), seq: 11 });
    expect(useSessionStore.getState().debugOmniscient).toBeNull();
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
    expect(useSessionStore.getState()).toMatchObject({
      room: null,
      view: null,
      gameSeq: null,
      gameDeadline: null,
    });
  });
});
