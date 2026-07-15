import type { SeatId, TileId } from "../../lib/ids.ts";
import type { SeatState } from "../../lib/seat.ts";
import type { PrngState } from "../../lib/prng.ts";
import type { ApplyResult, GameConfig } from "../../types.ts";

export type BloodbattlePhase =
  "exchanging" | "choosing-lack" | "playing" | "awaiting-claims" | "finished";

export type BloodbattleConfig = GameConfig & {
  rulesetId: "bloodbattle";
  exchangeThree: boolean;
};

// playing-phase actions (discard/chi/peng/gang/hu/pass) aren't implemented
// yet — see docs/plan.md 阶段 1.5. Don't add them speculatively here.
export type BloodbattleAction =
  | { type: "exchangeThree"; tiles: [TileId, TileId, TileId] }
  | { type: "chooseLack"; suit: "m" | "p" | "s" };

export type BloodbattleState = {
  config: BloodbattleConfig;
  phase: BloodbattlePhase;
  wall: TileId[];
  seats: SeatState[];
  currentSeat: SeatId;
  seq: number;
  prng: PrngState;
  // Pre-play submissions, one per seat; flattened out of the old
  // variantState namespace (D12 retires variantState entirely).
  exchange?: { selections: Partial<Record<SeatId, [TileId, TileId, TileId]>> };
  lack?: Partial<Record<SeatId, "m" | "p" | "s">>;
};

export type BloodbattleApplyResult = ApplyResult<BloodbattleState>;
