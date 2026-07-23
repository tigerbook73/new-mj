import type { LayoutPreset, RotationDeg, Zone } from "./layoutPreset";

export const LAYOUT_SKETCH_STORAGE_KEY = "new-mj:layout-sketches:v1";
export const SKETCH_BACKGROUND_COLORS = [
  "#fde2e4",
  "#e2f0cb",
  "#d6e5fa",
  "#fff1c1",
  "#e8d9ff",
  "#d8f3f0",
] as const;
export type SketchBackgroundColor = (typeof SKETCH_BACKGROUND_COLORS)[number];
export type SketchPercentage = { raw: string; resolved: number };
export type SketchGeometryKey = "x" | "y" | "w" | "h";
export type SketchNodeKind = "element" | "grid" | "gridCell";
export type SketchGrid = { raw: string };
export type SketchVariable = { name: string; value: string };

export type SketchNode = {
  name: string;
  x: SketchPercentage;
  y: SketchPercentage;
  centerX?: SketchPercentage;
  centerY?: SketchPercentage;
  w: SketchPercentage;
  h: SketchPercentage;
  kind: SketchNodeKind;
  /** Grid-generated cells default to shadows and are omitted from export when empty. */
  shadow?: boolean;
  rotationDeg?: RotationDeg;
  grid?: SketchGrid;
  backgroundColor: SketchBackgroundColor;
  children: SketchNode[];
};
export type SketchDraft = { name: string; viewport: { w: number; h: number }; root: SketchNode };
export type SketchDocument = {
  version: 2;
  drafts: SketchDraft[];
  activeDraft: string;
  selectedName: string;
  leftWidth: number;
  leftTreeHeight: number;
  rightWidth: number;
  variables: SketchVariable[];
};

const sketchPercentage = (resolved: number): SketchPercentage => ({
  raw: String(resolved),
  resolved,
});
const importZone = (zone: Zone): SketchNode => ({
  name: zone.id,
  x: sketchPercentage(zone.anchorCenter.x - zone.localSize.w / 2),
  y: sketchPercentage(zone.anchorCenter.y - zone.localSize.h / 2),
  w: sketchPercentage(zone.localSize.w),
  h: sketchPercentage(zone.localSize.h),
  kind: "element",
  shadow: false,
  rotationDeg: zone.rotationDeg,
  backgroundColor: colorForName(zone.id),
  children: zone.children?.map(importZone) ?? [],
});

const objectRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const importNumber = (value: unknown, label: string, minimum: number, maximum: number) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum)
    throw new Error(`${label} must be a number from ${minimum} to ${maximum}`);
  return value;
};

function parseImportedZone(value: unknown, path: string, names: Set<string>): Zone {
  const item = objectRecord(value);
  const id = typeof item.id === "string" ? item.id : "";
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(id)) throw new Error(`${path}.id is invalid`);
  if (names.has(id)) throw new Error(`Zone id "${id}" is duplicated`);
  names.add(id);
  const anchorCenter = objectRecord(item.anchorCenter);
  const localSize = objectRecord(item.localSize);
  const rotationDeg = item.rotationDeg;
  if (rotationDeg !== 0 && rotationDeg !== 90 && rotationDeg !== 180 && rotationDeg !== -90)
    throw new Error(`${path}.rotationDeg must be 0, 90, 180, or -90`);
  const children = item.children;
  if (children !== undefined && !Array.isArray(children))
    throw new Error(`${path}.children must be an array`);
  return {
    id,
    anchorCenter: {
      x: importNumber(anchorCenter.x, `${path}.anchorCenter.x`, 0, 100),
      y: importNumber(anchorCenter.y, `${path}.anchorCenter.y`, 0, 100),
    },
    localSize: {
      w: importNumber(localSize.w, `${path}.localSize.w`, 0.1, 100),
      h: importNumber(localSize.h, `${path}.localSize.h`, 0.1, 100),
    },
    rotationDeg,
    ...(Array.isArray(children)
      ? {
          children: children.map((child, index) =>
            parseImportedZone(child, `${path}.children[${index}]`, names),
          ),
        }
      : {}),
  };
}

export function parseLayoutPresetJson(source: string): LayoutPreset {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error("Invalid JSON");
  }
  const item = objectRecord(value);
  if (typeof item.name !== "string" || item.name.trim() === "")
    throw new Error("Preset name is required");
  const referenceCanvas = objectRecord(item.referenceCanvas);
  const editor = objectRecord(item.editor);
  const names = new Set<string>();
  return {
    name: item.name.trim(),
    referenceCanvas: {
      w: importNumber(referenceCanvas.w, "referenceCanvas.w", 0.1, 100_000),
      h: importNumber(referenceCanvas.h, "referenceCanvas.h", 0.1, 100_000),
    },
    root: parseImportedZone(item.root, "root", names),
    ...(editor.version === 1 && editor.root !== undefined && Array.isArray(editor.variables)
      ? {
          editor: {
            version: 1 as const,
            root: editor.root,
            variables: editor.variables as { name: string; value: string }[],
          },
        }
      : {}),
  };
}

/** Imports Zone geometry and rotation; arrangement remains editor metadata for now. */
export const importLayoutPreset = (preset: LayoutPreset): SketchDraft => {
  if (preset.editor) {
    return readSketchDocument({
      getItem: () =>
        JSON.stringify({
          version: 2,
          drafts: [
            { name: preset.name, viewport: preset.referenceCanvas, root: preset.editor!.root },
          ],
          activeDraft: preset.name,
          selectedName: "viewport",
          leftWidth: 240,
          leftTreeHeight: 280,
          rightWidth: 280,
          variables: preset.editor!.variables,
        }),
    }).drafts[0]!;
  }
  const scale = Math.max(preset.referenceCanvas.w, preset.referenceCanvas.h) / 16;
  return {
    name: preset.name,
    viewport: { w: preset.referenceCanvas.w / scale, h: preset.referenceCanvas.h / scale },
    root: {
      name: "viewport",
      x: sketchPercentage(0),
      y: sketchPercentage(0),
      w: sketchPercentage(100),
      h: sketchPercentage(100),
      kind: "element",
      shadow: false,
      backgroundColor: "#fde2e4",
      children: preset.root.children?.map(importZone) ?? [],
    },
  };
};

const colorForName = (value: string): SketchBackgroundColor =>
  SKETCH_BACKGROUND_COLORS[
    [...value].reduce((total, character) => total + character.charCodeAt(0), 0) %
      SKETCH_BACKGROUND_COLORS.length
  ]!;
export const randomSketchBackgroundColor = (): SketchBackgroundColor =>
  SKETCH_BACKGROUND_COLORS[Math.floor(Math.random() * SKETCH_BACKGROUND_COLORS.length)]!;
const root = (): SketchNode => ({
  name: "viewport",
  x: { raw: "0", resolved: 0 },
  y: { raw: "0", resolved: 0 },
  w: { raw: "100", resolved: 100 },
  h: { raw: "100", resolved: 100 },
  kind: "element",
  shadow: false,
  backgroundColor: "#fde2e4",
  children: [
    {
      name: "L1A",
      x: { raw: "10", resolved: 10 },
      y: { raw: "10", resolved: 10 },
      w: { raw: "30", resolved: 30 },
      h: { raw: "20", resolved: 20 },
      kind: "element",
      shadow: false,
      backgroundColor: randomSketchBackgroundColor(),
      children: [],
    },
  ],
});
export const defaultSketchDocument = (): SketchDocument => ({
  version: 2,
  drafts: [{ name: "draft1", viewport: { w: 16, h: 9 }, root: root() }],
  activeDraft: "draft1",
  selectedName: "L1A",
  leftWidth: 240,
  leftTreeHeight: 280,
  rightWidth: 280,
  variables: [],
});

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const number = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
const percentage = (value: unknown, fallback: SketchPercentage, min: number): SketchPercentage => {
  if (typeof value === "number") {
    const resolved = number(value, fallback.resolved, min, 100);
    return { raw: String(resolved), resolved };
  }
  const item = record(value);
  if (typeof item.raw !== "string") return fallback;
  const resolved =
    parsePercentage(item.raw) ??
    (typeof item.resolved === "number" && Number.isFinite(item.resolved)
      ? item.resolved
      : undefined);
  return resolved !== undefined && resolved >= min ? { raw: item.raw.trim(), resolved } : fallback;
};
const name = (value: unknown, fallback: string) =>
  typeof value === "string" && /^[A-Za-z][A-Za-z0-9_-]*$/.test(value) ? value : fallback;

function node(value: unknown, fallback: SketchNode, legacyGridAxes = false): SketchNode {
  const item = record(value);
  const kind: SketchNodeKind =
    item.kind === "grid" || item.kind === "gridCell" ? item.kind : "element";
  const result: SketchNode = {
    name: name(item.name, fallback.name),
    x: percentage(item.x, fallback.x, 0),
    y: percentage(item.y, fallback.y, 0),
    w: percentage(item.w, fallback.w, 0.1),
    h: percentage(item.h, fallback.h, 0.1),
    kind,
    shadow:
      kind === "gridCell"
        ? typeof item.shadow === "boolean"
          ? item.shadow
          : item.zoneMode === "normal"
            ? false
            : true
        : false,
    rotationDeg:
      item.rotationDeg === 90 || item.rotationDeg === 180 || item.rotationDeg === -90
        ? item.rotationDeg
        : 0,
    ...(kind === "grid" && typeof record(item.grid).raw === "string"
      ? { grid: { raw: record(item.grid).raw as string } }
      : {}),
    backgroundColor: SKETCH_BACKGROUND_COLORS.includes(
      item.backgroundColor as SketchBackgroundColor,
    )
      ? (item.backgroundColor as SketchBackgroundColor)
      : colorForName(name(item.name, fallback.name)),
    children: Array.isArray(item.children)
      ? item.children.map((child, index) =>
          node(child, { ...fallback, name: `object${index + 1}`, children: [] }, legacyGridAxes),
        )
      : [],
  };
  result.centerX =
    typeof record(item.centerX).raw === "string"
      ? percentage(item.centerX, { raw: "0", resolved: 0 }, 0)
      : {
          raw: String(result.x.resolved + result.w.resolved / 2),
          resolved: result.x.resolved + result.w.resolved / 2,
        };
  result.centerY =
    typeof record(item.centerY).raw === "string"
      ? percentage(item.centerY, { raw: "0", resolved: 0 }, 0)
      : {
          raw: String(result.y.resolved + result.h.resolved / 2),
          resolved: result.y.resolved + result.h.resolved / 2,
        };
  return result.kind === "grid"
    ? (applyGridTemplate(
        result,
        legacyGridAxes
          ? swapGridAxes(result.grid?.raw ?? "(100)(100)")
          : (result.grid?.raw ?? "(100)(100)"),
      ) ?? result)
    : result;
}

export function readSketchDocument(
  storage: Pick<Storage, "getItem"> = localStorage,
): SketchDocument {
  try {
    const raw = storage.getItem(LAYOUT_SKETCH_STORAGE_KEY);
    if (!raw) return defaultSketchDocument();
    const parsed = record(JSON.parse(raw));
    if (
      (parsed.version !== 1 && parsed.version !== 2) ||
      !Array.isArray(parsed.drafts) ||
      parsed.drafts.length === 0
    )
      return defaultSketchDocument();
    const legacyGridAxes = parsed.version === 1;
    const drafts = parsed.drafts.map((draft, index) => {
      const item = record(draft);
      const fallback = defaultSketchDocument().drafts[0]!;
      return {
        name: name(item.name, `draft${index + 1}`),
        viewport: {
          w: number(record(item.viewport).w, fallback.viewport.w, 1, 32),
          h: number(record(item.viewport).h, fallback.viewport.h, 1, 32),
        },
        root: node(item.root, fallback.root, legacyGridAxes),
      };
    });
    if (new Set(drafts.map((draft) => draft.name)).size !== drafts.length)
      return defaultSketchDocument();
    const allNames = flatten(
      drafts.find((draft) => draft.name === parsed.activeDraft)?.root ?? drafts[0]!.root,
    ).map((item) => item.name);
    return {
      version: 2,
      drafts,
      activeDraft: drafts.some((draft) => draft.name === parsed.activeDraft)
        ? (parsed.activeDraft as string)
        : drafts[0]!.name,
      selectedName:
        typeof parsed.selectedName === "string" && allNames.includes(parsed.selectedName)
          ? parsed.selectedName
          : allNames[0]!,
      leftWidth: number(parsed.leftWidth, 240, 160, 480),
      leftTreeHeight: number(parsed.leftTreeHeight, 280, 120, 1200),
      rightWidth: number(parsed.rightWidth, 280, 180, 520),
      variables: Array.isArray(parsed.variables)
        ? parsed.variables.reduce<SketchVariable[]>((variables, value) => {
            const item = record(value);
            if (
              typeof item.name === "string" &&
              /^[A-Za-z0-9_]+$/.test(item.name) &&
              typeof item.value === "string" &&
              !variables.some((variable) => variable.name === item.name)
            )
              variables.push({ name: item.name, value: item.value });
            return variables;
          }, [])
        : [],
    };
  } catch {
    return defaultSketchDocument();
  }
}

export const writeSketchDocument = (
  document: SketchDocument,
  storage: Pick<Storage, "setItem"> = localStorage,
) => storage.setItem(LAYOUT_SKETCH_STORAGE_KEY, JSON.stringify(document));
export const flatten = (root: SketchNode): SketchNode[] => [
  root,
  ...root.children.flatMap(flatten),
];
export const findNode = (root: SketchNode, target: string): SketchNode | undefined =>
  root.name === target ? root : root.children.map((child) => findNode(child, target)).find(Boolean);
export const findParentNode = (root: SketchNode, target: string): SketchNode | undefined =>
  root.children.some((child) => child.name === target)
    ? root
    : root.children.map((child) => findParentNode(child, target)).find(Boolean);
export const updateNode = (
  root: SketchNode,
  target: string,
  patch: Partial<Omit<SketchNode, "children">>,
): SketchNode =>
  root.name === target
    ? { ...root, ...patch }
    : { ...root, children: root.children.map((child) => updateNode(child, target, patch)) };
export const removeNode = (root: SketchNode, target: string): SketchNode => ({
  ...root,
  children: root.children
    .filter((child) => child.name !== target)
    .map((child) => removeNode(child, target)),
});
export const moveSibling = (root: SketchNode, target: string, direction: -1 | 1): SketchNode => {
  const index = root.children.findIndex((child) => child.name === target);
  if (index >= 0) {
    const next = index + direction;
    if (next < 0 || next >= root.children.length) return root;
    const children = [...root.children];
    [children[index], children[next]] = [children[next]!, children[index]!];
    return { ...root, children };
  }
  return { ...root, children: root.children.map((child) => moveSibling(child, target, direction)) };
};
export function copyNodeWithUniqueNames(root: SketchNode, target: string): SketchNode | undefined {
  const source = findNode(root, target);
  if (!source || source.kind !== "element") return undefined;
  const names = new Set(flatten(root).map((node) => node.name));
  const nextName = (base: string) => {
    if (!names.has(base)) {
      names.add(base);
      return base;
    }
    for (let index = 1; ; index += 1) {
      const candidate = `${base}${index}`;
      if (!names.has(candidate)) {
        names.add(candidate);
        return candidate;
      }
    }
  };
  const copy = (node: SketchNode, sourceParent?: string, copyParent?: string): SketchNode => {
    const base =
      sourceParent && copyParent && node.name.startsWith(sourceParent)
        ? `${copyParent}${node.name.slice(sourceParent.length)}`
        : node.name;
    const name = nextName(base);
    return { ...node, name, children: node.children.map((child) => copy(child, node.name, name)) };
  };
  const result = copy(source);
  const offset = (value: SketchPercentage): SketchPercentage => {
    const resolved = Math.min(100, value.resolved + 10);
    return { raw: String(resolved), resolved };
  };
  return { ...result, x: offset(source.x), y: offset(source.y) };
}
export const insertSiblingAfter = (
  root: SketchNode,
  target: string,
  sibling: SketchNode,
): SketchNode => {
  const index = root.children.findIndex((child) => child.name === target);
  if (index >= 0)
    return {
      ...root,
      children: [...root.children.slice(0, index + 1), sibling, ...root.children.slice(index + 1)],
    };
  return {
    ...root,
    children: root.children.map((child) => insertSiblingAfter(child, target, sibling)),
  };
};
export function uniqueName(root: SketchNode, base = "object") {
  const names = new Set(flatten(root).map((item) => item.name));
  for (let index = 1; ; index += 1) {
    const candidate = `${base}${index}`;
    if (!names.has(candidate)) return candidate;
  }
}
export function childName(root: SketchNode, parent: string) {
  if (parent === "viewport") {
    for (let index = 0; ; index += 1) {
      const candidate = `L1${String.fromCharCode(65 + index)}`;
      if (!findNode(root, candidate)) return candidate;
    }
  }
  for (let index = 1; ; index += 1) {
    const candidate = `${parent}-${index}`;
    if (!findNode(root, candidate)) return candidate;
  }
}
export const addChild = (root: SketchNode, parent: string, child: SketchNode): SketchNode =>
  root.name === parent
    ? { ...root, children: [...root.children, child] }
    : { ...root, children: root.children.map((item) => addChild(item, parent, child)) };

/** `1/2` means half of the parent, i.e. 50 percentage points. */
export function parsePercentage(value: string): number | undefined {
  const source = value.trim();
  const fraction = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*\/\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/.exec(
    source,
  );
  const numeric = Number(source);
  const parsed = fraction
    ? (Number(fraction[1]) / Number(fraction[2])) * 100
    : Math.abs(numeric - 1) < 1e-6
      ? 100
      : numeric > 0 && numeric < 1
        ? numeric * 100
        : numeric;
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : undefined;
}

export const resolvePercentage = (raw: string, minimum = 0): SketchPercentage | undefined => {
  const resolved = parsePercentage(raw);
  return resolved !== undefined && resolved >= minimum ? { raw: raw.trim(), resolved } : undefined;
};

export function resolveVariablePercentage(raw: string, variables: SketchVariable[], minimum = 0) {
  const lookup = new Map(variables.map((variable) => [variable.name, variable.value]));
  const resolve = (source: string, seen: Set<string>): number | undefined => {
    const reference = /^\$([A-Za-z0-9_]+)$/.exec(source.trim());
    if (!reference) return parsePercentage(source);
    const name = reference[1]!;
    if (seen.has(name)) return undefined;
    const value = lookup.get(name);
    return value === undefined ? undefined : resolve(value, new Set([...seen, name]));
  };
  const resolved = resolve(raw, new Set());
  return resolved !== undefined && resolved >= minimum ? { raw: raw.trim(), resolved } : undefined;
}

export type SketchGridDefinition = { rows: SketchPercentage[]; columns: SketchPercentage[] };
const gridAxes = (source: string) => {
  const match = /^\s*\(([^()]*)\)\s*\(([^()]*)\)\s*$/.exec(source);
  return match
    ? [match[1]!.trim().split(/\s+/).filter(Boolean), match[2]!.trim().split(/\s+/).filter(Boolean)]
    : undefined;
};

const swapGridAxes = (source: string) => {
  const axes = gridAxes(source);
  return axes ? `(${axes[1]!.join(" ")})(${axes[0]!.join(" ")})` : source;
};

export const formatGridTemplate = (source: string) => {
  const axes = gridAxes(source);
  return axes ? `(${axes[0]!.join(" ")})(${axes[1]!.join(" ")})` : undefined;
};

export function parseGridTemplate(
  raw: string,
  resolve: (raw: string, minimum: number) => SketchPercentage | undefined = resolvePercentage,
): SketchGridDefinition | undefined {
  const axes = gridAxes(raw);
  if (!axes) return undefined;
  const resolveAxis = (source: string) => {
    const tokens = source.trim().split(/\s+/).filter(Boolean);
    const stars = tokens.filter((token) => token === "*").length;
    const fixed = tokens.map((token) => (token === "*" ? undefined : resolve(token, 0.1)));
    if (tokens.length === 0 || fixed.some((value, index) => tokens[index] !== "*" && !value))
      return undefined;
    const fixedTotal = fixed.reduce((sum, value) => sum + (value?.resolved ?? 0), 0);
    if (stars === 0)
      return Math.abs(fixedTotal - 100) < 1e-6 ? (fixed as SketchPercentage[]) : undefined;
    const auto = (100 - fixedTotal) / stars;
    if (auto < 0.1) return undefined;
    return tokens.map((token, index) =>
      token === "*" ? { raw: "*", resolved: auto } : fixed[index]!,
    );
  };
  const columns = resolveAxis(axes[0]!.join(" "));
  const rows = resolveAxis(axes[1]!.join(" "));
  return rows && columns ? { rows, columns } : undefined;
}

export function gridTemplatesEqual(left: string, right: string) {
  const first = gridAxes(left);
  const second = gridAxes(right);
  return (
    !!first &&
    !!second &&
    first.every((axis, index) => axis.join("\0") === second[index]!.join("\0"))
  );
}

const gridCell = (
  grid: SketchNode,
  row: number,
  column: number,
  definition: SketchGridDefinition,
  children: SketchNode[],
  shadow = true,
): SketchNode => {
  const y = definition.rows.slice(0, row).reduce((sum, value) => sum + value.resolved, 0);
  const x = definition.columns.slice(0, column).reduce((sum, value) => sum + value.resolved, 0);
  return {
    name: `${grid.name}-r${row + 1}c${column + 1}`,
    x: { raw: String(x), resolved: x },
    y: { raw: String(y), resolved: y },
    w: definition.columns[column]!,
    h: definition.rows[row]!,
    kind: "gridCell",
    shadow,
    backgroundColor: colorForName(`${grid.name}-${row}-${column}`),
    children,
  };
};

export function applyGridTemplate(
  grid: SketchNode,
  raw: string,
  resolve?: (raw: string, minimum: number) => SketchPercentage | undefined,
): SketchNode | undefined {
  const definition = parseGridTemplate(raw, resolve);
  const formatted = formatGridTemplate(raw);
  if (!definition || !formatted) return undefined;
  const existingCells = new Map(
    grid.children.filter((child) => child.kind === "gridCell").map((child) => [child.name, child]),
  );
  const freeChildren = grid.children.filter((child) => child.kind !== "gridCell");
  return {
    ...grid,
    kind: "grid",
    grid: { raw: formatted },
    children: [
      ...definition.rows.flatMap((_, row) =>
        definition.columns.map((_, column) => {
          const name = `${grid.name}-r${row + 1}c${column + 1}`;
          const existing = existingCells.get(name);
          return gridCell(
            grid,
            row,
            column,
            definition,
            existing?.children ?? [],
            existing?.shadow ?? true,
          );
        }),
      ),
      ...freeChildren,
    ],
  };
}

const shouldExportZone = (node: SketchNode) =>
  node.kind !== "gridCell" || !node.shadow || node.children.length > 0;
const exportChildren = (node: SketchNode): Zone[] =>
  node.children.filter(shouldExportZone).map(exportZone);

const exportZone = (node: SketchNode): Zone => {
  const children = exportChildren(node);
  return {
    id: node.name,
    anchorCenter: {
      x: node.centerX?.resolved ?? node.x.resolved + node.w.resolved / 2,
      y: node.centerY?.resolved ?? node.y.resolved + node.h.resolved / 2,
    },
    localSize: { w: node.w.resolved, h: node.h.resolved },
    rotationDeg: node.rotationDeg ?? 0,
    ...(children.length > 0 ? { children } : {}),
  };
};

/** Exports resolved geometry only; empty Grid-cell placeholders are omitted. */
export const exportSketchDraft = (
  draft: SketchDraft,
  variables: SketchVariable[] = [],
): LayoutPreset => ({
  name: draft.name,
  referenceCanvas: { ...draft.viewport },
  root: {
    id: draft.root.name,
    anchorCenter: { x: 50, y: 50 },
    localSize: { w: 100, h: 100 },
    rotationDeg: 0,
    ...(exportChildren(draft.root).length > 0 ? { children: exportChildren(draft.root) } : {}),
  },
  editor: { version: 1, root: draft.root, variables },
});
