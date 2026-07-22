import { useEffect, useMemo, useRef, useState } from "react";
import { findNode, findParentNode, exportSketchDraft, type SketchNode } from "@/lib/layoutSketch";
import { SketchCanvas } from "@/components/layout-sketch/SketchCanvas";
import { SketchHeader } from "@/components/layout-sketch/SketchHeader";
import { VIEWPORT_PRESETS } from "@/components/layout-sketch/viewportPresets";
import { SketchProperties } from "@/components/layout-sketch/SketchProperties";
import { SketchTreePanel } from "@/components/layout-sketch/SketchTree";
import { SketchVariables } from "@/components/layout-sketch/SketchVariables";
import { useSketchEditor } from "@/hooks/useSketchEditor";

const findSketchPath = (root: SketchNode, name: string): SketchNode[] | undefined => {
  if (root.name === name) return [root];
  for (const child of root.children) {
    const path = findSketchPath(child, name);
    if (path) return [root, ...path];
  }
  return undefined;
};

export function TableLayoutLabView() {
  const editor = useSketchEditor();
  const [hoveredName, setHoveredName] = useState<string>();
  const [exportStatus, setExportStatus] = useState<"success" | "error">();
  const [coordinateView, setCoordinateView] = useState<"world" | "parent" | "zone">("world");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const pageRef = useRef<HTMLElement>(null);
  const treePanelRef = useRef<HTMLElement>(null);
  const detectedMode =
    VIEWPORT_PRESETS.find(
      (preset) => preset.w === editor.draft.viewport.w && preset.h === editor.draft.viewport.h,
    )?.id ?? "custom";
  const activeMode =
    editor.viewportMode?.draft === editor.draft.name ? editor.viewportMode.mode : detectedMode;
  useEffect(() => {
    treePanelRef.current
      ?.querySelector<HTMLButtonElement>(`button[data-sketch-node="${editor.selected.name}"]`)
      ?.scrollIntoView({ block: "nearest" });
    if (editor.selected.name !== "viewport") {
      nameInputRef.current?.focus({ preventScroll: true });
      nameInputRef.current?.select();
    }
  }, [editor.selected.name]);
  useEffect(() => {
    if (!exportStatus) return;
    const timer = window.setTimeout(() => setExportStatus(undefined), 2400);
    return () => window.clearTimeout(timer);
  }, [exportStatus]);
  const selectedParentName = useMemo(
    () => findParentNode(editor.draft.root, editor.selected.name)?.name,
    [editor.draft.root, editor.selected.name],
  );
  const parentLocalUnrotatedNames = useMemo(
    () =>
      selectedParentName
        ? (findSketchPath(editor.draft.root, selectedParentName)?.map((node) => node.name) ?? [])
        : [],
    [editor.draft.root, selectedParentName],
  );
  const focusNode =
    coordinateView === "parent"
      ? (findNode(editor.draft.root, selectedParentName ?? "") ?? editor.draft.root)
      : coordinateView === "zone"
        ? editor.selected
        : undefined;
  const focusAspectRatio = useMemo(() => {
    if (!focusNode) return undefined;
    const path = findSketchPath(editor.draft.root, focusNode.name) ?? [];
    return (
      (editor.draft.viewport.w / editor.draft.viewport.h) *
      path.slice(1).reduce((ratio, node) => ratio * (node.w.resolved / node.h.resolved), 1)
    );
  }, [editor.draft.root, editor.draft.viewport, focusNode]);
  const canvasStyle =
    focusAspectRatio === undefined
      ? editor.canvasStyle
      : {
          aspectRatio: String(focusAspectRatio),
          width: `min(90cqw, ${90 * focusAspectRatio}cqh)`,
        };
  const viewInfo =
    coordinateView === "parent"
      ? `Parent: ${selectedParentName ?? "viewport"} · unrotated local axes`
      : coordinateView === "zone"
        ? `Zone: ${editor.selected.name} · local axes`
        : undefined;
  const resizeTree = (clientY: number) => {
    const page = pageRef.current;
    if (!page) return;
    const bounds = page.getBoundingClientRect();
    const next = Math.min(
      Math.max(clientY - bounds.top - 56, 120),
      Math.max(120, bounds.height - 56 - 160),
    );
    editor.patchDocument({ leftTreeHeight: Math.round(next) });
  };
  const resizeSidebar = (side: "left" | "right", clientX: number) => {
    const page = pageRef.current;
    if (!page) return;
    const bounds = page.getBoundingClientRect();
    const max =
      side === "left"
        ? Math.max(160, Math.min(480, bounds.width - editor.document.rightWidth - 360))
        : Math.max(180, Math.min(520, bounds.width - editor.document.leftWidth - 360));
    const proposed = side === "left" ? clientX - bounds.left : bounds.right - clientX;
    editor.patchDocument({
      [side === "left" ? "leftWidth" : "rightWidth"]: Math.round(
        Math.min(Math.max(proposed, side === "left" ? 160 : 180), max),
      ),
    });
  };
  const modeChange = (mode: string) => {
    editor.setViewportMode({ draft: editor.draft.name, mode });
    const preset = VIEWPORT_PRESETS.find((item) => item.id === mode);
    if (preset) {
      editor.setViewportSize("w", preset.w);
      editor.setViewportSize("h", preset.h);
    }
  };
  const exportPreset = () => {
    void navigator.clipboard
      .writeText(
        JSON.stringify(exportSketchDraft(editor.draft, editor.document.variables), null, 2),
      )
      .then(() => setExportStatus("success"))
      .catch(() => setExportStatus("error"));
  };
  return (
    <main
      ref={pageRef}
      data-testid="layout-lab-page"
      className="relative grid h-dvh overflow-hidden bg-slate-950 pt-14 text-slate-100"
      style={{
        gridTemplateColumns: `${editor.document.leftWidth}px minmax(0,1fr) ${editor.document.rightWidth}px`,
        gridTemplateRows: `${editor.document.leftTreeHeight}px minmax(160px,1fr)`,
      }}
    >
      <SketchHeader
        drafts={editor.document.drafts}
        draft={editor.draft}
        mode={activeMode}
        showBoundaries={editor.showBoundaries}
        onSelectDraft={editor.selectDraft}
        onRenameDraft={editor.renameDraft}
        onNew={editor.newDraft}
        onCopyDraft={editor.copyDraft}
        onDeleteDraft={editor.deleteDraft}
        onToggleBoundaries={editor.setShowBoundaries}
        onViewportMode={modeChange}
        onViewportSize={editor.setViewportSize}
        onExport={exportPreset}
        onImportDesktop={editor.importDesktop}
        onImportJson={editor.importPresetJson}
        coordinateView={coordinateView}
        onCoordinateView={setCoordinateView}
        viewInfo={viewInfo}
      />
      {exportStatus && (
        <div
          role="status"
          className={`absolute left-1/2 top-16 z-40 -translate-x-1/2 rounded px-3 py-2 text-sm shadow-lg ${exportStatus === "success" ? "bg-emerald-700 text-white" : "bg-red-700 text-white"}`}
        >
          {exportStatus === "success" ? "LayoutPreset copied" : "Could not copy LayoutPreset"}
        </div>
      )}
      <SketchTreePanel
        panelRef={treePanelRef}
        root={editor.draft.root}
        selected={editor.selected.name}
        onSelect={editor.select}
        onHover={setHoveredName}
        onAddChild={editor.add}
        onDelete={editor.remove}
        onCopy={editor.copy}
        onConvertToGrid={editor.convertToGrid}
      />
      <div
        role="separator"
        aria-label="Resize Tree and Properties"
        aria-orientation="horizontal"
        data-testid="tree-properties-resizer"
        className="col-start-1 row-start-1 z-20 -mb-1 h-2 w-full self-end cursor-row-resize touch-none bg-transparent hover:bg-amber-400/40"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          resizeTree(event.clientY);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) resizeTree(event.clientY);
        }}
      />
      <div
        role="separator"
        aria-label="Resize left sidebar"
        aria-orientation="vertical"
        data-testid="left-sidebar-resizer"
        className="col-start-1 row-start-1 row-span-2 z-20 -mr-1 h-full w-2 justify-self-end cursor-col-resize touch-none bg-transparent hover:bg-amber-400/40"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          resizeSidebar("left", event.clientX);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            resizeSidebar("left", event.clientX);
        }}
      />
      <SketchCanvas
        root={coordinateView === "world" ? editor.draft.root : (focusNode ?? editor.draft.root)}
        style={canvasStyle}
        selected={editor.selected.name}
        hovered={hoveredName}
        showBoundaries={editor.showBoundaries}
        onSelect={editor.select}
        onHover={setHoveredName}
        coordinateView={coordinateView}
        referenceName={
          coordinateView === "parent"
            ? selectedParentName
            : coordinateView === "zone"
              ? editor.selected.name
              : undefined
        }
        unrotatedNames={coordinateView === "parent" ? parentLocalUnrotatedNames : undefined}
      />
      <SketchProperties
        selected={editor.selected}
        nameInputRef={nameInputRef}
        onRename={editor.rename}
        onGeometryChange={editor.updateGeometry}
        onCenterChange={editor.updateCenter}
        onGridChange={editor.updateGrid}
        pendingGridUpdate={editor.pendingGridUpdate}
        onConfirmGridUpdate={editor.confirmGridUpdate}
        onCancelGridUpdate={editor.cancelGridUpdate}
        onRotationChange={editor.updateRotation}
        onShadowChange={editor.setCellShadow}
        resolveExpression={editor.resolveExpression}
      />
      <SketchVariables
        variables={editor.document.variables}
        onAdd={editor.addVariable}
        onUpdate={editor.updateVariable}
        onRemove={editor.removeVariable}
        isUsed={editor.isVariableUsed}
      />
      <div
        role="separator"
        aria-label="Resize right sidebar"
        aria-orientation="vertical"
        data-testid="right-sidebar-resizer"
        className="col-start-3 row-start-1 row-span-2 z-20 -ml-1 h-full w-2 justify-self-start cursor-col-resize touch-none bg-transparent hover:bg-amber-400/40"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          resizeSidebar("right", event.clientX);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            resizeSidebar("right", event.clientX);
        }}
      />
    </main>
  );
}
