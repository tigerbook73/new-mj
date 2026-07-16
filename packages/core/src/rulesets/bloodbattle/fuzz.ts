import type { GameEvent } from "@/events";
import { assertTileConservation } from "@/lib/invariants";
import { createPrng, nextInt, type PrngState } from "@/lib/prng";
import type { SeatId, TileId } from "@/lib/ids";
import { BLOODBATTLE_TILE_SET } from "./constants.ts";
import { applyAction, createBloodbattleGame, getLegalActions } from "./state-machine.ts";
import type {
  BloodbattleAction,
  BloodbattleApplyResult,
  BloodbattleConfig,
  BloodbattleState,
} from "./types.ts";

export type PlayedBloodbattleGame = {
  state: BloodbattleState;
  events: GameEvent[];
  actions: Array<{ seat: SeatId; action: BloodbattleAction }>;
};

export type BloodbattleFuzzFailure = {
  seed: number;
  config: Partial<Omit<BloodbattleConfig, "rulesetId">>;
  actions: Array<{ seat: SeatId; action: BloodbattleAction }>;
  error: string;
};

const seats = [0, 1, 2, 3] as const;
const extraTiles = (state: BloodbattleState): readonly TileId[] =>
  Object.values(state.wins ?? {}).flatMap((win) => win!.hand);

const chooseRandom = <T>(values: readonly T[], prng: PrngState): { value: T; prng: PrngState } => {
  const picked = nextInt(prng, values.length);
  return { value: values[picked.value]!, prng: picked.prng };
};

const exchangeOptions = (state: BloodbattleState, seat: SeatId): [TileId, TileId, TileId][] => {
  const hand = state.seats[seat]!.hand;
  return ["m", "p", "s"].flatMap((suit) => {
    const tiles = hand.filter((tile) => BLOODBATTLE_TILE_SET.kindOf(tile)[1] === suit);
    return tiles.length >= 3 ? [[tiles[0]!, tiles[1]!, tiles[2]!]] : [];
  });
};

const assertState = (state: BloodbattleState): void =>
  assertTileConservation(state, BLOODBATTLE_TILE_SET, extraTiles);

const selectAction = (
  state: BloodbattleState,
  prng: PrngState,
): { seat: SeatId; action: BloodbattleAction; prng: PrngState } | undefined => {
  if (state.phase === "exchanging") {
    const eligible = seats.filter((seat) => !state.exchange?.selections[seat]);
    if (eligible.length === 0) return undefined;
    const pickedSeat = chooseRandom(eligible, prng);
    const options = exchangeOptions(state, pickedSeat.value);
    if (options.length === 0) return undefined;
    const pickedTiles = chooseRandom(options, pickedSeat.prng);
    return {
      seat: pickedSeat.value,
      action: { type: "exchangeThree", tiles: pickedTiles.value },
      prng: pickedTiles.prng,
    };
  }
  if (state.phase === "choosing-lack") {
    const eligible = seats.filter((seat) => state.lack?.[seat] === undefined);
    if (eligible.length === 0) return undefined;
    const pickedSeat = chooseRandom(eligible, prng);
    const suits = ["m", "p", "s"] as const;
    const available = suits.filter((suit) =>
      state.seats[pickedSeat.value]!.hand.some(
        (tile) => BLOODBATTLE_TILE_SET.kindOf(tile)[1] === suit,
      ),
    );
    const pickedSuit = chooseRandom(available, pickedSeat.prng);
    return {
      seat: pickedSeat.value,
      action: { type: "chooseLack", suit: pickedSuit.value },
      prng: pickedSuit.prng,
    };
  }
  const eligible = seats.flatMap((seat) => {
    const actions = getLegalActions(state, seat);
    return actions.length > 0 ? [{ seat, actions }] : [];
  });
  if (eligible.length === 0) return undefined;
  const pickedSeat = chooseRandom(eligible, prng);
  const pickedAction = chooseRandom(pickedSeat.value.actions, pickedSeat.prng);
  return { seat: pickedSeat.value.seat, action: pickedAction.value, prng: pickedAction.prng };
};

export const playBloodbattleGame = (
  seed: number,
  config: Partial<Omit<BloodbattleConfig, "rulesetId">> = {},
  actionLog: Array<{ seat: SeatId; action: BloodbattleAction }> = [],
  dealer: SeatId = 0,
): PlayedBloodbattleGame | BloodbattleFuzzFailure => {
  const started = createBloodbattleGame(seed, dealer, config);
  if ("error" in started) return { seed, config, actions: [], error: started.error.code };
  let state = started.state;
  let prng = createPrng(seed ^ 0x9e37_79b9);
  const events = [...started.events];
  const actions: Array<{ seat: SeatId; action: BloodbattleAction }> = [];
  assertState(state);
  for (let step = 0; step < 1_000 && state.phase !== "finished"; step += 1) {
    const selected = actionLog[step] ? { ...actionLog[step]!, prng } : selectAction(state, prng);
    if (!selected) return { seed, config, actions, error: "NO_LEGAL_ACTION" };
    prng = selected.prng;
    actions.push({ seat: selected.seat, action: selected.action });
    let result: BloodbattleApplyResult;
    try {
      result = applyAction(state, selected.seat, selected.action);
    } catch (error) {
      return {
        seed,
        config,
        actions,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    if ("error" in result) return { seed, config, actions, error: result.error.code };
    state = result.state;
    try {
      assertState(state);
    } catch (error) {
      return {
        seed,
        config,
        actions,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    events.push(...result.events);
  }
  return state.phase === "finished"
    ? { state, events, actions }
    : { seed, config, actions, error: "STEP_LIMIT_EXCEEDED" };
};

export const fuzzBloodbattleGames = (
  games: number,
  seed = 1,
): BloodbattleFuzzFailure | undefined => {
  let prng = createPrng(seed);
  for (let index = 0; index < games; index += 1) {
    const gameSeed = nextInt(prng, 0x1_0000_0000);
    prng = gameSeed.prng;
    const switches = nextInt(prng, 256);
    prng = switches.prng;
    const dealerPick = nextInt(prng, 4);
    prng = dealerPick.prng;
    const config = {
      exchangeThree: (switches.value & 1) !== 0,
      multiWinOnDiscard: (switches.value & 2) !== 0,
      robKong: (switches.value & 4) !== 0,
      checkHuaZhu: (switches.value & 8) !== 0,
      checkDaJiao: (switches.value & 16) !== 0,
      gangRefund: (switches.value & 32) !== 0,
      selfDrawBonus: (switches.value & 64) !== 0 ? ("addBase" as const) : ("addFan" as const),
      capFan: (switches.value & 128) !== 0 ? 0 : 4,
    };
    const result = playBloodbattleGame(gameSeed.value, config, [], dealerPick.value as SeatId);
    if ("error" in result) return result;
  }
  return undefined;
};
