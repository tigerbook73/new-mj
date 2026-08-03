import { afterEach, describe, expect, it } from "vitest";
import type { PlayerViewBase } from "@new-mj/protocol";
import {
  registerTableSnapshotAnimation,
  resetTableAnimationRuntime,
  tableAnimationMetadata,
} from "./tableAnimationCoordinator";

afterEach(resetTableAnimationRuntime);

describe("tableAnimationCoordinator", () => {
  it("initialises hidden hand tracks without requiring presentation to read a ledger", () => {
    const view = {
      seat: 0,
      hand: [1, 2, 3],
      seats: [{ handCount: 3 }, { handCount: 13 }, { handCount: 13 }, { handCount: 13 }],
    } as unknown as PlayerViewBase;

    registerTableSnapshotAnimation({
      previousSeq: null,
      nextSeq: 1,
      previousView: null,
      nextView: view,
      seat: 0,
      gameNumber: 1,
      enabled: true,
    });

    expect(tableAnimationMetadata().handTracks.get(1)?.tokens[0]).toEqual({ key: "back:1:0" });
  });
});
