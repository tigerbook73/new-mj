import { useRef, useState } from "react";
import { ClipboardCopy, Copy, FileInput, Plus, Trash2, Upload } from "lucide-react";
import { type SketchDraft } from "@/lib/layoutSketch";
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
  onToggleBoundaries,
  onViewportMode,
  onViewportSize,
  onExport,
  onImportDesktop,
  onImportJson,
  coordinateView,
  onCoordinateView,
  viewInfo,
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
  onToggleBoundaries: (value: boolean) => void;
  onViewportMode: (mode: string) => void;
  onViewportSize: (key: "w" | "h", value: number) => void;
  onExport: () => void;
  onImportDesktop: () => void;
  onImportJson: (source: string) => string | undefined;
  coordinateView: "world" | "parent" | "zone";
  onCoordinateView: (view: "world" | "parent" | "zone") => void;
  viewInfo?: string | undefined;
}) {
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [source, setSource] = useState("");
  const [importError, setImportError] = useState<string>();
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
        title={drafts.length === 1 ? "At least one draft is required" : "Delete draft"}
        disabled={drafts.length === 1}
        onClick={() => setIsDeleteConfirmOpen(true)}
      >
        <Trash2 size={16} aria-hidden />
      </button>
      <button
        aria-label="Copy LayoutPreset JSON"
        className="rounded border border-slate-600 bg-slate-800 p-1 text-slate-300 hover:bg-slate-700 hover:text-white"
        title="Copy LayoutPreset JSON"
        onClick={onExport}
      >
        <ClipboardCopy size={16} aria-hidden />
      </button>
      <button
        aria-label="Import desktop preset"
        className="rounded border border-slate-600 bg-slate-800 p-1 text-slate-300 hover:bg-slate-700 hover:text-white"
        title="Import desktop preset (rotation/layout approximation)"
        onClick={onImportDesktop}
      >
        <FileInput size={16} aria-hidden />
      </button>
      <button
        aria-label="Import LayoutPreset JSON"
        className="rounded border border-slate-600 bg-slate-800 p-1 text-slate-300 hover:bg-slate-700 hover:text-white"
        title="Import LayoutPreset JSON"
        onClick={() => setIsImportOpen(true)}
      >
        <Upload size={16} aria-hidden />
      </button>
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
      <span className="ml-auto text-xs text-slate-400">Viewport</span>
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
    </header>
  );
}
