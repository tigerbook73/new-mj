export const SEATS = [0, 1, 2, 3] as const;
export type SeatId = (typeof SEATS)[number];

export type TileId = number;
export type TileKind =
  | `${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}${"m" | "p" | "s"}`
  | `${1 | 2 | 3 | 4 | 5 | 6 | 7}${"z"}`;

export type Phase = "dealing" | "playing" | "awaiting-claims" | "finished";
export type MeldType = "chi" | "peng" | "minGang" | "anGang" | "buGang";

export type Action =
  | { type: "discard"; tile: TileId }
  | { type: "anGang"; kind: TileKind }
  | { type: "buGang"; tile: TileId }
  | { type: "zimo" }
  | { type: "chi"; tiles: [TileId, TileId] }
  | { type: "peng" }
  | { type: "minGang" }
  | { type: "hu" }
  | { type: "pass" };

export type ClaimAction = Extract<Action, { type: "chi" | "peng" | "minGang" | "hu" }>;

export type ClaimOption = {
  action: ClaimAction;
};

export type Meld = {
  type: MeldType;
  tiles: TileId[];
  from?: SeatId;
};

export type DiscardEntry = {
  tile: TileId;
  claimedBy?: SeatId;
};

export type SeatState = {
  hand: TileId[];
  melds: Meld[];
  discards: DiscardEntry[];
};

export type PrngState = {
  seed: number;
  state: number;
};

export type PrngStep = {
  value: number;
  prng: PrngState;
};

export type RandomIntStep = PrngStep;

export type ShuffleResult<T> = {
  items: T[];
  prng: PrngState;
};

export type WallResult = {
  wall: TileId[];
  prng: PrngState;
};

export type DrawResult = {
  tile: TileId;
  wall: TileId[];
};

export type GameConfig = {
  rulesetId: string;
  [key: string]: unknown;
};

export type GameState = {
  config: GameConfig;
  phase: Phase;
  wall: TileId[];
  seats: SeatState[];
  currentSeat: SeatId;
  lastDiscard?: { seat: SeatId; tile: TileId };
  seq: number;
  prng: PrngState;
  variantState: unknown;
};

export type RuleViolation = {
  code: string;
  message?: string;
};

export type EventVisibility =
  | { type: "public" }
  | { type: "seat"; seats: SeatId[] };

export type GameEvent<TPayload = unknown> = {
  seq: number;
  visibility: EventVisibility;
  payload: TPayload;
};
