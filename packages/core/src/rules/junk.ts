import { assertTileConservation } from "../invariants.ts";
import { createEvent, nextEventSeq } from "../events.ts";
import { createPrng, nextInt } from "../prng.ts";
import type { ClaimResolution, RuleSet, RuleSetApplyResult } from "../ruleset.ts";
import { STANDARD_TILE_SET } from "../tiles.ts";
import { createWall, drawFromHead, drawFromTail } from "../wall.ts";
import { isSevenPairsWinningHand, isStandardWinningHand } from "../win.ts";
import type {
  Action,
  ClaimAction,
  ClaimOption,
  GameEvent,
  GameResult,
  GameState,
  JunkConfig,
  Meld,
  PlayerView,
  SeatId,
  SeatState,
  TileId,
  TileKind,
} from "../types.ts";

export const DEFAULT_JUNK_CONFIG: JunkConfig = {
  rulesetId: "junk",
  sevenPairs: false,
  robKong: false,
  multiHuPolicy: "headJump",
};

export const parseJunkConfig = (input: unknown): { config: JunkConfig } | { error: { code: string } } => {
  if (input === undefined) return { config: { ...DEFAULT_JUNK_CONFIG } };
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: { code: "INVALID_CONFIG" } };
  const candidate = input as Record<string, unknown>;
  if (
    (candidate.rulesetId !== undefined && candidate.rulesetId !== "junk") ||
    (candidate.sevenPairs !== undefined && typeof candidate.sevenPairs !== "boolean") ||
    (candidate.robKong !== undefined && typeof candidate.robKong !== "boolean") ||
    (candidate.multiHuPolicy !== undefined && candidate.multiHuPolicy !== "headJump" && candidate.multiHuPolicy !== "all")
  ) {
    return { error: { code: "INVALID_CONFIG" } };
  }
  return {
    config: {
      ...DEFAULT_JUNK_CONFIG,
      ...(candidate.sevenPairs === undefined ? {} : { sevenPairs: candidate.sevenPairs }),
      ...(candidate.robKong === undefined ? {} : { robKong: candidate.robKong }),
      ...(candidate.multiHuPolicy === undefined ? {} : { multiHuPolicy: candidate.multiHuPolicy }),
    },
  };
};

const seats = (): SeatState[] => [0, 1, 2, 3].map(() => ({ hand: [], melds: [], discards: [] }));
const nextSeat = (seat: SeatId): SeatId => ((seat + 1) % 4) as SeatId;
const cloneState = (state: GameState): GameState => {
  const cloned: GameState = {
    ...state,
  wall: [...state.wall],
  seats: state.seats.map((seat) => ({
    hand: [...seat.hand],
    melds: seat.melds.map((meld) => ({ ...meld, tiles: [...meld.tiles] })),
    discards: seat.discards.map((discard) => ({ ...discard })),
  })),
  };
  if (state.pendingClaims) {
    cloned.pendingClaims = {
        discard: { ...state.pendingClaims.discard },
        options: { ...state.pendingClaims.options },
        responses: { ...state.pendingClaims.responses },
    };
  }
  return cloned;
};

const publicVisibility = { type: "public" } as const;
const seatVisibility = (seat: SeatId) => ({ type: "seat" as const, seats: [seat] });

const appendEvent = (state: GameState, events: GameEvent[], visibility: GameEvent["visibility"], payload: unknown): void => {
  state.seq = nextEventSeq(state.seq);
  events.push(createEvent(state.seq, visibility, payload));
};

const fail = (code: string): RuleSetApplyResult => ({ error: { code } });

const configOf = (state: GameState): JunkConfig => ({ ...DEFAULT_JUNK_CONFIG, ...state.config, rulesetId: "junk" });

const sameKind = (tiles: readonly TileId[], kind: TileKind): TileId[] =>
  tiles.filter((tile) => STANDARD_TILE_SET.kindOf(tile) === kind);

const removeTiles = (hand: readonly TileId[], tiles: readonly TileId[]): TileId[] | undefined => {
  const remaining = [...hand];
  for (const tile of tiles) {
    const index = remaining.indexOf(tile);
    if (index < 0) return undefined;
    remaining.splice(index, 1);
  }
  return remaining;
};

const tileRank = (tile: TileId): number => Number(STANDARD_TILE_SET.kindOf(tile)[0]);
const tileSuit = (tile: TileId): string => STANDARD_TILE_SET.kindOf(tile)[1] as string;

const winningTiles = (state: GameState, seat: SeatId, extra?: TileId): TileId[] => {
  const own = state.seats[seat] as SeatState;
  const tiles = extra === undefined ? own.hand : [...own.hand, extra];
  return [...tiles, ...own.melds.flatMap((meld) => meld.tiles)];
};

const isWin = (state: GameState, seat: SeatId, extra?: TileId): boolean => {
  const tiles = winningTiles(state, seat, extra);
  const own = state.seats[seat]!;
  return isStandardWinningHand(tiles, STANDARD_TILE_SET) ||
    (configOf(state).sevenPairs && own.melds.length === 0 && isSevenPairsWinningHand(tiles, STANDARD_TILE_SET));
};

const chiOptions = (state: GameState, seat: SeatId, discarded: TileId): ClaimOption[] => {
  const kind = STANDARD_TILE_SET.kindOf(discarded);
  if (kind.endsWith("z")) return [];
  const rank = tileRank(discarded);
  const suit = tileSuit(discarded);
  const hand = state.seats[seat]!.hand;
  const options: ClaimOption[] = [];
  const combinations: Array<[number, number]> = [[rank - 2, rank - 1], [rank - 1, rank + 1], [rank + 1, rank + 2]];
  for (const [first, second] of combinations) {
    if (first < 1 || second > 9) continue;
    const firstTile = hand.find((tile) => STANDARD_TILE_SET.kindOf(tile) === `${first}${suit}`);
    const secondTile = hand.find((tile) => STANDARD_TILE_SET.kindOf(tile) === `${second}${suit}` && tile !== firstTile);
    if (firstTile !== undefined && secondTile !== undefined) {
      options.push({ action: { type: "chi", tiles: [firstTile, secondTile] } });
    }
  }
  return options;
};

const claimOptions = (state: GameState, seat: SeatId): ClaimOption[] => {
  const pending = state.pendingClaims;
  if (!pending || pending.discard.seat === seat) return [];
  const tile = pending.discard.tile;
  if (pending.source === "robKong") return isWin(state, seat, tile) ? [{ action: { type: "hu" } }] : [];
  const kind = STANDARD_TILE_SET.kindOf(tile);
  const hand = state.seats[seat]!.hand;
  const matching = sameKind(hand, kind);
  const options: ClaimOption[] = [];
  if (isWin(state, seat, tile)) options.push({ action: { type: "hu" } });
  if (matching.length >= 3) options.push({ action: { type: "minGang" } });
  if (matching.length >= 2) options.push({ action: { type: "peng" } });
  if (seat === nextSeat(pending.discard.seat)) options.push(...chiOptions(state, seat, tile));
  return options;
};

const emitDraw = (state: GameState, events: GameEvent[], seat: SeatId, replacement: boolean): boolean => {
  const drawn = replacement ? drawFromTail(state.wall) : drawFromHead(state.wall);
  if (!drawn) {
    state.phase = "finished";
    state.result = { type: "draw", scoreDeltas: [0, 0, 0, 0] };
    appendEvent(state, events, publicVisibility, { type: "WallExhausted" });
    appendEvent(state, events, publicVisibility, { type: "GameEnded", result: state.result });
    return false;
  }
  state.wall = drawn.wall;
  state.seats[seat]!.hand.push(drawn.tile);
  appendEvent(state, events, publicVisibility, { type: replacement ? "GangReplacementDrawn" : "TileDrawn", seat });
  appendEvent(state, events, seatVisibility(seat), {
    type: replacement ? "GangReplacementDrawn" : "TileDrawn",
    seat,
    tile: drawn.tile,
  });
  return true;
};

const beginTurn = (state: GameState, events: GameEvent[], seat: SeatId, draw: boolean, replacement = false): void => {
  state.currentSeat = seat;
  state.phase = "playing";
  if (draw && !emitDraw(state, events, seat, replacement)) return;
  appendEvent(state, events, publicVisibility, { type: "TurnStarted", seat });
};

const settleWins = (winners: SeatId[], winType: "zimo" | "ron", from?: SeatId): GameResult => {
  const scoreDeltas: [number, number, number, number] = [0, 0, 0, 0];
  if (winType === "zimo") {
    for (const seat of [0, 1, 2, 3] as SeatId[]) {
      if (seat === winners[0]) continue;
      scoreDeltas[seat] -= 1;
      scoreDeltas[winners[0]!] += 1;
    }
  } else if (from !== undefined) {
    for (const winner of winners) {
      scoreDeltas[from] -= 1;
      scoreDeltas[winner] += 1;
    }
  }
  return from === undefined
    ? { type: "win", winner: winners[0]!, winners, winType, scoreDeltas }
    : { type: "win", winner: winners[0]!, winners, winType, from, scoreDeltas };
};

const finishWin = (
  state: GameState,
  events: GameEvent[],
  winner: SeatId,
  winType: "zimo" | "ron",
  from?: SeatId,
  winningTile?: TileId,
): void => {
  const result = settleWins([winner], winType, from);
  state.phase = "finished";
  state.result = result;
  const revealedHand = winningTile === undefined
    ? [...state.seats[winner]!.hand]
    : [...state.seats[winner]!.hand, winningTile];
  const payload = from === undefined
    ? { type: "HuDeclared", seat: winner, winType, hand: revealedHand }
    : { type: "HuDeclared", seat: winner, winType, hand: revealedHand, from };
  appendEvent(state, events, publicVisibility, payload);
  appendEvent(state, events, publicVisibility, { type: "Settled", scoreDeltas: result.scoreDeltas });
  appendEvent(state, events, publicVisibility, { type: "GameEnded", result });
};

const finishRonWins = (state: GameState, events: GameEvent[], winners: SeatId[], from: SeatId, tile: TileId): void => {
  const result = settleWins(winners, "ron", from);
  state.phase = "finished";
  state.result = result;
  for (const winner of winners) {
    appendEvent(state, events, publicVisibility, {
      type: "HuDeclared",
      seat: winner,
      winType: "ron",
      hand: [...state.seats[winner]!.hand, tile],
      from,
    });
  }
  appendEvent(state, events, publicVisibility, { type: "Settled", scoreDeltas: result.scoreDeltas });
  appendEvent(state, events, publicVisibility, { type: "GameEnded", result });
};

const resolveUnclaimed = (state: GameState, events: GameEvent[]): void => {
  if (state.pendingClaims!.source === "robKong") {
    const { seat, tile } = state.pendingClaims!.discard;
    delete state.pendingClaims;
    const meld = state.seats[seat]!.melds.find((candidate) =>
      candidate.type === "peng" && STANDARD_TILE_SET.kindOf(candidate.tiles[0]!) === STANDARD_TILE_SET.kindOf(tile),
    )!;
    state.seats[seat]!.hand = removeTiles(state.seats[seat]!.hand, [tile])!;
    meld.type = "buGang";
    meld.tiles.push(tile);
    appendEvent(state, events, publicVisibility, { type: "ClaimWindowResolved", result: "unclaimed" });
    appendEvent(state, events, publicVisibility, { type: "GangMade", seat, gangType: "buGang", tiles: [...meld.tiles] });
    beginTurn(state, events, seat, true, true);
    return;
  }
  const discardedBy = state.pendingClaims!.discard.seat;
  delete state.pendingClaims;
  appendEvent(state, events, publicVisibility, { type: "ClaimWindowResolved", result: "unclaimed" });
  beginTurn(state, events, nextSeat(discardedBy), true);
};

const priority = (action: ClaimAction): number => ({ hu: 4, minGang: 3, peng: 2, chi: 1 })[action.type];
const distanceFromDiscarder = (discarder: SeatId, seat: SeatId): number => (seat - discarder + 4) % 4;

const chooseClaims = (state: GameState): Array<{ seat: SeatId; action: ClaimAction }> => {
  const pending = state.pendingClaims!;
  const choices = Object.entries(pending.responses)
    .filter((entry): entry is [string, ClaimAction] => entry[1].type !== "pass")
    .map(([seat, action]) => ({ seat: Number(seat) as SeatId, action: action as ClaimAction }));
  const sorted = choices.sort((left, right) => {
    const priorityDiff = priority(right.action) - priority(left.action);
    return priorityDiff !== 0 ? priorityDiff : distanceFromDiscarder(pending.discard.seat, left.seat) - distanceFromDiscarder(pending.discard.seat, right.seat);
  });
  if (sorted[0]?.action.type === "hu" && configOf(state).multiHuPolicy === "all") {
    return sorted.filter((choice) => choice.action.type === "hu");
  }
  return sorted.slice(0, 1);
};

const resolveClaimWindow = (state: GameState, events: GameEvent[]): void => {
  const pending = state.pendingClaims!;
  const winners = chooseClaims(state);
  if (winners.length === 0) return resolveUnclaimed(state, events);
  const { seat, action } = winners[0]!;
  const discard = pending.discard;
  delete state.pendingClaims;
  appendEvent(state, events, publicVisibility, { type: "ClaimWindowResolved", seat, action: action.type });
  if (action.type === "hu") {
    // A ron tile stays physically in the active river. It is revealed in the
    // terminal event, rather than moved into a meld (only chi/peng/gang claim it).
    finishRonWins(state, events, winners.map((winner) => winner.seat), discard.seat, discard.tile);
    return;
  }
  state.seats[discard.seat]!.discards.find((entry) => entry.tile === discard.tile && entry.claimedBy === undefined)!.claimedBy = seat;
  const hand = state.seats[seat]!.hand;
  const useTiles = action.type === "chi"
    ? action.tiles
    : sameKind(hand, STANDARD_TILE_SET.kindOf(discard.tile)).slice(0, action.type === "minGang" ? 3 : 2);
  const remaining = removeTiles(hand, useTiles)!;
  state.seats[seat]!.hand = remaining;
  const meld: Meld = { type: action.type, tiles: [...useTiles, discard.tile], from: discard.seat };
  state.seats[seat]!.melds.push(meld);
  const eventType = action.type === "chi" ? "ChiMade" : action.type === "peng" ? "PengMade" : "GangMade";
  appendEvent(state, events, publicVisibility, { type: eventType, seat, tiles: meld.tiles, from: discard.seat });
  beginTurn(state, events, seat, action.type === "minGang", action.type === "minGang");
};

const allResponded = (state: GameState): boolean => {
  const pending = state.pendingClaims!;
  return Object.keys(pending.options).every((seat) => pending.responses[Number(seat) as SeatId] !== undefined);
};

const actionEquals = (left: Action, right: Action): boolean => JSON.stringify(left) === JSON.stringify(right);

const applyDiscard = (state: GameState, seat: SeatId, tile: TileId, events: GameEvent[]): RuleSetApplyResult => {
  if (state.phase !== "playing" || state.currentSeat !== seat) return fail("NOT_YOUR_TURN");
  const hand = state.seats[seat]!.hand;
  const remaining = removeTiles(hand, [tile]);
  if (!remaining) return fail("TILE_NOT_IN_HAND");
  state.seats[seat]!.hand = remaining;
  state.seats[seat]!.discards.push({ tile });
  state.lastDiscard = { seat, tile };
  appendEvent(state, events, publicVisibility, { type: "TileDiscarded", seat, tile });
  const options: GameState["pendingClaims"] extends infer T ? T : never = { discard: { seat, tile }, options: {}, responses: {} };
  state.pendingClaims = options;
  for (const candidate of [0, 1, 2, 3] as SeatId[]) {
    const candidateOptions = claimOptions(state, candidate);
    if (candidateOptions.length === 0) continue;
    options.options[candidate] = candidateOptions;
    appendEvent(state, events, seatVisibility(candidate), { type: "ClaimWindowOpened", options: candidateOptions });
  }
  if (Object.keys(options.options).length === 0) {
    resolveUnclaimed(state, events);
  } else {
    state.phase = "awaiting-claims";
  }
  return { state, events };
};

const applyClaimResponse = (state: GameState, seat: SeatId, action: Action, events: GameEvent[]): RuleSetApplyResult => {
  if (state.phase !== "awaiting-claims" || !state.pendingClaims) return fail("CLAIM_WINDOW_NOT_OPEN");
  const options = state.pendingClaims.options[seat];
  if (!options || state.pendingClaims.responses[seat]) return fail("CLAIM_NOT_AVAILABLE");
  if (action.type !== "pass" && !options.some((option) => actionEquals(option.action, action))) return fail("CLAIM_NOT_AVAILABLE");
  state.pendingClaims.responses[seat] = action;
  appendEvent(state, events, seatVisibility(seat), { type: "ClaimResponded", action });
  if (allResponded(state)) resolveClaimWindow(state, events);
  return { state, events };
};

const applyAnGang = (state: GameState, seat: SeatId, kind: TileKind, events: GameEvent[]): RuleSetApplyResult => {
  if (state.phase !== "playing" || state.currentSeat !== seat) return fail("NOT_YOUR_TURN");
  const tiles = sameKind(state.seats[seat]!.hand, kind).slice(0, 4);
  if (tiles.length !== 4) return fail("GANG_NOT_AVAILABLE");
  state.seats[seat]!.hand = removeTiles(state.seats[seat]!.hand, tiles)!;
  state.seats[seat]!.melds.push({ type: "anGang", tiles });
  appendEvent(state, events, publicVisibility, { type: "GangMade", seat, gangType: "anGang" });
  appendEvent(state, events, seatVisibility(seat), { type: "GangMade", seat, gangType: "anGang", tiles });
  beginTurn(state, events, seat, true, true);
  return { state, events };
};

const applyBuGang = (state: GameState, seat: SeatId, tile: TileId, events: GameEvent[]): RuleSetApplyResult => {
  if (state.phase !== "playing" || state.currentSeat !== seat) return fail("NOT_YOUR_TURN");
  if (!state.seats[seat]!.hand.includes(tile)) return fail("TILE_NOT_IN_HAND");
  const kind = STANDARD_TILE_SET.kindOf(tile);
  const meld = state.seats[seat]!.melds.find((candidate) => candidate.type === "peng" && STANDARD_TILE_SET.kindOf(candidate.tiles[0]!) === kind);
  if (!meld) return fail("GANG_NOT_AVAILABLE");
  if (configOf(state).robKong) {
    state.pendingClaims = { discard: { seat, tile }, source: "robKong", options: {}, responses: {} };
    for (const candidate of [0, 1, 2, 3] as SeatId[]) {
      const candidateOptions = claimOptions(state, candidate);
      if (candidateOptions.length === 0) continue;
      state.pendingClaims.options[candidate] = candidateOptions;
      appendEvent(state, events, seatVisibility(candidate), { type: "ClaimWindowOpened", options: candidateOptions });
    }
    if (Object.keys(state.pendingClaims.options).length > 0) {
      state.phase = "awaiting-claims";
      return { state, events };
    }
    resolveUnclaimed(state, events);
    return { state, events };
  }
  state.seats[seat]!.hand = removeTiles(state.seats[seat]!.hand, [tile])!;
  meld.type = "buGang";
  meld.tiles.push(tile);
  appendEvent(state, events, publicVisibility, { type: "GangMade", seat, gangType: "buGang", tiles: [...meld.tiles] });
  beginTurn(state, events, seat, true, true);
  return { state, events };
};

export const createJunkGame = (seed: number, config: unknown = {}): RuleSetApplyResult => {
  const parsed = parseJunkConfig(config);
  if ("error" in parsed) return parsed;
  const first = nextInt(createPrng(seed), 4);
  const dealer = first.value as SeatId;
  const shuffled = createWall(first.prng);
  const state: GameState = {
    config: parsed.config,
    phase: "dealing",
    wall: shuffled.wall,
    seats: seats(),
    currentSeat: dealer,
    seq: 0,
    prng: shuffled.prng,
    variantState: {},
  };
  const events: GameEvent[] = [];
  appendEvent(state, events, publicVisibility, {
    type: "GameStarted",
    config: state.config,
    dealer,
    handCounts: ([0, 1, 2, 3] as SeatId[]).map((seat) => seat === dealer ? 14 : 13),
    wallCount: state.wall.length - 53,
  });
  for (const seat of [0, 1, 2, 3] as SeatId[]) {
    const count = seat === dealer ? 14 : 13;
    for (let index = 0; index < count; index += 1) state.seats[seat]!.hand.push(state.wall.shift()!);
    appendEvent(state, events, seatVisibility(seat), { type: "HandDealt", seat, tiles: [...state.seats[seat]!.hand] });
  }
  state.phase = "playing";
  appendEvent(state, events, publicVisibility, { type: "TurnStarted", seat: dealer });
  assertTileConservation(state);
  return { state, events };
};

export const junkRuleSet: RuleSet = {
  id: "junk",
  tileSet: STANDARD_TILE_SET,
  phases: [
    { id: "dealing", next: ["playing"] },
    { id: "playing", next: ["awaiting-claims", "finished"] },
    { id: "awaiting-claims", next: ["playing", "finished"] },
    { id: "finished", next: [] },
  ],
  parseConfig: parseJunkConfig,
  getLegalActions: (state, seat) => {
    if (state.phase === "awaiting-claims") {
      const options = state.pendingClaims?.options[seat] ?? [];
      if (state.pendingClaims?.responses[seat]) return [];
      return options.length > 0 ? [...options.map((option) => option.action), { type: "pass" }] : [];
    }
    if (state.phase !== "playing" || state.currentSeat !== seat) return [];
    const hand = state.seats[seat]!.hand;
    const actions: Action[] = hand.map((tile) => ({ type: "discard", tile }));
    for (const kind of STANDARD_TILE_SET.kinds) {
      if (sameKind(hand, kind).length === 4) actions.push({ type: "anGang", kind });
    }
    for (const meld of state.seats[seat]!.melds) {
      if (meld.type !== "peng") continue;
      const kind = STANDARD_TILE_SET.kindOf(meld.tiles[0]!);
      const tile = sameKind(hand, kind)[0];
      if (tile !== undefined) actions.push({ type: "buGang", tile });
    }
    if (isWin(state, seat)) actions.push({ type: "zimo" });
    return actions;
  },
  getClaimOptions: (state, seat) => state.pendingClaims?.options[seat] ?? [],
  applyAction: (input, seat, action) => {
    const state = cloneState(input);
    const events: GameEvent[] = [];
    let result: RuleSetApplyResult;
    if (action.type === "discard") result = applyDiscard(state, seat, action.tile, events);
    else if (["chi", "peng", "minGang", "hu", "pass"].includes(action.type)) result = applyClaimResponse(state, seat, action, events);
    else if (action.type === "anGang") result = applyAnGang(state, seat, action.kind, events);
    else if (action.type === "buGang") result = applyBuGang(state, seat, action.tile, events);
    else if (action.type === "zimo") {
      result = state.phase !== "playing" || state.currentSeat !== seat || !isWin(state, seat)
        ? fail("ZIMO_NOT_AVAILABLE")
        : (() => {
            finishWin(state, events, seat, "zimo");
            return { state, events };
          })();
    } else result = fail("UNKNOWN_ACTION");
    if ("state" in result) assertTileConservation(result.state);
    return result;
  },
  resolveClaims: (state): ClaimResolution | undefined => {
    if (!state.pendingClaims) return undefined;
    const choice = chooseClaims(state)[0];
    return choice ? { type: "claimed", ...choice } : { type: "unclaimed" };
  },
  evaluateWin: (state, seat) => ({ isWin: isWin(state, seat) }),
  settle: (state) => ({ scoreDeltas: state.result?.scoreDeltas ?? [0, 0, 0, 0] }),
};

export const getPlayerView = (state: GameState, seat: SeatId): PlayerView => {
  const pending = state.pendingClaims;
  const ownResponse = pending?.responses[seat];
  const view: PlayerView = {
    seat,
    hand: [...state.seats[seat]!.hand],
    seats: state.seats.map((entry, index) => ({
      melds: entry.melds.map((meld) => ({
        ...meld,
        tiles: meld.type === "anGang" && index !== seat ? [] : [...meld.tiles],
      })),
      discards: entry.discards.map((discard) => ({ ...discard })),
      handCount: entry.hand.length,
    })),
    wallCount: state.wall.length,
    currentSeat: state.currentSeat,
    phase: state.phase,
  };
  if (state.lastDiscard) view.lastDiscard = { ...state.lastDiscard };
  if (state.result) view.result = state.result;
  if (pending?.options[seat]) view.myClaimOptions = [...pending.options[seat]];
  if (ownResponse) view.myClaimResponse = ownResponse;
  return view;
};
