import type { RotationDeg, Zone } from "./layoutPreset";

/** Affine matrix `[a, b, c, d, e, f]`, mapping `(x, y)` to `(ax + cy + e, bx + dy + f)`. */
export type AffineMatrix = readonly [number, number, number, number, number, number];
export type Point = { x: number; y: number };
export type Bounds = { left: number; top: number; width: number; height: number };

export const IDENTITY_MATRIX: AffineMatrix = [1, 0, 0, 1, 0, 0];

export const multiplyMatrix = (left: AffineMatrix, right: AffineMatrix): AffineMatrix => [
  left[0] * right[0] + left[2] * right[1],
  left[1] * right[0] + left[3] * right[1],
  left[0] * right[2] + left[2] * right[3],
  left[1] * right[2] + left[3] * right[3],
  left[0] * right[4] + left[2] * right[5] + left[4],
  left[1] * right[4] + left[3] * right[5] + left[5],
];

export const applyMatrix = (matrix: AffineMatrix, point: Point): Point => ({
  x: matrix[0] * point.x + matrix[2] * point.y + matrix[4],
  y: matrix[1] * point.x + matrix[3] * point.y + matrix[5],
});

export const invertMatrix = (matrix: AffineMatrix): AffineMatrix => {
  const determinant = matrix[0] * matrix[3] - matrix[1] * matrix[2];
  if (Math.abs(determinant) < 1e-9) throw new Error("Zone transform is not invertible");
  return [
    matrix[3] / determinant,
    -matrix[1] / determinant,
    -matrix[2] / determinant,
    matrix[0] / determinant,
    (matrix[2] * matrix[5] - matrix[3] * matrix[4]) / determinant,
    (matrix[1] * matrix[4] - matrix[0] * matrix[5]) / determinant,
  ];
};

const rotationMatrix = (rotation: RotationDeg): AffineMatrix => {
  switch (rotation) {
    case 90:
      return [0, 1, -1, 0, 0, 0];
    case 180:
      return [-1, 0, 0, -1, 0, 0];
    case -90:
      return [0, -1, 1, 0, 0, 0];
    default:
      return IDENTITY_MATRIX;
  }
};

/** Maps a Zone's own unrotated 0–100 local coordinates into its parent coordinate space. */
export const zoneToParentMatrix = (zone: Zone): AffineMatrix => {
  const { x, y } = zone.anchorCenter;
  const { w, h } = zone.localSize;
  const translate = (tx: number, ty: number): AffineMatrix => [1, 0, 0, 1, tx, ty];
  const scale: AffineMatrix = [w / 100, 0, 0, h / 100, 0, 0];
  return multiplyMatrix(
    multiplyMatrix(multiplyMatrix(translate(x, y), rotationMatrix(zone.rotationDeg)), scale),
    translate(-50, -50),
  );
};

export const zoneToWorldMatrix = (ancestors: readonly Zone[], zone: Zone): AffineMatrix =>
  [...ancestors, zone].reduce<AffineMatrix>(
    (matrix, current) => multiplyMatrix(matrix, zoneToParentMatrix(current)),
    IDENTITY_MATRIX,
  );

export const worldToParentPoint = (ancestors: readonly Zone[], point: Point): Point =>
  applyMatrix(
    invertMatrix(
      ancestors.reduce<AffineMatrix>(
        (matrix, current) => multiplyMatrix(matrix, zoneToParentMatrix(current)),
        IDENTITY_MATRIX,
      ),
    ),
    point,
  );

export const visualBounds = (matrix: AffineMatrix): Bounds => {
  const corners = [
    applyMatrix(matrix, { x: 0, y: 0 }),
    applyMatrix(matrix, { x: 100, y: 0 }),
    applyMatrix(matrix, { x: 0, y: 100 }),
    applyMatrix(matrix, { x: 100, y: 100 }),
  ];
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
};

export const findZonePath = (root: Zone, target: string, path: Zone[] = []): Zone[] | undefined => {
  const next = [...path, root];
  if (root.id === target) return next;
  return root.children?.map((child) => findZonePath(child, target, next)).find(Boolean);
};
