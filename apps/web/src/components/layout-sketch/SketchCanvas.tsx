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
              left: `${node.centerX?.resolved ?? node.x.resolved + node.w.resolved / 2}%`,
              top: `${node.centerY?.resolved ?? node.y.resolved + node.h.resolved / 2}%`,
              width: `${node.w.resolved}%`,
              height: `${node.h.resolved}%`,
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
        {node.children.map((child) => (
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

const nodesAtPoint = (root: SketchNode, x: number, y: number) => {
  const matches: string[] = [];
  const visit = (node: SketchNode, parent: { x: number; y: number; w: number; h: number }) => {
    const box =
      node.name === "viewport"
        ? parent
        : {
            x: parent.x + (parent.w * node.x.resolved) / 100,
            y: parent.y + (parent.h * node.y.resolved) / 100,
            w: (parent.w * node.w.resolved) / 100,
            h: (parent.h * node.h.resolved) / 100,
          };
    if (
      node.name !== "viewport" &&
      x >= box.x &&
      x <= box.x + box.w &&
      y >= box.y &&
      y <= box.y + box.h
    )
      matches.push(node.name);
    node.children.forEach((child) => visit(child, box));
  };
  visit(root, { x: 0, y: 0, w: 100, h: 100 });
  return matches;
};

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
          const bounds = event.currentTarget.getBoundingClientRect();
          const matches = nodesAtPoint(
            root,
            ((event.clientX - bounds.left) / bounds.width) * 100,
            ((event.clientY - bounds.top) / bounds.height) * 100,
          );
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
