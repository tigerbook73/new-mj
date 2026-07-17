import { Injectable } from "@nestjs/common";
import {
  applyAction as coreApplyAction,
  computeNextDealer as coreComputeNextDealer,
  createGame as coreCreateGame,
  getLegalActions as coreGetLegalActions,
  getOmniscientView as coreGetOmniscientView,
  getPlayerView as coreGetPlayerView,
  type ApplyResult,
  type GameConfig,
  type OmniscientView,
  type PlayerViewBase,
  type SeatId,
} from "@new-mj/core";

/**
 * Thin adapter over @new-mj/core's five engine-api functions (D12, D15).
 * Server orchestration (RoomService) never touches ruleset internals directly.
 */
@Injectable()
export class GameService {
  createGame(config: GameConfig, seed: number, dealer: SeatId): ApplyResult<unknown> {
    return coreCreateGame(config, seed, dealer);
  }

  computeNextDealer(state: unknown, currentDealer: SeatId): SeatId {
    // any: see applyAction — server only round-trips opaque state (D12).
    return coreComputeNextDealer(state as any, currentDealer);
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

  /**
   * Dev/test-only escape hatch (decisions.md D19) — not one of the four
   * engine-api signatures, deliberately bypasses getPlayerView's visibility
   * filtering. Callers must gate access themselves.
   */
  getOmniscientView(state: unknown): OmniscientView {
    // any: see applyAction.
    return coreGetOmniscientView(state as any);
  }
}
