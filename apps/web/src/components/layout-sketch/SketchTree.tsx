import { Menu } from "@base-ui/react/menu";
import { type RefObject } from "react";
import { Copy, Ellipsis, Grid3X3, Plus, Trash2 } from "lucide-react";
import { type SketchNode } from "@/lib/layoutSketch";

type TreeProps = {
  node: SketchNode;
  selected: string;
  onSelect: (name: string) => void;
  onHover: (name: string | undefined) => void;
  onAddChild: (name: string) => void;
  onDelete: (name: string) => void;
  onCopy: (name: string) => void;
  onConvertToGrid: (name: string) => void;
};

function Tree({
  node,
  selected,
  onSelect,
  onHover,
  onAddChild,
  onDelete,
  onCopy,
  onConvertToGrid,
}: TreeProps) {
  const derived = node.kind === "gridCell";
  return (
    <li className="pl-3">
      <div className="flex gap-1">
        <button
          data-sketch-node={node.name}
          className={`min-w-0 flex-1 rounded px-2 py-1 text-left text-sm hover:bg-slate-700 ${selected === node.name ? "bg-amber-400 text-slate-950 ring-1 ring-amber-200" : ""}`}
          onMouseEnter={() => onHover(node.name)}
          onMouseLeave={() => onHover(undefined)}
          onClick={() => onSelect(node.name)}
        >
          {node.name}
        </button>
        {!derived && (
          <button
            aria-label={`Delete ${node.name}`}
            className="rounded p-1 text-slate-400 hover:bg-red-900 hover:text-red-100"
            onClick={() => onDelete(node.name)}
          >
            <Trash2 size={15} aria-hidden />
          </button>
        )}
        {(node.kind === "element" || node.kind === "grid" || node.kind === "gridCell") && (
          <button
            aria-label={`Add child to ${node.name}`}
            className="rounded p-1 text-slate-300 hover:bg-slate-700 hover:text-white"
            onClick={() => onAddChild(node.name)}
          >
            <Plus size={15} aria-hidden />
          </button>
        )}
        {node.kind === "element" && (
          <Menu.Root modal={false}>
            <Menu.Trigger
              aria-label={`More actions for ${node.name}`}
              className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-white"
            >
              <Ellipsis size={15} aria-hidden />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
                <Menu.Popup className="min-w-36 rounded border border-slate-600 bg-slate-800 p-1 text-slate-100 shadow-xl outline-none">
                  <Menu.Item
                    aria-label={`Copy ${node.name}`}
                    className="flex cursor-default items-center gap-2 rounded px-2 py-1 text-xs outline-none data-[highlighted]:bg-slate-700"
                    onClick={() => onCopy(node.name)}
                  >
                    <Copy size={14} aria-hidden />
                    Copy
                  </Menu.Item>
                  <Menu.Item
                    aria-label={`Convert ${node.name} to grid`}
                    className="flex cursor-default items-center gap-2 rounded px-2 py-1 text-xs outline-none data-[highlighted]:bg-slate-700"
                    onClick={() => onConvertToGrid(node.name)}
                  >
                    <Grid3X3 size={14} aria-hidden />
                    Convert to grid
                  </Menu.Item>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        )}
      </div>
      {node.children.length > 0 &&
        (node.kind === "grid" ? (
          <ul>
            <TreeGroup
              label="Grid cells"
              nodes={node.children.filter((child) => child.kind === "gridCell")}
              selected={selected}
              onSelect={onSelect}
              onHover={onHover}
              onAddChild={onAddChild}
              onDelete={onDelete}
              onCopy={onCopy}
              onConvertToGrid={onConvertToGrid}
            />
            <TreeGroup
              label="Free children"
              nodes={node.children.filter((child) => child.kind !== "gridCell")}
              selected={selected}
              onSelect={onSelect}
              onHover={onHover}
              onAddChild={onAddChild}
              onDelete={onDelete}
              onCopy={onCopy}
              onConvertToGrid={onConvertToGrid}
            />
          </ul>
        ) : (
          <ul>
            {node.children.map((child) => (
              <Tree
                key={child.name}
                node={child}
                selected={selected}
                onSelect={onSelect}
                onHover={onHover}
                onAddChild={onAddChild}
                onDelete={onDelete}
                onCopy={onCopy}
                onConvertToGrid={onConvertToGrid}
              />
            ))}
          </ul>
        ))}
    </li>
  );
}

function TreeGroup({
  label,
  nodes,
  ...props
}: Omit<TreeProps, "node"> & { label: string; nodes: SketchNode[] }) {
  if (nodes.length === 0) return null;
  return (
    <li className="pl-3">
      <p className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <ul>
        {nodes.map((child) => (
          <Tree key={child.name} node={child} {...props} />
        ))}
      </ul>
    </li>
  );
}

export function SketchTreePanel({
  panelRef,
  root,
  ...props
}: Omit<TreeProps, "node"> & { panelRef: RefObject<HTMLElement | null>; root: SketchNode }) {
  return (
    <aside
      ref={panelRef}
      data-testid="layout-tree-panel"
      className="col-start-1 row-start-1 flex min-h-0 flex-col overflow-hidden border-r border-b border-slate-700 bg-slate-900"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-slate-700 px-3 py-2">
        <h2 className="text-sm font-semibold">Viewpoint</h2>
        <button
          aria-label="Add child to Viewpoint"
          className="rounded p-1 text-slate-300 hover:bg-slate-700 hover:text-white"
          onClick={() => props.onAddChild(root.name)}
        >
          <Plus size={15} aria-hidden />
        </button>
      </div>
      <ul
        data-testid="layout-tree-list"
        className="layout-lab-scrollbar min-h-0 flex-1 overflow-x-auto overflow-y-scroll p-3 scrollbar-gutter-stable"
      >
        {root.children.map((child) => (
          <Tree key={child.name} node={child} {...props} />
        ))}
      </ul>
    </aside>
  );
}
