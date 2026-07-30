import { useEffect, useMemo, useRef, useState } from "react";
import {
  findNode,
  findParentNode,
  exportSketchDraft,
  type SketchNode,
} from "@/features/layout-sketch/lib/layoutSketch";
import { SketchCanvas } from "@/features/layout-sketch/components/SketchCanvas";
import { SketchHeader } from "@/features/layout-sketch/components/SketchHeader";
import { VIEWPORT_PRESETS } from "@/features/layout-sketch/components/viewportPresets";
import { SketchProperties } from "@/features/layout-sketch/components/SketchProperties";
import { SketchTreePanel } from "@/features/layout-sketch/components/SketchTree";
import { SketchVariables } from "@/features/layout-sketch/components/SketchVariables";
import { SketchConfig } from "@/features/layout-sketch/components/SketchConfig";
import { LayoutPreview } from "@/features/layout-sketch/components/LayoutPreview";
import { HorizontalPanelResizer } from "@/features/layout-sketch/components/PanelResizer";
import {
  useSketchEditor,
  defaultLayoutFilename,
} from "@/features/layout-sketch/hooks/useSketchEditor";

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
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string }>();
  const [coordinateView, setCoordinateView] = useState<"world" | "parent" | "zone">("world");
  const [contentView, setContentView] = useState<"canvas" | "preview">("canvas");
  const [previewCase, setPreviewCase] = useState<"baseline" | "dense" | "claims">("baseline");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const pageRef = useRef<HTMLElement>(null);
  const treePanelRef = useRef<HTMLElement>(null);
  const rightPanelRef = useRef<HTMLElement>(null);
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
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(undefined), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);
  const variableNames = useMemo(
    () => editor.draft.variables.map((variable) => variable.name),
    [editor.draft.variables],
  );
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
  const resizeConfigPanel = (clientY: number) => {
    const panel = rightPanelRef.current;
    if (!panel) return;
    const bounds = panel.getBoundingClientRect();
    const next = Math.min(
      Math.max(bounds.bottom - clientY, 180),
      Math.max(180, bounds.height - 120),
    );
    editor.patchDocument({ rightConfigHeight: Math.round(next) });
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
      .writeText(JSON.stringify(exportSketchDraft(editor.draft), null, 2))
      .then(() => setToast({ type: "success", message: "LayoutPreset JSON copied" }))
      .catch(() => setToast({ type: "error", message: "Could not copy LayoutPreset JSON" }));
  };
  const saveDraft = async (filename?: string) => {
    const target = filename ?? editor.draft.sourceFile;
    const error = await editor.saveDraft(filename);
    setToast(
      error ? { type: "error", message: error } : { type: "success", message: `Saved ${target}` },
    );
    return error;
  };
  const loadDraft = async () => {
    const target = editor.draft.sourceFile;
    const error = await editor.loadDraft();
    setToast(
      error
        ? { type: "error", message: error }
        : { type: "success", message: `Reloaded ${target}` },
    );
    return error;
  };
  const fileMissing = editor.isFileMissing(editor.draft);
  const draftDirty = editor.isDraftDirty(editor.draft);
  const diskNewer = editor.isDiskNewer(editor.draft);
  const needsSaveFilename = editor.draft.sourceFile === undefined || fileMissing;
  const canSaveDraft = needsSaveFilename || draftDirty;
  const canLoadDraft =
    editor.draft.sourceFile !== undefined && !fileMissing && (draftDirty || diskNewer);
  const canDeleteDraft =
    editor.document.drafts.length > 1 && (editor.draft.sourceFile === undefined || fileMissing);
  const deleteTitle =
    editor.document.drafts.length === 1
      ? "At least one draft is required"
      : canDeleteDraft
        ? "Delete draft"
        : "Saved files can't be deleted here — delete the file on disk if you need to";
  const saveTitle = !canSaveDraft
    ? "No unsaved changes"
    : needsSaveFilename
      ? "Save as a new file"
      : "Save";
  const loadTitle =
    editor.draft.sourceFile === undefined
      ? "This draft has no file yet"
      : fileMissing
        ? "The bound file is missing — use Save to save it as a new file"
        : canLoadDraft
          ? "Reload from disk, discarding local changes"
          : "Local content matches disk — nothing to load";
  const loadConfirmMessage =
    diskNewer && !draftDirty
      ? `The file on disk has changed since you last saved or loaded ${editor.draft.sourceFile}. Reload it and discard local state?`
      : `Discard unsaved local changes and reload ${editor.draft.sourceFile} from disk?`;
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
        canDeleteDraft={canDeleteDraft}
        deleteTitle={deleteTitle}
        onToggleBoundaries={editor.setShowBoundaries}
        onViewportMode={modeChange}
        onViewportSize={editor.setViewportSize}
        onExport={exportPreset}
        onImportJson={editor.importPresetJson}
        onSave={saveDraft}
        canSaveDraft={canSaveDraft}
        saveTitle={saveTitle}
        needsSaveFilename={needsSaveFilename}
        defaultSaveFilename={defaultLayoutFilename(editor.draft.name)}
        onLoad={loadDraft}
        canLoadDraft={canLoadDraft}
        loadTitle={loadTitle}
        loadConfirmMessage={loadConfirmMessage}
        coordinateView={coordinateView}
        onCoordinateView={setCoordinateView}
        viewInfo={viewInfo}
        contentView={contentView}
        onContentView={setContentView}
      />
      {toast && (
        <div
          role="status"
          className={`absolute left-1/2 top-16 z-40 -translate-x-1/2 rounded px-3 py-2 text-sm shadow-lg ${toast.type === "success" ? "bg-emerald-700 text-white" : "bg-red-700 text-white"}`}
        >
          {toast.message}
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
        onSetHidden={editor.setHidden}
        onSetAllHidden={editor.setAllItemsHidden}
        onReorder={editor.reorder}
      />
      <HorizontalPanelResizer
        label="Resize Tree and Properties"
        testId="tree-properties-resizer"
        onResize={resizeTree}
        className="col-start-1 row-start-1 z-20 -mb-1 w-full self-end"
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
      {contentView === "canvas" ? (
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
      ) : (
        <LayoutPreview
          draft={editor.draft}
          previewCase={previewCase}
          onPreviewCase={setPreviewCase}
        />
      )}
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
        variableNames={variableNames}
      />
      <aside
        ref={rightPanelRef}
        className="col-start-3 row-start-1 row-span-2 flex min-h-0 flex-col overflow-hidden border-l border-slate-700 bg-slate-900"
      >
        <SketchVariables
          variables={editor.draft.variables}
          onAdd={editor.addVariable}
          onUpdate={editor.updateVariable}
          onRemove={editor.removeVariable}
          onReorder={editor.reorderVariable}
          isUsed={editor.isVariableUsed}
          variableNames={variableNames}
        />
        <HorizontalPanelResizer
          label="Resize Config panel"
          testId="config-panel-resizer"
          onResize={resizeConfigPanel}
          className="z-20 -my-1 w-full shrink-0 bg-slate-700/70 hover:bg-amber-400/60"
        />
        <SketchConfig
          config={editor.draft.tableConfig}
          onUpdate={editor.updateTableConfig}
          style={{ height: editor.document.rightConfigHeight }}
        />
      </aside>
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
