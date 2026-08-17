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
export type OrdinaryStructuralGateRoute =
  "ordinary-standard" | "seven-pairs" | "other-special" | "ambiguous";
export type OrdinaryStructuralGate = Readonly<{
  route: OrdinaryStructuralGateRoute;
  specialSignals: readonly ("flush" | "all-pungs")[];
  routes: StructuralRouteResult;
}>;
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

/**
 * Conservative route classifier for the ordinary-standard production gate.
 * It is deliberately discrete and weight-free: uncertain or recognisably special
 * hands stay outside the ordinary gate instead of being forced into standard play.
 */
export const classifyOrdinaryStructuralGate = (view: JunkPlayerView): OrdinaryStructuralGate => {
  const melds = view.seats[view.seat]!.melds;
  const routes = evaluateStructuralRoutes(view, view.hand, melds.length);
  const allTiles = [...view.hand, ...melds.flatMap((meld) => meld.tiles)];
  const kinds = allTiles.map((tile) => STANDARD_TILE_SET.kindOf(tile));
  const numberedSuits = new Set(kinds.filter((kind) => !kind.endsWith("z")).map((kind) => kind[1]));
  const concealedCounts = new Map<TileKind, number>();
  for (const tile of view.hand) {
    const kind = STANDARD_TILE_SET.kindOf(tile);
    concealedCounts.set(kind, (concealedCounts.get(kind) ?? 0) + 1);
  }
  const nonChiMelds = melds.filter((meld) => meld.type !== "chi").length;
  const pairOrTripletGroups = [...concealedCounts.values()].filter((count) => count >= 2).length;
  const specialSignals: ("flush" | "all-pungs")[] = [];
  if (numberedSuits.size <= 1) specialSignals.push("flush");
  if (melds.every((meld) => meld.type !== "chi") && nonChiMelds + pairOrTripletGroups >= 4)
    specialSignals.push("all-pungs");

  if (routes.sevenPairs) {
    const comparison = compareStructuralShape(routes.standard, routes.sevenPairs);
    if (comparison > 0) return { route: "seven-pairs", specialSignals, routes };
    if (comparison === 0) return { route: "ambiguous", specialSignals, routes };
  }
  return {
    route: specialSignals.length > 0 ? "other-special" : "ordinary-standard",
    specialSignals,
    routes,
  };
};
