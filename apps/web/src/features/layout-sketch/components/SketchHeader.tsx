import { useRef, useState } from "react";
import { ClipboardCopy, Copy, HardDriveDownload, Plus, Save, Trash2, Upload } from "lucide-react";
import { type SketchDraft } from "@/features/layout-sketch/lib/layoutSketch";
import { RatioField } from "./SketchFields";
import { confirmOrCancelStringEdit } from "./editorInput";
import { VIEWPORT_PRESETS } from "./viewportPresets";

export function SketchHeader({
  drafts,
  draft,
  mode,
  showBoundaries,
  onSelectDraft,
  onRenameDraft,
  onNew,
  onCopyDraft,
  onDeleteDraft,
  canDeleteDraft,
  deleteTitle,
  onToggleBoundaries,
  onViewportMode,
  onViewportSize,
  onExport,
  onImportJson,
  onSave,
  canSaveDraft,
  saveTitle,
  needsSaveFilename,
  defaultSaveFilename,
  onLoad,
  canLoadDraft,
  loadTitle,
  loadConfirmMessage,
  coordinateView,
  onCoordinateView,
  viewInfo,
  contentView,
  onContentView,
}: {
  drafts: SketchDraft[];
  draft: SketchDraft;
  mode: string;
  showBoundaries: boolean;
  onSelectDraft: (name: string) => void;
  onRenameDraft: (name: string, input: HTMLInputElement) => void;
  onNew: () => void;
  onCopyDraft: () => void;
  onDeleteDraft: () => void;
  canDeleteDraft: boolean;
  deleteTitle: string;
  onToggleBoundaries: (value: boolean) => void;
  onViewportMode: (mode: string) => void;
  onViewportSize: (key: "w" | "h", value: number) => void;
  onExport: () => void;
  onImportJson: (source: string) => string | undefined;
  onSave: (filename?: string) => Promise<string | undefined>;
  canSaveDraft: boolean;
  saveTitle: string;
  needsSaveFilename: boolean;
  defaultSaveFilename: string;
  onLoad: () => Promise<string | undefined>;
  canLoadDraft: boolean;
  loadTitle: string;
  loadConfirmMessage: string;
  coordinateView: "world" | "parent" | "zone";
  onCoordinateView: (view: "world" | "parent" | "zone") => void;
  viewInfo?: string | undefined;
  contentView: "canvas" | "preview";
  onContentView: (view: "canvas" | "preview") => void;
}) {
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isSaveAsOpen, setIsSaveAsOpen] = useState(false);
  const [isLoadConfirmOpen, setIsLoadConfirmOpen] = useState(false);
  const [source, setSource] = useState("");
  const [importError, setImportError] = useState<string>();
  const [saveAsFilename, setSaveAsFilename] = useState(defaultSaveFilename);
  const [saveAsError, setSaveAsError] = useState<string>();
  const [loadError, setLoadError] = useState<string>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const submitImport = () => {
    const error = onImportJson(source);
    if (error) setImportError(error);
    else {
      setSource("");
      setImportError(undefined);
      setIsImportOpen(false);
    }
  };
  const clickSave = () => {
    if (needsSaveFilename) {
      setSaveAsFilename(defaultSaveFilename);
      setSaveAsError(undefined);
      setIsSaveAsOpen(true);
      return;
    }
    void onSave();
  };
  const submitSaveAs = () => {
    void onSave(saveAsFilename).then((error) => {
      if (error) setSaveAsError(error);
      else setIsSaveAsOpen(false);
    });
  };
  const confirmLoad = () => {
    void onLoad().then((error) => {
      if (error) setLoadError(error);
      else setIsLoadConfirmOpen(false);
    });
  };
  return (
    <header className="absolute inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-700 bg-slate-900 px-4">
      <select
        aria-label="Active draft"
        className="w-36 rounded border border-slate-600 bg-slate-800 p-1 text-slate-100"
        value={draft.name}
        onChange={(event) => onSelectDraft(event.target.value)}
      >
        {drafts.map((item) => (
          <option key={item.name}>{item.name}</option>
        ))}
      </select>
      <input
        key={draft.name}
        aria-label="Draft name"
        className="w-40 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-slate-100"
        defaultValue={draft.name}
        onBlur={(event) => onRenameDraft(event.currentTarget.value, event.currentTarget)}
        onKeyDown={(event) => confirmOrCancelStringEdit(event, draft.name)}
      />
      <div className="flex items-center gap-1 border-l border-slate-700 pl-3">
        <button
          aria-label="New draft"
          className="rounded border border-slate-600 bg-slate-800 p-1 text-slate-300 hover:bg-slate-700 hover:text-white"
          title="New draft"
          onClick={onNew}
        >
          <Plus size={16} aria-hidden />
        </button>
        <button
          aria-label="Copy draft"
          className="rounded border border-slate-600 bg-slate-800 p-1 text-slate-300 hover:bg-slate-700 hover:text-white"
          title="Copy draft"
          onClick={onCopyDraft}
        >
          <Copy size={16} aria-hidden />
        </button>
        <button
          aria-label="Delete draft"
          className="rounded border border-slate-600 bg-slate-800 p-1 text-slate-400 hover:bg-red-900 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-40"
          title={deleteTitle}
          disabled={!canDeleteDraft}
          onClick={() => setIsDeleteConfirmOpen(true)}
        >
          <Trash2 size={16} aria-hidden />
        </button>
      </div>
      <div className="flex items-center gap-1 border-l border-slate-700 pl-3">
        <button
          aria-label="Save"
          className="flex items-center gap-1 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-slate-300 hover:bg-slate-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          title={saveTitle}
          disabled={!canSaveDraft}
          onClick={clickSave}
        >
          <Save size={16} aria-hidden />
          Save
        </button>
        <button
          aria-label="Load"
          className="flex items-center gap-1 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-slate-300 hover:bg-slate-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          title={loadTitle}
          disabled={!canLoadDraft}
          onClick={() => {
            setLoadError(undefined);
            setIsLoadConfirmOpen(true);
          }}
        >
          <HardDriveDownload size={16} aria-hidden />
          Load
        </button>
      </div>
      <div className="flex items-center gap-1 border-l border-slate-700 pl-3">
        <button
          aria-label="Copy JSON"
          className="flex items-center gap-1 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-slate-300 hover:bg-slate-700 hover:text-white"
          title="Copy the current draft's LayoutPreset JSON to the clipboard"
          onClick={onExport}
        >
          <ClipboardCopy size={16} aria-hidden />
          Copy JSON
        </button>
        <button
          aria-label="Import JSON"
          className="flex items-center gap-1 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-slate-300 hover:bg-slate-700 hover:text-white"
          title="Paste LayoutPreset JSON to create a new local draft"
          onClick={() => setIsImportOpen(true)}
        >
          <Upload size={16} aria-hidden />
          Import JSON
        </button>
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-300">
        <input
          aria-label="Show boundaries"
          type="checkbox"
          checked={showBoundaries}
          onChange={(event) => onToggleBoundaries(event.target.checked)}
        />
        Show boundaries
      </label>
      <select
        aria-label="Coordinate view"
        className="rounded border border-slate-600 bg-slate-800 p-1 text-xs text-slate-100"
        value={coordinateView}
        onChange={(event) => onCoordinateView(event.target.value as "world" | "parent" | "zone")}
      >
        <option value="world">World View</option>
        <option value="parent">Parent View</option>
        <option value="zone">Zone View</option>
      </select>
      {viewInfo && <span className="text-xs text-amber-300">{viewInfo}</span>}
      <div className="ml-auto flex rounded border border-slate-600 text-sm">
        <button
          aria-pressed={contentView === "canvas"}
          className={`px-2 py-1 ${contentView === "canvas" ? "bg-amber-400 text-slate-950" : "text-slate-200"}`}
          onClick={() => onContentView("canvas")}
        >
          Canvas
        </button>
        <button
          aria-pressed={contentView === "preview"}
          className={`border-l border-slate-600 px-2 py-1 ${contentView === "preview" ? "bg-amber-400 text-slate-950" : "text-slate-200"}`}
          onClick={() => onContentView("preview")}
        >
          Real preview
        </button>
      </div>
      <span className="text-xs text-slate-400">Viewport</span>
      <select
        aria-label="Viewport preset"
        className="rounded border border-slate-600 bg-slate-800 p-1 text-slate-100"
        value={mode}
        onChange={(event) => onViewportMode(event.target.value)}
      >
        {VIEWPORT_PRESETS.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.label}
          </option>
        ))}
        <option value="custom">Custom</option>
      </select>
      {mode === "custom" && (
        <>
          <RatioField
            label="Viewport width"
            value={draft.viewport.w}
            onChange={(value) => onViewportSize("w", value)}
          />
          <RatioField
            label="Viewport height"
            value={draft.viewport.h}
            onChange={(value) => onViewportSize("h", value)}
          />
        </>
      )}
      {isImportOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/75 p-6">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Import LayoutPreset JSON"
            className="w-full max-w-2xl rounded border border-slate-600 bg-slate-900 p-4 shadow-xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-slate-100">Import LayoutPreset JSON</h2>
              <button
                className="text-sm text-slate-400 hover:text-slate-100"
                onClick={() => setIsImportOpen(false)}
              >
                Cancel
              </button>
            </div>
            <textarea
              aria-label="LayoutPreset JSON"
              className="h-64 w-full rounded border border-slate-600 bg-slate-950 p-3 font-mono text-xs text-slate-100"
              value={source}
              onChange={(event) => {
                setSource(event.target.value);
                setImportError(undefined);
              }}
            />
            {importError && (
              <p role="alert" className="mt-2 text-sm text-red-300">
                {importError}
              </p>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <input
                ref={fileInputRef}
                aria-label="LayoutPreset JSON file"
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) void file.text().then(setSource);
                  event.currentTarget.value = "";
                }}
              />
              <button
                className="rounded border border-slate-600 px-3 py-1 text-sm hover:bg-slate-800"
                onClick={() => fileInputRef.current?.click()}
              >
                Choose file
              </button>
              <button
                className="rounded bg-amber-500 px-3 py-1 text-sm font-medium text-slate-950 hover:bg-amber-400"
                onClick={submitImport}
              >
                Import
              </button>
            </div>
          </section>
        </div>
      )}
      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/75 p-6">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Delete draft confirmation"
            className="w-full max-w-sm rounded border border-slate-600 bg-slate-900 p-4 shadow-xl"
          >
            <h2 className="font-semibold text-slate-100">Delete draft?</h2>
            <p className="mt-2 text-sm text-slate-300">
              Delete <span className="font-medium text-slate-100">{draft.name}</span>? This cannot
              be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded border border-slate-600 px-3 py-1 text-sm hover:bg-slate-800"
                onClick={() => setIsDeleteConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                className="rounded bg-red-700 px-3 py-1 text-sm font-medium text-white hover:bg-red-600"
                onClick={() => {
                  onDeleteDraft();
                  setIsDeleteConfirmOpen(false);
                }}
              >
                Delete
              </button>
            </div>
          </section>
        </div>
      )}
      {isSaveAsOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/75 p-6">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Save as"
            className="w-full max-w-sm rounded border border-slate-600 bg-slate-900 p-4 shadow-xl"
          >
            <h2 className="font-semibold text-slate-100">Save as</h2>
            <input
              aria-label="Filename"
              className="mt-3 w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-slate-100"
              value={saveAsFilename}
              onChange={(event) => {
                setSaveAsFilename(event.target.value);
                setSaveAsError(undefined);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitSaveAs();
                if (event.key === "Escape") setIsSaveAsOpen(false);
              }}
            />
            {saveAsError && (
              <p role="alert" className="mt-2 text-sm text-red-300">
                {saveAsError}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded border border-slate-600 px-3 py-1 text-sm hover:bg-slate-800"
                onClick={() => setIsSaveAsOpen(false)}
              >
                Cancel
              </button>
              <button
                className="rounded bg-amber-500 px-3 py-1 text-sm font-medium text-slate-950 hover:bg-amber-400"
                onClick={submitSaveAs}
              >
                Save
              </button>
            </div>
          </section>
        </div>
      )}
      {isLoadConfirmOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/75 p-6">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Load confirmation"
            className="w-full max-w-sm rounded border border-slate-600 bg-slate-900 p-4 shadow-xl"
          >
            <h2 className="font-semibold text-slate-100">Reload from disk?</h2>
            <p className="mt-2 text-sm text-slate-300">{loadConfirmMessage}</p>
            {loadError && (
              <p role="alert" className="mt-2 text-sm text-red-300">
                {loadError}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded border border-slate-600 px-3 py-1 text-sm hover:bg-slate-800"
                onClick={() => setIsLoadConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                className="rounded bg-amber-500 px-3 py-1 text-sm font-medium text-slate-950 hover:bg-amber-400"
                onClick={confirmLoad}
              >
                Load
              </button>
            </div>
          </section>
        </div>
      )}
    </header>
  );
}
