import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addChild,
  applyGridTemplate,
  childName,
  copyNodeWithUniqueNames,
  defaultSketchDocument,
  exportSketchDraft,
  findNode,
  flatten,
  gridTemplatesEqual,
  importLayoutPreset,
  parseLayoutPresetJson,
  insertSiblingAfter,
  moveSibling,
  reorderSibling,
  randomSketchBackgroundColor,
  readSketchDocument,
  removeNode,
  resolveVariablePercentage,
  setAllHidden,
  updateNode,
  writeSketchDocument,
  type SketchDocument,
  type SketchDraft,
  type SketchGeometryKey,
  type SketchPercentage,
  type SketchNode,
} from "@/features/layout-sketch/lib/layoutSketch";
import { type RotationDeg } from "@/shared/lib/layoutPreset";
import {
  listLayoutFiles,
  readLayoutFile,
  writeLayoutFile,
  type LayoutFileEntry,
} from "@/features/layout-sketch/lib/layoutFilesApi";

// Matches the dev-server plugin's own filename validation
// (apps/web/dev/layoutFilesPlugin.ts) — kept in sync manually, both are
// small and unlikely to drift.
const LAYOUT_FILENAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*\.table-layout\.json$/;
// Draft names are already constrained to /^[A-Za-z][A-Za-z0-9_-]*$/ (see
// rename/renameDraft below), so appending the fixed suffix always produces
// a name the pattern above accepts — this is only the *default* the
// save-as dialog prefills, the user can still edit it before confirming.
export const defaultLayoutFilename = (draftName: string) => `${draftName}.table-layout.json`;

const referencesVariable = (raw: string, name: string) =>
  new RegExp(`\\$${name}(?![A-Za-z0-9_])`).test(raw);
const renameVariableReference = (raw: string, from: string, to: string) =>
  raw.replace(new RegExp(`\\$${from}(?![A-Za-z0-9_])`, "g"), `$${to}`);
const rewriteNodeReferences = (node: SketchNode, from: string, to: string): SketchNode => ({
  ...node,
  x: { ...node.x, raw: renameVariableReference(node.x.raw, from, to) },
  y: { ...node.y, raw: renameVariableReference(node.y.raw, from, to) },
  ...(node.centerX
    ? { centerX: { ...node.centerX, raw: renameVariableReference(node.centerX.raw, from, to) } }
    : {}),
  ...(node.centerY
    ? { centerY: { ...node.centerY, raw: renameVariableReference(node.centerY.raw, from, to) } }
    : {}),
  w: { ...node.w, raw: renameVariableReference(node.w.raw, from, to) },
  h: { ...node.h, raw: renameVariableReference(node.h.raw, from, to) },
  ...(node.grid ? { grid: { raw: renameVariableReference(node.grid.raw, from, to) } } : {}),
  children: node.children.map((child) => rewriteNodeReferences(child, from, to)),
});
const cloneNode = (node: SketchNode): SketchNode => ({
  ...node,
  x: { ...node.x },
  y: { ...node.y },
  w: { ...node.w },
  h: { ...node.h },
  ...(node.grid ? { grid: { ...node.grid } } : {}),
  children: node.children.map(cloneNode),
});
const refreshDraft = (draft: SketchDraft): SketchDraft => {
  const resolve = (raw: string, minimum: number) =>
    resolveVariablePercentage(raw, draft.variables, minimum);
  const refresh = (node: SketchNode): SketchNode => {
    const refreshed = {
      ...node,
      x: resolve(node.x.raw, 0) ?? node.x,
      y: resolve(node.y.raw, 0) ?? node.y,
      ...(node.centerX ? { centerX: resolve(node.centerX.raw, 0) ?? node.centerX } : {}),
      ...(node.centerY ? { centerY: resolve(node.centerY.raw, 0) ?? node.centerY } : {}),
      w: resolve(node.w.raw, 0.001) ?? node.w,
      h: resolve(node.h.raw, 0.001) ?? node.h,
      children: node.children.map(refresh),
    };
    return refreshed.kind === "grid"
      ? (applyGridTemplate(refreshed, refreshed.grid!.raw, resolve) ?? refreshed)
      : refreshed;
  };
  return { ...draft, root: refresh(draft.root) };
};

export function useSketchEditor() {
  const [document, setDocument] = useState(readSketchDocument);
  const [showBoundaries, setShowBoundaries] = useState(true);
  const [viewportMode, setViewportMode] = useState<{ draft: string; mode: string }>();
  const [pendingGridUpdate, setPendingGridUpdate] = useState<
    | {
        target: string;
        next: SketchNode;
        previousRaw: string;
        previousCellCount: number;
        nextCellCount: number;
        input: HTMLInputElement;
      }
    | undefined
  >();
  const [diskFiles, setDiskFiles] = useState<LayoutFileEntry[]>([]);
  const draft =
    document.drafts.find((item) => item.name === document.activeDraft) ?? document.drafts[0]!;
  const selected = findNode(draft.root, document.selectedName) ?? draft.root;
  useEffect(() => {
    const timer = window.setTimeout(() => writeSketchDocument(document), 150);
    return () => window.clearTimeout(timer);
  }, [document]);
  // Kept current every render so refreshDiskFiles (a stable useCallback,
  // registered once for the mount + window-focus discovery effect below)
  // can tell which files are already open without re-subscribing on every
  // draft change.
  const draftsRef = useRef(document.drafts);
  draftsRef.current = document.drafts;
  // Auto-"opens" any apps/web/src/features/mahjong/layouts/*.table-layout.json file that
  // isn't already bound to a local draft, on mount and whenever the tab
  // regains focus (catches files created/edited outside the Lab). Files
  // already bound to a draft are left alone — this only discovers new
  // ones, it never overwrites local edits (see scenario 1 in the Save/Load
  // plan).
  const refreshDiskFiles = useCallback(async () => {
    let entries: LayoutFileEntry[];
    try {
      entries = await listLayoutFiles();
    } catch {
      return;
    }
    setDiskFiles(entries);
    for (const entry of entries) {
      if (draftsRef.current.some((item) => item.sourceFile === entry.name)) continue;
      let content: string;
      try {
        content = await readLayoutFile(entry.name);
      } catch {
        continue;
      }
      let preset;
      try {
        preset = parseLayoutPresetJson(content);
      } catch {
        continue;
      }
      const imported = importLayoutPreset(preset, entry.name);
      setDocument((current) => {
        // Re-checked atomically against the true latest state, in case two
        // discovery passes overlap (e.g. mount + an immediate refocus).
        if (current.drafts.some((item) => item.sourceFile === entry.name)) return current;
        let index = 1;
        let name = imported.name;
        while (current.drafts.some((item) => item.name === name))
          name = `${imported.name}${index++}`;
        const withMeta: SketchDraft = { ...imported, name, sourceMtimeMs: entry.mtimeMs };
        return {
          ...current,
          drafts: [
            ...current.drafts,
            { ...withMeta, savedSnapshot: JSON.stringify(exportSketchDraft(withMeta)) },
          ],
        };
      });
    }
  }, []);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    void refreshDiskFiles();
    const onFocus = () => void refreshDiskFiles();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshDiskFiles]);
  const isFileMissing = (target: SketchDraft) =>
    target.sourceFile !== undefined && !diskFiles.some((entry) => entry.name === target.sourceFile);
  const isDraftDirty = (target: SketchDraft) =>
    target.savedSnapshot === undefined ||
    JSON.stringify(exportSketchDraft(target)) !== target.savedSnapshot;
  const isDiskNewer = (target: SketchDraft) => {
    if (!target.sourceFile || target.sourceMtimeMs === undefined || isFileMissing(target))
      return false;
    const entry = diskFiles.find((item) => item.name === target.sourceFile);
    return entry !== undefined && entry.mtimeMs > target.sourceMtimeMs;
  };
  const patchDocument = (next: Partial<SketchDocument>) =>
    setDocument((current) => ({ ...current, ...next }));
  const patchDraft = (patch: Partial<Omit<SketchDraft, "name">>) =>
    setDocument((current) => ({
      ...current,
      drafts: current.drafts.map((item) =>
        item.name === draft.name ? { ...item, ...patch } : item,
      ),
    }));
  const patchRoot = (root: typeof draft.root, selectedName = document.selectedName) =>
    setDocument((current) => ({
      ...current,
      selectedName,
      drafts: current.drafts.map((item) => (item.name === draft.name ? { ...item, root } : item)),
    }));
  const select = (selectedName: string) => patchDocument({ selectedName });
  const resolveExpression = (raw: string, minimum: number) =>
    resolveVariablePercentage(raw, draft.variables, minimum);
  const addVariable = () => {
    let index = draft.variables.length + 1;
    while (draft.variables.some((variable) => variable.name === `var${index}`)) index += 1;
    const name = `var${index}`;
    patchDraft({ variables: [...draft.variables, { name, value: "0" }] });
  };
  const reorderVariable = (name: string, newIndex: number) => {
    const fromIndex = draft.variables.findIndex((variable) => variable.name === name);
    if (fromIndex < 0) return;
    const variables = [...draft.variables];
    const [moved] = variables.splice(fromIndex, 1);
    if (!moved) return;
    variables.splice(Math.max(0, Math.min(newIndex, variables.length)), 0, moved);
    patchDraft({ variables });
  };
  const updateVariable = (name: string, key: "name" | "value", value: string) => {
    const candidate = value.trim();
    const next = draft.variables.map((item) =>
      item.name === name ? { ...item, [key]: candidate } : item,
    );
    const renamed = key === "name" && candidate !== name;
    const rewritten = renamed
      ? next.map((item) => ({
          ...item,
          value:
            item.name === candidate
              ? item.value
              : renameVariableReference(item.value, name, candidate),
        }))
      : next;
    const valid =
      rewritten.every((item) => /^[A-Za-z0-9_]+$/.test(item.name)) &&
      new Set(rewritten.map((item) => item.name)).size === rewritten.length;
    if (!valid || rewritten.some((item) => !resolveVariablePercentage(item.value, rewritten)))
      return false;
    setDocument((current) => ({
      ...current,
      drafts: current.drafts.map((item) =>
        item.name === draft.name
          ? refreshDraft({
              ...item,
              variables: rewritten,
              root: renamed ? rewriteNodeReferences(item.root, name, candidate) : item.root,
            })
          : item,
      ),
    }));
    return true;
  };
  const isVariableUsed = (name: string) =>
    draft.variables.some(
      (variable) => variable.name !== name && referencesVariable(variable.value, name),
    ) ||
    flatten(draft.root).some((node) =>
      [node.x.raw, node.y.raw, node.w.raw, node.h.raw, node.grid?.raw ?? ""].some((raw) =>
        referencesVariable(raw, name),
      ),
    );
  const removeVariable = (name: string) => {
    if (isVariableUsed(name)) return false;
    patchDraft({ variables: draft.variables.filter((variable) => variable.name !== name) });
    return true;
  };
  const add = (parent = selected.name) => {
    const parentNode = findNode(draft.root, parent);
    if (
      parentNode?.kind !== "element" &&
      parentNode?.kind !== "grid" &&
      parentNode?.kind !== "gridCell"
    )
      return;
    const name = childName(draft.root, parent);
    patchRoot(
      addChild(draft.root, parent, {
        name,
        x: { raw: "0.1", resolved: 0.1 },
        y: { raw: "0.1", resolved: 0.1 },
        w: { raw: "0.3", resolved: 0.3 },
        h: { raw: "0.2", resolved: 0.2 },
        kind: "element",
        shadow: false,
        backgroundColor: randomSketchBackgroundColor(),
        children: [],
      }),
      name,
    );
  };
  const remove = (target = selected.name) => {
    if (target !== "viewport") {
      const root = removeNode(draft.root, target);
      patchRoot(root, root.children[0]?.name ?? root.name);
    }
  };
  const move = (target: string, direction: -1 | 1) =>
    patchRoot(moveSibling(draft.root, target, direction), target);
  const reorder = (target: string, newIndex: number) =>
    patchRoot(reorderSibling(draft.root, target, newIndex), target);
  const copy = (target: string) => {
    const sibling = copyNodeWithUniqueNames(draft.root, target);
    if (sibling) patchRoot(insertSiblingAfter(draft.root, target, sibling), sibling.name);
  };
  const rename = (candidate: string, input: HTMLInputElement) => {
    const valid =
      /^[A-Za-z][A-Za-z0-9_-]*$/.test(candidate) &&
      candidate !== "viewport" &&
      !flatten(draft.root).some((item) => item.name === candidate && item.name !== selected.name);
    if (!valid) {
      input.value = selected.name;
      return;
    }
    patchRoot(updateNode(draft.root, selected.name, { name: candidate }), candidate);
  };
  const updateGeometry = (key: SketchGeometryKey, value: SketchPercentage) =>
    patchRoot(updateNode(draft.root, selected.name, { [key]: value }));
  const updateCenter = (key: "centerX" | "centerY", value: SketchPercentage) =>
    patchRoot(updateNode(draft.root, selected.name, { [key]: value }));
  const updateRotation = (rotationDeg: RotationDeg) =>
    patchRoot(updateNode(draft.root, selected.name, { rotationDeg }));
  const setCellShadow = (shadow: boolean) => {
    if (selected.kind === "gridCell" && selected.children.length === 0)
      patchRoot(updateNode(draft.root, selected.name, { shadow }));
  };
  const setHidden = (target: string, hidden: boolean) =>
    patchRoot(updateNode(draft.root, target, { hidden }));
  const setAllItemsHidden = (hidden: boolean) => patchRoot(setAllHidden(draft.root, hidden));
  const convertToGrid = (target = selected.name) => {
    const targetNode = findNode(draft.root, target);
    if (targetNode?.kind !== "element" && targetNode?.kind !== "gridCell") return;
    const next = applyGridTemplate(targetNode, "(1)(1)");
    if (next && window.confirm("Convert this object to a grid? This cannot be undone."))
      patchRoot(updateNode(draft.root, target, next), target);
  };
  const updateGrid = (raw: string, input: HTMLInputElement) => {
    if (selected.kind !== "grid") return;
    const next = applyGridTemplate(selected, raw, resolveExpression);
    if (!next) {
      input.value = selected.grid!.raw;
      return;
    }
    if (gridTemplatesEqual(selected.grid!.raw, raw)) {
      input.value = next.grid!.raw;
      patchRoot(updateNode(draft.root, selected.name, next));
      return;
    }
    setPendingGridUpdate({
      target: selected.name,
      next,
      previousRaw: selected.grid!.raw,
      previousCellCount: selected.children.filter((child) => child.kind === "gridCell").length,
      nextCellCount: next.children.filter((child) => child.kind === "gridCell").length,
      input,
    });
  };
  const confirmGridUpdate = () => {
    if (!pendingGridUpdate) return;
    patchRoot(
      updateNode(draft.root, pendingGridUpdate.target, pendingGridUpdate.next),
      pendingGridUpdate.target,
    );
    setPendingGridUpdate(undefined);
  };
  const cancelGridUpdate = () => {
    if (pendingGridUpdate) pendingGridUpdate.input.value = pendingGridUpdate.previousRaw;
    setPendingGridUpdate(undefined);
  };
  const newDraft = () => {
    let index = document.drafts.length + 1;
    while (document.drafts.some((item) => item.name === `draft${index}`)) index += 1;
    const name = `draft${index}`;
    setDocument((current) => ({
      ...current,
      drafts: [
        ...current.drafts,
        {
          name,
          viewport: { w: 16, h: 9 },
          root: defaultSketchDocument().drafts[0]!.root,
          variables: [],
        },
      ],
      activeDraft: name,
      selectedName: "L1A",
    }));
  };
  const copyDraft = () => {
    let index = document.drafts.length + 1;
    while (document.drafts.some((item) => item.name === `draft${index}`)) index += 1;
    const name = `draft${index}`;
    // Only name/viewport/root/variables carry over — a copy is always
    // "unbound" even if the source draft is file-backed, so sourceFile/
    // sourceMtimeMs/savedSnapshot are deliberately left out.
    setDocument((current) => ({
      ...current,
      drafts: [
        ...current.drafts,
        {
          name,
          viewport: draft.viewport,
          root: cloneNode(draft.root),
          variables: [...draft.variables],
        },
      ],
      activeDraft: name,
      selectedName: current.selectedName,
    }));
  };
  // Deleting a file-backed draft never touches the file itself (there's no
  // delete endpoint) — this guard exists so the UI can't hide a draft
  // that's just going to reappear on the next disk-file discovery pass,
  // which would look like data loss. A draft whose file has disappeared
  // out from under it (isFileMissing) is treated like an unbound draft and
  // may be deleted freely.
  const deleteDraft = () => {
    if (document.drafts.length <= 1) return;
    if (draft.sourceFile !== undefined && !isFileMissing(draft)) return;
    const index = document.drafts.findIndex((item) => item.name === draft.name);
    const remaining = document.drafts.filter((item) => item.name !== draft.name);
    const next = remaining[index] ?? remaining[index - 1]!;
    setDocument((current) => ({
      ...current,
      drafts: current.drafts.filter((item) => item.name !== draft.name),
      activeDraft: next.name,
      selectedName: next.root.children[0]?.name ?? next.root.name,
    }));
  };
  // A draft "needs a new file" — and so must go through the save-as
  // filename dialog — both when it's never been saved and when its
  // previously-bound file has disappeared (isFileMissing): resurrecting
  // the old filename silently would be a footgun, so it's treated exactly
  // like a brand-new draft instead (see scenario 7 in the Save/Load plan).
  const draftNeedsNewFile = (target: SketchDraft) =>
    target.sourceFile === undefined || isFileMissing(target);
  /** Writes the current draft to disk. `filename` is required only when draftNeedsNewFile(draft). */
  const saveDraft = async (filename?: string): Promise<string | undefined> => {
    const needsNewFile = draftNeedsNewFile(draft);
    const target = needsNewFile ? filename : draft.sourceFile;
    if (!target) return "A filename is required";
    if (!LAYOUT_FILENAME_PATTERN.test(target))
      return "Filename must look like name.table-layout.json";
    if (needsNewFile && diskFiles.some((entry) => entry.name === target))
      return `${target} already exists`;
    const preset = exportSketchDraft(draft);
    let written: LayoutFileEntry;
    try {
      written = await writeLayoutFile(target, `${JSON.stringify(preset, null, 2)}\n`);
    } catch (error) {
      return error instanceof Error ? error.message : "Could not save";
    }
    setDiskFiles((current) =>
      [...current.filter((entry) => entry.name !== target), written].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    );
    patchDraft({
      sourceFile: target,
      sourceMtimeMs: written.mtimeMs,
      savedSnapshot: JSON.stringify(preset),
    });
    return undefined;
  };
  /** Replaces the current draft's content with what's on disk, discarding local edits. */
  const loadDraft = async (): Promise<string | undefined> => {
    if (draftNeedsNewFile(draft)) return "This draft has no file to load from";
    let content: string;
    try {
      content = await readLayoutFile(draft.sourceFile!);
    } catch (error) {
      return error instanceof Error ? error.message : "Could not load";
    }
    let preset;
    try {
      preset = parseLayoutPresetJson(content);
    } catch (error) {
      return error instanceof Error ? error.message : "Invalid file content";
    }
    const imported = importLayoutPreset(preset);
    const entry = diskFiles.find((item) => item.name === draft.sourceFile);
    setDocument((current) => ({
      ...current,
      selectedName: imported.root.children[0]?.name ?? imported.root.name,
      drafts: current.drafts.map((item) => {
        if (item.name !== draft.name) return item;
        const next: SketchDraft = {
          ...item,
          root: imported.root,
          viewport: imported.viewport,
          variables: imported.variables,
          ...(entry ? { sourceMtimeMs: entry.mtimeMs } : {}),
        };
        return { ...next, savedSnapshot: JSON.stringify(exportSketchDraft(next)) };
      }),
    }));
    return undefined;
  };
  const importPresetJson = (source: string) => {
    try {
      const preset = parseLayoutPresetJson(source);
      const imported = importLayoutPreset(preset);
      let index = 1;
      let name = imported.name;
      while (document.drafts.some((draft) => draft.name === name))
        name = `${imported.name}${index++}`;
      setDocument((current) => ({
        ...current,
        drafts: [...current.drafts, { ...imported, name }],
        activeDraft: name,
        selectedName: imported.root.children[0]?.name ?? imported.root.name,
      }));
      return undefined;
    } catch (error) {
      return error instanceof Error ? error.message : "Could not import LayoutPreset";
    }
  };
  const selectDraft = (activeDraft: string) => {
    const next = document.drafts.find((item) => item.name === activeDraft)!;
    patchDocument({ activeDraft, selectedName: next.root.children[0]?.name ?? next.root.name });
  };
  const renameDraft = (candidate: string, input: HTMLInputElement) => {
    const valid =
      /^[A-Za-z][A-Za-z0-9_-]*$/.test(candidate) &&
      !document.drafts.some((item) => item.name === candidate && item.name !== draft.name);
    if (!valid) {
      input.value = draft.name;
      return;
    }
    setDocument((current) => ({
      ...current,
      activeDraft: candidate,
      drafts: current.drafts.map((item) =>
        item.name === draft.name ? { ...item, name: candidate } : item,
      ),
    }));
  };
  const setViewportSize = (key: "w" | "h", value: number) =>
    setDocument((current) => ({
      ...current,
      drafts: current.drafts.map((item) =>
        item.name === draft.name ? { ...item, viewport: { ...item.viewport, [key]: value } } : item,
      ),
    }));
  // The canvas section (SketchCanvas.tsx) sets `containerType: "size"`, so
  // `cqh` measures its actual content-box height — unlike the `100vh` this
  // used to use, it doesn't drift when chrome above the canvas (header,
  // padding) changes size, and needs no magic-number fudge factor for it.
  const canvasStyle = useMemo(
    () => ({
      aspectRatio: `${draft.viewport.w}/${draft.viewport.h}`,
      width: `min(100%, ${100 * (draft.viewport.w / draft.viewport.h)}cqh)`,
    }),
    [draft.viewport],
  );
  return {
    document,
    draft,
    selected,
    showBoundaries,
    setShowBoundaries,
    viewportMode,
    setViewportMode,
    patchDocument,
    patchDraft,
    resolveExpression,
    addVariable,
    reorderVariable,
    updateVariable,
    removeVariable,
    isVariableUsed,
    select,
    add,
    remove,
    move,
    reorder,
    copy,
    rename,
    updateGeometry,
    updateCenter,
    updateRotation,
    setCellShadow,
    setHidden,
    setAllItemsHidden,
    convertToGrid,
    updateGrid,
    pendingGridUpdate,
    confirmGridUpdate,
    cancelGridUpdate,
    newDraft,
    copyDraft,
    deleteDraft,
    importPresetJson,
    selectDraft,
    renameDraft,
    setViewportSize,
    canvasStyle,
    diskFiles,
    isFileMissing,
    isDraftDirty,
    isDiskNewer,
    saveDraft,
    loadDraft,
  };
}
