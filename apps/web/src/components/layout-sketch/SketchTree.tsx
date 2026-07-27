import { Menu } from "@base-ui/react/menu";
import { useMemo, useRef, useState, type RefObject } from "react";
import {
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Copy,
  Ellipsis,
  Eye,
  EyeOff,
  GripVertical,
  Grid3X3,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { isGridCellSlotName, namesMatchingQuery, type SketchNode } from "@/lib/layoutSketch";
import { useDragSort } from "@/hooks/useDragSort";

type DragSort = ReturnType<typeof useDragSort>;

type TreeProps = {
  node: SketchNode;
  /** This node's own parent's name — its sibling-list identity for drag-reordering. */
  groupId: string;
  /** False for a grid's auto-generated cell slots — their position comes from the grid template, not array order, so they're not reorderable. */
  sortable: boolean;
  selected: string;
  visible: Set<string>;
  /** Names whose subtree is collapsed — already neutralized to empty while a search query is active, so callers never need to special-case that here. */
  collapsed: Set<string>;
  onToggleCollapse: (name: string) => void;
  sort: DragSort;
  onSelect: (name: string) => void;
  onHover: (name: string | undefined) => void;
  onAddChild: (name: string) => void;
  onDelete: (name: string) => void;
  onCopy: (name: string) => void;
  onConvertToGrid: (name: string) => void;
  onSetHidden: (name: string, hidden: boolean) => void;
};

function Tree({
  node,
  groupId,
  sortable,
  selected,
  visible,
  collapsed,
  onToggleCollapse,
  sort,
  onSelect,
  onHover,
  onAddChild,
  onDelete,
  onCopy,
  onConvertToGrid,
  onSetHidden,
}: TreeProps) {
  const derived = node.kind === "gridCell";
  const showHandle = sort.active && sortable;
  const hasChildren = node.children.length > 0;
  const isCollapsed = hasChildren && collapsed.has(node.name);
  return (
    <li className="pl-3">
      <div
        {...sort.dropTargetProps(node.name, groupId)}
        className={`flex items-center gap-1 ${sort.draggingName === node.name ? "opacity-40" : ""} ${sort.dropName === node.name && sort.dropBefore ? "border-t-2 border-amber-400" : ""} ${sort.dropName === node.name && !sort.dropBefore ? "border-b-2 border-amber-400" : ""}`}
      >
        {hasChildren ? (
          <button
            aria-label={isCollapsed ? `Expand ${node.name}` : `Collapse ${node.name}`}
            className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-white"
            onClick={() => onToggleCollapse(node.name)}
          >
            {isCollapsed ? (
              <ChevronRight size={15} aria-hidden />
            ) : (
              <ChevronDown size={15} aria-hidden />
            )}
          </button>
        ) : (
          <span className="w-[27px] shrink-0" aria-hidden />
        )}
        {sort.active ? (
          <span
            data-sketch-node={node.name}
            aria-label={node.name}
            className={`min-w-0 flex-1 truncate px-2 py-1 text-sm ${node.hidden ? "opacity-50" : ""}`}
          >
            {node.name}
          </span>
        ) : (
          <button
            data-sketch-node={node.name}
            className={`min-w-0 flex-1 rounded px-2 py-1 text-left text-sm hover:bg-slate-700 ${selected === node.name ? "bg-amber-400 text-slate-950 ring-1 ring-amber-200" : ""} ${node.hidden ? "opacity-50" : ""}`}
            onMouseEnter={() => onHover(node.name)}
            onMouseLeave={() => onHover(undefined)}
            onClick={() => onSelect(node.name)}
          >
            {node.name}
          </button>
        )}
        {!sort.active && (
          <>
            <button
              aria-label={node.hidden ? `Show ${node.name}` : `Hide ${node.name}`}
              className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-white"
              onClick={() => onSetHidden(node.name, !node.hidden)}
            >
              {node.hidden ? <Eye size={15} aria-hidden /> : <EyeOff size={15} aria-hidden />}
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
            {(node.kind === "element" || node.kind === "gridCell") && (
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
                      {node.kind === "element" && (
                        <Menu.Item
                          aria-label={`Copy ${node.name}`}
                          className="flex cursor-default items-center gap-2 rounded px-2 py-1 text-xs outline-none data-[highlighted]:bg-slate-700"
                          onClick={() => onCopy(node.name)}
                        >
                          <Copy size={14} aria-hidden />
                          Copy
                        </Menu.Item>
                      )}
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
          </>
        )}
        {showHandle && (
          <button
            aria-label={`Reorder ${node.name}`}
            className="cursor-grab touch-none rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-white active:cursor-grabbing"
            onPointerDown={sort.startDrag(node.name, groupId)}
            onPointerMove={sort.onDragPointerMove}
          >
            <GripVertical size={15} aria-hidden />
          </button>
        )}
      </div>
      {!isCollapsed &&
        node.children.length > 0 &&
        (node.kind === "grid" ? (
          <ul>
            <TreeGroup
              label="Grid cells"
              groupId={node.name}
              sortable={false}
              nodes={node.children.filter(
                (child) => isGridCellSlotName(node.name, child.name) && visible.has(child.name),
              )}
              selected={selected}
              visible={visible}
              collapsed={collapsed}
              onToggleCollapse={onToggleCollapse}
              sort={sort}
              onSelect={onSelect}
              onHover={onHover}
              onAddChild={onAddChild}
              onDelete={onDelete}
              onCopy={onCopy}
              onConvertToGrid={onConvertToGrid}
              onSetHidden={onSetHidden}
            />
            <TreeGroup
              label="Free children"
              groupId={node.name}
              sortable
              nodes={node.children.filter(
                (child) => !isGridCellSlotName(node.name, child.name) && visible.has(child.name),
              )}
              selected={selected}
              visible={visible}
              collapsed={collapsed}
              onToggleCollapse={onToggleCollapse}
              sort={sort}
              onSelect={onSelect}
              onHover={onHover}
              onAddChild={onAddChild}
              onDelete={onDelete}
              onCopy={onCopy}
              onConvertToGrid={onConvertToGrid}
              onSetHidden={onSetHidden}
            />
          </ul>
        ) : (
          <ul onPointerUp={() => sort.endDrag(node.children.map((child) => child.name))}>
            {node.children
              .filter((child) => visible.has(child.name))
              .map((child) => (
                <Tree
                  key={child.name}
                  node={child}
                  groupId={node.name}
                  sortable
                  selected={selected}
                  visible={visible}
                  collapsed={collapsed}
                  onToggleCollapse={onToggleCollapse}
                  sort={sort}
                  onSelect={onSelect}
                  onHover={onHover}
                  onAddChild={onAddChild}
                  onDelete={onDelete}
                  onCopy={onCopy}
                  onConvertToGrid={onConvertToGrid}
                  onSetHidden={onSetHidden}
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
  groupId,
  sortable,
  ...props
}: Omit<TreeProps, "node" | "groupId" | "sortable"> & {
  label: string;
  nodes: SketchNode[];
  groupId: string;
  sortable: boolean;
}) {
  if (nodes.length === 0) return null;
  return (
    <li className="pl-3">
      <p className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <ul onPointerUp={() => props.sort.endDrag(nodes.map((node) => node.name))}>
        {nodes.map((child) => (
          <Tree key={child.name} node={child} groupId={groupId} sortable={sortable} {...props} />
        ))}
      </ul>
    </li>
  );
}

export function SketchTreePanel({
  panelRef,
  root,
  onSetAllHidden,
  onReorder,
  ...props
}: Omit<
  TreeProps,
  "node" | "visible" | "sort" | "groupId" | "sortable" | "collapsed" | "onToggleCollapse"
> & {
  panelRef: RefObject<HTMLElement | null>;
  root: SketchNode;
  onSetAllHidden: (hidden: boolean) => void;
  onReorder: (name: string, newIndex: number) => void;
}) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => namesMatchingQuery(root, query), [root, query]);
  const [collapsedNames, setCollapsedNames] = useState<Set<string>>(new Set());
  // A collapsed ancestor would hide a search hit under it — searching
  // temporarily ignores collapse state entirely rather than trying to
  // auto-expand-and-remember what to re-collapse afterwards.
  const collapsed = query.trim() ? new Set<string>() : collapsedNames;
  const toggleCollapse = (name: string) =>
    setCollapsedNames((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  const hasMatches = root.children.some((child) => visible.has(child.name));
  const asideRef = useRef<HTMLElement>(null);
  const sort = useDragSort({ containerRef: asideRef, onReorder });
  return (
    <aside
      ref={(element) => {
        asideRef.current = element;
        panelRef.current = element;
      }}
      data-testid="layout-tree-panel"
      className="col-start-1 row-start-1 flex min-h-0 flex-col overflow-hidden border-r border-b border-slate-700 bg-slate-900"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-slate-700 px-3 py-2">
        <h2 className="text-sm font-semibold">Viewpoint</h2>
        <div className="flex gap-1">
          {root.children.length > 1 && (
            <button
              aria-label={sort.active ? "Stop sorting elements" : "Sort elements"}
              aria-pressed={sort.active}
              className={`rounded p-1 hover:bg-slate-700 hover:text-white ${sort.active ? "bg-amber-400 text-slate-950 hover:bg-amber-300 hover:text-slate-950" : "text-slate-300"}`}
              onClick={() => sort.setActive(!sort.active)}
            >
              <ArrowUpDown size={15} aria-hidden />
            </button>
          )}
          <button
            aria-label="Show all"
            className="rounded p-1 text-slate-300 hover:bg-slate-700 hover:text-white"
            onClick={() => onSetAllHidden(false)}
          >
            <Eye size={15} aria-hidden />
          </button>
          <button
            aria-label="Hide all"
            className="rounded p-1 text-slate-300 hover:bg-slate-700 hover:text-white"
            onClick={() => onSetAllHidden(true)}
          >
            <EyeOff size={15} aria-hidden />
          </button>
          {!sort.active && (
            <button
              aria-label="Add child to Viewpoint"
              className="rounded p-1 text-slate-300 hover:bg-slate-700 hover:text-white"
              onClick={() => props.onAddChild(root.name)}
            >
              <Plus size={15} aria-hidden />
            </button>
          )}
        </div>
      </div>
      {root.children.length > 0 && (
        <div className="relative shrink-0 border-b border-slate-700 px-3 py-2">
          <Search
            size={13}
            aria-hidden
            className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <input
            aria-label="Search elements"
            placeholder="Search elements"
            disabled={sort.active}
            className="w-full rounded border border-slate-600 bg-slate-800 py-1 pl-7 pr-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      )}
      <ul
        data-testid="layout-tree-list"
        className="layout-lab-scrollbar min-h-0 flex-1 overflow-x-auto overflow-y-scroll p-3 scrollbar-gutter-stable"
        onPointerUp={() => sort.endDrag(root.children.map((child) => child.name))}
      >
        {root.children
          .filter((child) => visible.has(child.name))
          .map((child) => (
            <Tree
              key={child.name}
              node={child}
              groupId={root.name}
              sortable
              visible={visible}
              collapsed={collapsed}
              onToggleCollapse={toggleCollapse}
              sort={sort}
              {...props}
            />
          ))}
      </ul>
      {query && !hasMatches && (
        <p className="px-3 py-2 text-sm text-slate-400">No elements match &ldquo;{query}&rdquo;.</p>
      )}
    </aside>
  );
}
