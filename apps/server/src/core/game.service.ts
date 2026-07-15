import { Injectable } from "@nestjs/common";
import {
  applyAction as coreApplyAction,
  createGame as coreCreateGame,
  getLegalActions as coreGetLegalActions,
  getPlayerView as coreGetPlayerView,
  type ApplyResult,
  type GameConfig,
  type PlayerViewBase,
  type SeatId,
} from "@new-mj/core";

/**
 * Thin adapter over @new-mj/core's four engine-api functions (D12). Server
 * orchestration (RoomService) never touches ruleset internals directly.
 */
@Injectable()
export class GameService {
  createGame(config: GameConfig, seed: number): ApplyResult<unknown> {
    return coreCreateGame(config, seed);
  }

  applyAction(state: unknown, seat: SeatId, action: unknown): ApplyResult<unknown> {
    // any: core's applyAction expects an internal { config: GameConfig }
    // shape that isn't part of the public API surface; server only ever
    // round-trips the opaque state it received from a prior ApplyResult.
    return coreApplyAction(state as any, seat, action);
  }

  getLegalActions(state: unknown, seat: SeatId): readonly unknown[] {
    // any: see applyAction.
    return coreGetLegalActions(state as any, seat);
  }

  getPlayerView(state: unknown, seat: SeatId): PlayerViewBase | undefined {
    // any: see applyAction.
    return coreGetPlayerView(state as any, seat);
  }
}
