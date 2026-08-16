import {
  STANDARD_TILE_SET,
  sevenPairsShanten,
  tileIdOf,
  type JunkPlayerView,
  type TileId,
  type TileKind,
} from "@new-mj/core";
import {
  compareStructuralShape,
  structuralShapeOf,
  structuralVisibleKindCounts,
  visibleStructuralTileIds,
  type StructuralShape,
} from "./structural-discard.ts";

export type StructuralRoute = "standard" | "sevenPairs";
export type StructuralRouteResult = Readonly<{
  selectedRoute: StructuralRoute;
  standard: StructuralShape;
  sevenPairs: StructuralShape | null;
}>;

const sevenPairsShapeOf = (
  hand: readonly TileId[],
  visibleCounts: ReadonlyMap<TileKind, number>,
): StructuralShape => {
  const shanten = sevenPairsShanten(hand, STANDARD_TILE_SET);
  const improvingKinds = STANDARD_TILE_SET.kinds.filter((kind) => {
    const held = hand.filter((tile) => STANDARD_TILE_SET.kindOf(tile) === kind).length;
    return (
      held < STANDARD_TILE_SET.copiesPerKind &&
      sevenPairsShanten([...hand, tileIdOf(kind, 0)], STANDARD_TILE_SET) < shanten
    );
  });
  const liveCopies = improvingKinds.map((kind) =>
    Math.max(0, STANDARD_TILE_SET.copiesPerKind - (visibleCounts.get(kind) ?? 0)),
  );
  return {
    standardShanten: shanten,
    liveImprovingKindCount: liveCopies.filter((copies) => copies > 0).length,
    liveImprovingTileCount: liveCopies.reduce((sum, copies) => sum + copies, 0),
  };
};

/** Explicit standard/seven-pairs route facts; exact ties remain on standard. */
export const evaluateStructuralRoutes = (
  view: JunkPlayerView,
  hand: readonly TileId[],
  existingMelds: number,
): StructuralRouteResult => {
  const counts = structuralVisibleKindCounts(visibleStructuralTileIds(view));
  const standard = structuralShapeOf(hand, counts, existingMelds);
  const sevenPairs = existingMelds === 0 ? sevenPairsShapeOf(hand, counts) : null;
  return {
    selectedRoute:
      sevenPairs && compareStructuralShape(sevenPairs, standard) < 0 ? "sevenPairs" : "standard",
    standard,
    sevenPairs,
  };
};
