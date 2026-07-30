import type { PlayerViewBase } from "@new-mj/protocol";
import { beforeEach, describe, expect, it } from "vitest";
import {
  completeSlot,
  registerSnapshotDiff,
  resetAnimationLedger,
  resolveSlot,
} from "./animationLedger";

const emptySeat = { handCount: 13, melds: [], discards: [], justDrawn: false };

const junkView = (patch: Partial<{ justDrawn: number; seats: unknown[] }> = {}): PlayerViewBase =>
  ({
    seat: 0,
    hand: [1, 2, 3],
    wallCount: 80,
    currentSeat: 0,
    seats: [emptySeat, emptySeat, emptySeat, emptySeat],
    ...patch,
  }) as unknown as PlayerViewBase;

describe("animationLedger", () => {
  beforeEach(() => {
    resetAnimationLedger();
  });

  it("defaults an unregistered key to skip", () => {
    expect(resolveSlot("g1:draw:own:0")).toBe("skip");
  });

  it("resolves a fresh draw to flight, and a critical decorative event to flight too", () => {
    registerSnapshotDiff(junkView(), junkView({ justDrawn: 5 }), 0, 1);
    expect(resolveSlot("g1:draw:own:0")).toBe("flight");

    registerSnapshotDiff(
      junkView(),
      junkView({
        seats: [{ ...emptySeat, discards: [{ tile: 7 }] }, emptySeat, emptySeat, emptySeat],
      }),
      0,
      1,
    );
    expect(resolveSlot("g1:discard:0:0")).toBe("flight");
  });

  it("resolves a non-critical decorative event to appear, never skip", () => {
    registerSnapshotDiff(
      junkView(),
      junkView({
        seats: [emptySeat, { ...emptySeat, discards: [{ tile: 7 }] }, emptySeat, emptySeat],
      }),
      0,
      1,
    );
    expect(resolveSlot("g1:discard:1:0")).toBe("appear");
  });

  it("downgrades a second same-seat draw to skip while a first is still unresolved, and settles the old lane", () => {
    const prev = junkView();
    const firstDraw = junkView({ justDrawn: 5 });
    registerSnapshotDiff(prev, firstDraw, 0, 1);
    expect(resolveSlot("g1:draw:own:0")).toBe("flight");

    // A second draw lands before the first slot's ghost ever completed (e.g.
    // rapid consecutive draws in a 0ms-bot test environment) — structural
    // conflict, the only case that downgrades regardless of criticality.
    const secondDraw = junkView({ justDrawn: 9 });
    registerSnapshotDiff(firstDraw, secondDraw, 0, 1);
    expect(resolveSlot("g1:draw:own:0")).toBe("skip");
    // The old lane must be freed immediately, not left occupied waiting for
    // the old slot's own unmount cleanup to eventually call completeSlot.
    expect(resolveSlot("g1:draw:own:0")).not.toBe("flight");

    // A third draw after the lane was freed gets to fly again.
    const thirdDraw = junkView({ justDrawn: 12 });
    registerSnapshotDiff(secondDraw, thirdDraw, 0, 1);
    expect(resolveSlot("g1:draw:own:0")).toBe("flight");
  });

  it("keeps completeSlot idempotent: a repeat call on an already-settled key is a safe no-op", () => {
    const prev = junkView();
    const firstDraw = junkView({ justDrawn: 5 });
    registerSnapshotDiff(prev, firstDraw, 0, 1);

    completeSlot("g1:draw:own:0", 0);
    expect(resolveSlot("g1:draw:own:0")).toBe("skip");
    // Second call for the same, already-settled key: no-op, no throw — and
    // the lane it used to hold stays free rather than getting re-occupied.
    completeSlot("g1:draw:own:0", 0);
    expect(resolveSlot("g1:draw:own:0")).toBe("skip");

    // The lane was genuinely freed (not left dangling) — a fresh draw can fly again.
    const secondDraw = junkView({ justDrawn: 9 });
    registerSnapshotDiff(firstDraw, secondDraw, 0, 1);
    expect(resolveSlot("g1:draw:own:0")).toBe("flight");
  });

  it("settling one seat's draw lane never touches another seat's", () => {
    const prev = junkView();
    // Both seat 0 (mine) and seat 1 (opponent) draw in the same registration.
    const next = junkView({
      justDrawn: 5,
      seats: [emptySeat, { ...emptySeat, justDrawn: true }, emptySeat, emptySeat],
    });
    registerSnapshotDiff(prev, next, 0, 1);
    expect(resolveSlot("g1:draw:own:0")).toBe("flight");
    expect(resolveSlot("g1:draw:opp:1")).toBe("flight");

    completeSlot("g1:draw:own:0", 0);
    expect(resolveSlot("g1:draw:own:0")).toBe("skip");
    // Seat 1's lane must survive seat 0's settle untouched.
    expect(resolveSlot("g1:draw:opp:1")).toBe("flight");
  });

  it("prefixes keys by game number so a same-index slot never collides across games", () => {
    registerSnapshotDiff(
      junkView(),
      junkView({
        seats: [{ ...emptySeat, discards: [{ tile: 1 }] }, emptySeat, emptySeat, emptySeat],
      }),
      0,
      1,
    );
    registerSnapshotDiff(
      junkView(),
      junkView({
        seats: [{ ...emptySeat, discards: [{ tile: 1 }] }, emptySeat, emptySeat, emptySeat],
      }),
      0,
      2,
    );
    expect(resolveSlot("g1:discard:0:0")).toBe("flight");
    expect(resolveSlot("g2:discard:0:0")).toBe("flight");

    completeSlot("g1:discard:0:0");
    expect(resolveSlot("g1:discard:0:0")).toBe("skip");
    // Settling game 1's slot must not touch game 2's identically-shaped key.
    expect(resolveSlot("g2:discard:0:0")).toBe("flight");
  });

  it("resetAnimationLedger drops all resolutions and lane occupancy", () => {
    registerSnapshotDiff(junkView(), junkView({ justDrawn: 5 }), 0, 1);
    expect(resolveSlot("g1:draw:own:0")).toBe("flight");

    resetAnimationLedger();
    expect(resolveSlot("g1:draw:own:0")).toBe("skip");

    // The lane is free again post-reset — a new draw resolves to flight, not skip.
    registerSnapshotDiff(junkView(), junkView({ justDrawn: 5 }), 0, 1);
    expect(resolveSlot("g1:draw:own:0")).toBe("flight");
  });
});
