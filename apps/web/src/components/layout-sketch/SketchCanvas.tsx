import { type CSSProperties } from "react";
import { type SketchNode } from "@/lib/layoutSketch";

type SketchBoxProps = {
  node: SketchNode;
  selected: string;
  hovered?: string | undefined;
  showBoundaries: boolean;
  onSelect: (name: string) => void;
  onHover: (name: string | undefined) => void;
  coordinateView: "world" | "parent" | "zone";
  referenceName?: string | undefined;
  unrotatedNames?: readonly string[] | undefined;
  isRoot?: boolean;
};

function SketchBox({
  node,
  selected,
  hovered,
  showBoundaries,
  onSelect,
  onHover,
  coordinateView,
  referenceName,
  unrotatedNames,
  isRoot,
}: SketchBoxProps) {
  const isReference = node.name === referenceName;
  return (
    <div
      className={isRoot ? "relative h-full w-full" : "absolute z-20"}
      style={
        isRoot
          ? undefined
          : {
              // Sketch geometry is a 0-1 ratio internally (see
              // layoutSketch.ts's parsePercentage docs) — CSS percentages
              // need the *100 conversion applied right here at the render
              // boundary, same as exportZone does for the exported
              // LayoutPreset.
              left: `${(node.centerX?.resolved ?? node.x.resolved + node.w.resolved / 2) * 100}%`,
              top: `${(node.centerY?.resolved ?? node.y.resolved + node.h.resolved / 2) * 100}%`,
              width: `${node.w.resolved * 100}%`,
              height: `${node.h.resolved * 100}%`,
              transform: "translate(-50%, -50%)",
            }
      }
    >
      <div
        data-sketch-root={isRoot ? "true" : undefined}
        className="relative h-full w-full"
        style={
          isRoot
            ? {
                backgroundColor: coordinateView === "world" ? undefined : node.backgroundColor,
                transform: "none",
              }
            : {
                backgroundColor: node.backgroundColor,
                transform: `rotate(${unrotatedNames?.includes(node.name) ? 0 : (node.rotationDeg ?? 0)}deg)`,
                transformOrigin: "center",
              }
        }
      >
        {isReference && coordinateView !== "world" && (
          <>
            <div className="pointer-events-none absolute inset-0 z-0 border-2 border-dashed border-amber-500/80" />
            <div className="pointer-events-none absolute right-2 top-2 z-20 rounded bg-amber-500 px-2 py-1 text-xs font-semibold text-slate-950">
              {coordinateView === "parent" ? `Parent: ${node.name}` : `Zone local: ${node.name}`}
            </div>
            <div className="pointer-events-none absolute left-2 top-9 z-20 text-[10px] font-medium text-amber-700">
              → X
            </div>
            <div className="pointer-events-none absolute left-2 top-12 z-20 text-[10px] font-medium text-amber-700">
              ↓ Y
            </div>
            <div className="pointer-events-none absolute left-1/2 top-0 z-10 h-full border-l border-dashed border-amber-500/50" />
            <div className="pointer-events-none absolute left-0 top-1/2 z-10 w-full border-t border-dashed border-amber-500/50" />
          </>
        )}
        {!isRoot && (
          <span className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center text-sm font-medium text-slate-700">
            {node.name}
          </span>
        )}
        {!isRoot && (
          <button
            aria-label={`Select ${node.name}`}
            className="absolute inset-0 z-10 cursor-pointer"
            onMouseEnter={() => onHover(node.name)}
            onMouseLeave={() => onHover(undefined)}
            onClick={(event) => {
              event.stopPropagation();
              if (event.detail === 0) onSelect(node.name);
            }}
          />
        )}
        {!isRoot && (
          <div
            aria-hidden
            className={`pointer-events-none absolute inset-0 ${showBoundaries ? "border border-slate-500" : ""} ${selected === node.name ? "ring-2 ring-amber-500" : hovered === node.name ? "ring-2 ring-sky-400" : ""}`}
          />
        )}
        {node.children
          .filter((child) => !child.hidden)
          .map((child) => (
            <SketchBox
              key={child.name}
              node={child}
              selected={selected}
              hovered={hovered}
              showBoundaries={showBoundaries}
              onSelect={onSelect}
              onHover={onHover}
              coordinateView={coordinateView}
              referenceName={referenceName}
              unrotatedNames={unrotatedNames}
              isRoot={false}
            />
          ))}
      </div>
    </div>
  );
}

const SELECT_LABEL_PREFIX = "Select ";

/**
 * Which nodes' hit-test buttons actually sit under a screen point, ordered
 * root-first (matching the cycling contract below). Delegates to the
 * browser's own `elementsFromPoint` instead of re-deriving each node's box
 * from its unrotated x/y/w/h percentages — that percentage math used to
 * ignore `rotationDeg` entirely, so any 90°/270°-rotated node (left/right
 * seat zones and everything nested under them in the desktop preset — half
 * the tree) had a hit box with the wrong footprint compared to what was
 * actually painted on screen, silently missing clicks on the visible shape
 * or matching the wrong sibling. `elementsFromPoint` respects every CSS
 * transform in the stack for free, since it's real paint-order hit-testing,
 * not a JS reimplementation of it.
 */
const nodesAtScreenPoint = (clientX: number, clientY: number) =>
  document
    .elementsFromPoint(clientX, clientY)
    .map((element) => element.getAttribute("aria-label"))
    .filter((label): label is string => label !== null && label.startsWith(SELECT_LABEL_PREFIX))
    .map((label) => label.slice(SELECT_LABEL_PREFIX.length))
    // elementsFromPoint is topmost-paint-first, i.e. deepest descendant
    // first (nested elements always paint over their own ancestors,
    // regardless of every node sharing the same `z-20` wrapper class —
    // z-index only orders siblings within a stacking context, it can't put
    // an ancestor's background above its own descendant's content) —
    // reversed to match the existing root-to-leaf cycling order (see the
    // "cycles through objects" test: an overlapping child that's already
    // selected cycles back out to its parent first, not the other way
    // around).
    .reverse();

export function SketchCanvas({
  root,
  style,
  ...props
}: Omit<SketchBoxProps, "node"> & { root: SketchNode; style: CSSProperties }) {
  return (
    <section
      className="col-start-2 row-span-2 grid min-w-0 place-items-center overflow-hidden bg-slate-950 p-6"
      style={{ containerType: "size" }}
    >
      <div
        data-testid="layout-sketch-viewport"
        data-coordinate-view={props.coordinateView}
        className={`relative max-w-full bg-slate-200 shadow-lg ${props.coordinateView === "world" ? "max-h-full" : ""}`}
        style={style}
        onClickCapture={(event) => {
          if (event.detail === 0) return;
          const matches = nodesAtScreenPoint(event.clientX, event.clientY);
          if (matches.length === 0) return;
          const current = matches.indexOf(props.selected);
          props.onSelect(
            matches[current < 0 ? matches.length - 1 : (current + 1) % matches.length]!,
          );
        }}
      >
        <div className="pointer-events-none absolute left-2 top-2 z-20 rounded bg-slate-900/80 px-2 py-1 text-xs text-slate-100">
          {props.coordinateView === "world"
            ? "World View"
            : props.coordinateView === "parent"
              ? "Parent View"
              : "Zone View"}
        </div>
        <SketchBox node={root} {...props} isRoot />
      </div>
    </section>
  );
}
