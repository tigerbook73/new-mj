/**
 * Pure, DOM-free port of the Layout Lab's tile-fitting formula (previously
 * expressed as CSS `calc()`/`cqh`/`cqw`). Given a region's real measured
 * pixel box, computes the largest tile size that fits the requested grid
 * without exceeding the region's height budget, row count, or column count.
 * Kept free of React/DOM so it can be reused verbatim if a non-web renderer
 * (e.g. React Native) ever needs the same math against an `onLayout` size.
 */
export interface TileFitConfig {
  columns: number;
  rows: number;
  /** Upper bound on tile height, as a percentage of the container height. */
  heightPct: number;
  /** Tile height / tile width. */
  aspectRatio: number;
  tileGapPx: number;
}

export interface TileFitResult {
  tileWidthPx: number;
  tileHeightPx: number;
}

export function fitTileGrid(
  containerWidthPx: number,
  containerHeightPx: number,
  { columns, rows, heightPct, aspectRatio, tileGapPx }: TileFitConfig,
): TileFitResult {
  const totalRowGapPx = Math.max(0, rows - 1) * tileGapPx;
  const totalColumnGapPx = Math.max(0, columns - 1) * tileGapPx;
  const byHeightPct = (heightPct / 100) * containerHeightPx;
  const byRows = (containerHeightPx - totalRowGapPx) / rows;
  const byColumns = ((containerWidthPx - totalColumnGapPx) * aspectRatio) / columns;
  const tileHeightPx = Math.max(0, Math.min(byHeightPct, byRows, byColumns));
  const tileWidthPx = tileHeightPx / aspectRatio;
  return { tileWidthPx, tileHeightPx };
}
