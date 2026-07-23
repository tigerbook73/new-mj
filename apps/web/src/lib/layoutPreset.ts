import { createElement, type CSSProperties, type ReactElement, type ReactNode } from "react";

export type RotationDeg = 0 | 90 | 180 | -90;

/** A local coordinate system. Child coordinates and sizes are percentages of this Zone. */
export type Zone = {
  id: string;
  anchorCenter: { x: number; y: number };
  localSize: { w: number; h: number };
  rotationDeg: RotationDeg;
  children?: Zone[] | undefined;
};

export type LayoutPreset = {
  name: string;
  referenceCanvas: { w: number; h: number };
  root: Zone;
  editor?: { version: 1; root: unknown; variables: { name: string; value: string }[] } | undefined;
};

export type ZoneSize = { w: number; h: number };
export type ZoneService = (zone: Zone, children: ReactNode) => ReactNode;

/** The on-screen footprint of a zone. Its local coordinate system is never rotated. */
export function getRenderedZoneSize({ localSize, rotationDeg }: Zone): ZoneSize {
  return Math.abs(rotationDeg) === 90 ? { w: localSize.h, h: localSize.w } : { ...localSize };
}

export function findZone(zone: Zone, id: string): Zone | undefined {
  if (zone.id === id) return zone;
  return zone.children?.find((child) => findZone(child, id));
}

/** CSS translation for a child Zone. Rotation is applied once at the Zone that declares it. */
export function zoneStyle(zone: Zone): CSSProperties {
  return {
    position: "absolute",
    left: `${zone.anchorCenter.x}%`,
    top: `${zone.anchorCenter.y}%`,
    width: `${zone.localSize.w}%`,
    height: `${zone.localSize.h}%`,
    transform: `translate(-50%,-50%) rotate(${zone.rotationDeg}deg)`,
    transformOrigin: "center",
  };
}

/**
 * Pure geometry-to-DOM translation. It owns only positioning and local rotation;
 * callers supply business content by stable zone id.
 */
export function assertLayoutPreset(
  preset: LayoutPreset,
  requiredZoneIds: readonly string[] = [],
): void {
  const ids = new Set<string>();
  const visit = (zone: Zone) => {
    if (ids.has(zone.id)) throw new Error(`Zone id "${zone.id}" is duplicated`);
    ids.add(zone.id);
    zone.children?.forEach(visit);
  };
  visit(preset.root);
  for (const id of requiredZoneIds) {
    if (!ids.has(id)) throw new Error(`Required Zone "${id}" is missing`);
  }
}

/** A single positioned ZoneFrame optionally wraps its recursively-rendered children in a service. */
export function ZoneRenderer({
  zone,
  renderService,
  root = true,
}: {
  zone: Zone;
  renderService?: ZoneService | undefined;
  root?: boolean | undefined;
}): ReactElement {
  const children = zone.children?.map((child) =>
    createElement(ZoneRenderer, {
      key: child.id,
      zone: child,
      ...(renderService ? { renderService } : {}),
      root: false,
    }),
  );
  const service = renderService?.(zone, children);
  const content = service ?? children;
  const hasService = service !== null && service !== undefined;
  return createElement(
    "div",
    {
      "data-zone": zone.id,
      className: "min-h-0 min-w-0",
      style: {
        ...(root ? { position: "relative", width: "100%", height: "100%" } : zoneStyle(zone)),
        pointerEvents: hasService ? "auto" : "none",
      },
    },
    content,
  );
}
