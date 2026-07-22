import { useEffect, useMemo, useState } from "react";
import {
  addChild,
  applyGridTemplate,
  childName,
  copyNodeWithUniqueNames,
  defaultSketchDocument,
  findNode,
  flatten,
  gridTemplatesEqual,
  importLayoutPreset,
  parseLayoutPresetJson,
  insertSiblingAfter,
  moveSibling,
  randomSketchBackgroundColor,
  readSketchDocument,
  removeNode,
  resolveVariablePercentage,
  updateNode,
  writeSketchDocument,
  type SketchDocument,
  type SketchDraft,
  type SketchGeometryKey,
  type SketchPercentage,
  type SketchNode,
} from "@/lib/layoutSketch";
import { type RotationDeg } from "@/lib/layoutPreset";
import { DESKTOP_TABLE_PRESET } from "@/lib/desktopTablePreset";

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
const refreshDrafts = (drafts: SketchDraft[], variables: SketchDocument["variables"]) => {
  const resolve = (raw: string, minimum: number) =>
    resolveVariablePercentage(raw, variables, minimum);
  const refresh = (node: SketchNode): SketchNode => {
    const refreshed = {
      ...node,
      x: resolve(node.x.raw, 0) ?? node.x,
      y: resolve(node.y.raw, 0) ?? node.y,
      ...(node.centerX ? { centerX: resolve(node.centerX.raw, 0) ?? node.centerX } : {}),
      ...(node.centerY ? { centerY: resolve(node.centerY.raw, 0) ?? node.centerY } : {}),
      w: resolve(node.w.raw, 0.1) ?? node.w,
      h: resolve(node.h.raw, 0.1) ?? node.h,
      children: node.children.map(refresh),
    };
    return refreshed.kind === "grid"
      ? (applyGridTemplate(refreshed, refreshed.grid!.raw, resolve) ?? refreshed)
      : refreshed;
  };
  return drafts.map((item) => ({ ...item, root: refresh(item.root) }));
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
  const draft =
    document.drafts.find((item) => item.name === document.activeDraft) ?? document.drafts[0]!;
  const selected = findNode(draft.root, document.selectedName) ?? draft.root;
  useEffect(() => {
    const timer = window.setTimeout(() => writeSketchDocument(document), 150);
    return () => window.clearTimeout(timer);
  }, [document]);
  const patchDocument = (next: Partial<SketchDocument>) =>
    setDocument((current) => ({ ...current, ...next }));
  const patchRoot = (root: typeof draft.root, selectedName = document.selectedName) =>
    setDocument((current) => ({
      ...current,
      selectedName,
      drafts: current.drafts.map((item) => (item.name === draft.name ? { ...item, root } : item)),
    }));
  const select = (selectedName: string) => patchDocument({ selectedName });
  const resolveExpression = (raw: string, minimum: number) =>
    resolveVariablePercentage(raw, document.variables, minimum);
  const addVariable = () => {
    let index = document.variables.length + 1;
    while (document.variables.some((variable) => variable.name === `var${index}`)) index += 1;
    const name = `var${index}`;
    patchDocument({ variables: [...document.variables, { name, value: "0" }] });
  };
  const updateVariable = (name: string, key: "name" | "value", value: string) => {
    const candidate = value.trim();
    const next = document.variables.map((item) =>
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
      variables: rewritten,
      drafts: refreshDrafts(
        renamed
          ? current.drafts.map((draft) => ({
              ...draft,
              root: rewriteNodeReferences(draft.root, name, candidate),
            }))
          : current.drafts,
        rewritten,
      ),
    }));
    return true;
  };
  const isVariableUsed = (name: string) =>
    document.variables.some(
      (variable) => variable.name !== name && referencesVariable(variable.value, name),
    ) ||
    document.drafts.some((draft) =>
      flatten(draft.root).some((node) =>
        [node.x.raw, node.y.raw, node.w.raw, node.h.raw, node.grid?.raw ?? ""].some((raw) =>
          referencesVariable(raw, name),
        ),
      ),
    );
  const removeVariable = (name: string) => {
    if (isVariableUsed(name)) return false;
    setDocument((current) => ({
      ...current,
      variables: current.variables.filter((variable) => variable.name !== name),
    }));
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
        x: { raw: "10", resolved: 10 },
        y: { raw: "10", resolved: 10 },
        w: { raw: "30", resolved: 30 },
        h: { raw: "20", resolved: 20 },
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
  const convertToGrid = (target = selected.name) => {
    const targetNode = findNode(draft.root, target);
    if (targetNode?.kind !== "element") return;
    const next = applyGridTemplate(targetNode, "(100)(100)");
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
        { name, viewport: { w: 16, h: 9 }, root: defaultSketchDocument().drafts[0]!.root },
      ],
      activeDraft: name,
      selectedName: "L1A",
    }));
  };
  const copyDraft = () => {
    let index = document.drafts.length + 1;
    while (document.drafts.some((item) => item.name === `draft${index}`)) index += 1;
    const name = `draft${index}`;
    const root = cloneNode(draft.root);
    setDocument((current) => ({
      ...current,
      drafts: [...current.drafts, { ...draft, name, root }],
      activeDraft: name,
      selectedName: current.selectedName,
    }));
  };
  const deleteDraft = () => {
    if (document.drafts.length <= 1) return;
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
  const importDesktop = () => {
    const imported = importLayoutPreset(JSON.parse(JSON.stringify(DESKTOP_TABLE_PRESET)));
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
        ...(preset.editor ? { variables: preset.editor.variables } : {}),
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
  const canvasStyle = useMemo(
    () => ({
      aspectRatio: `${draft.viewport.w}/${draft.viewport.h}`,
      width: `min(100%, calc((100vh - 4rem) * ${draft.viewport.w / draft.viewport.h}))`,
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
    resolveExpression,
    addVariable,
    updateVariable,
    removeVariable,
    isVariableUsed,
    select,
    add,
    remove,
    move,
    copy,
    rename,
    updateGeometry,
    updateCenter,
    updateRotation,
    setCellShadow,
    convertToGrid,
    updateGrid,
    pendingGridUpdate,
    confirmGridUpdate,
    cancelGridUpdate,
    newDraft,
    copyDraft,
    deleteDraft,
    importDesktop,
    importPresetJson,
    selectDraft,
    renameDraft,
    setViewportSize,
    canvasStyle,
  };
}
