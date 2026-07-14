import type { TileSet } from "./tiles.ts";
import type {
  Action,
  ClaimOption,
  GameEvent,
  GameState,
  RuleViolation,
  SeatId,
} from "./types.ts";

/** A phase table keeps a variant's flow explicit instead of encoding it in server/UI code. */
export type PhaseDefinition = {
  id: GameState["phase"];
  next: readonly GameState["phase"][];
};

export type RuleSetApplySuccess = {
  state: GameState;
  events: GameEvent[];
};

export type RuleSetApplyResult = RuleSetApplySuccess | { error: RuleViolation };
export type ConfigParseResult = { config: GameState["config"] } | { error: RuleViolation };

export type ClaimResolution =
  | { type: "unclaimed" }
  | { type: "claimed"; seat: SeatId; action: Action };

export type WinEvaluation = {
  isWin: boolean;
};

export type Settlement = {
  scoreDeltas: readonly number[];
};

/**
 * REVIEW CANDIDATE — Step 3 intentionally stops at this boundary.
 *
 * RuleSet owns variant rules; the future core driver owns event sequencing,
 * immutable state replacement and visibility distribution. The exact hand-off
 * is deliberately exposed here for review before junk behavior is added.
 */
export type RuleSet = {
  id: string;
  tileSet: TileSet;
  phases: readonly PhaseDefinition[];
  parseConfig: (input: unknown) => ConfigParseResult;
  getLegalActions: (state: GameState, seat: SeatId) => readonly Action[];
  getClaimOptions: (state: GameState, seat: SeatId) => readonly ClaimOption[];
  applyAction: (state: GameState, seat: SeatId, action: Action) => RuleSetApplyResult;
  resolveClaims: (state: GameState) => ClaimResolution | undefined;
  evaluateWin: (state: GameState, seat: SeatId) => WinEvaluation;
  settle: (state: GameState) => Settlement;
};
