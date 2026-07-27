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
  /** Canvas-only visibility toggle — never reaches exportZone/the exported LayoutPreset. */
  hidden?: boolean;
  children: SketchNode[];
};
export type SketchDraft = {
  name: string;
  viewport: { w: number; h: number };
  root: SketchNode;
  variables: SketchVariable[];
  /** Filename this draft is bound to under apps/web/src/layouts/, if it's been opened from or saved to disk. */
  sourceFile?: string;
  /** Disk mtime as of the last successful Save/Load, used to detect external edits. */
  sourceMtimeMs?: number;
  /** exportSketchDraft(draft) JSON as of the last successful Save/Load, used to detect local edits. */
  savedSnapshot?: string;
};
export type SketchDocument = {
  version: 4;
  drafts: SketchDraft[];
  activeDraft: string;
  selectedName: string;
  leftWidth: number;
  leftTreeHeight: number;
  rightWidth: number;
};

const sketchPercentage = (resolved: number): SketchPercentage => ({
  raw: String(resolved),
  resolved,
});

// Preserves whatever expression the user typed, only collapsing whitespace
// (leading/trailing trim + interior runs to a single space) — never
// reformats the expression itself (operator spacing, term order, etc.).
const normalizeRawExpression = (value: string) => value.trim().replace(/\s+/g, " ");

// Plain float arithmetic on the 0-1 ratio scale hits binary-representation
// noise even for "nice" round inputs (0.2 + 0.1 = 0.30000000000000004) —
// something the old, coarser 0-100 scale mostly didn't surface. Used
// anywhere a ratio gets synthesized from arithmetic on other ratios
// (derived center points, expression results, copy-paste offsets), not on
// values that already came straight from a user's raw string.
export const roundRatio = (value: number) => Math.round(value * 1e6) / 1e6;
// Production Zones stay on the 0-100 percentage scale (see exportZone's
// matching *100 at the other end) — the Lab's own internal scale is 0-1
// ratios, so importing a real Zone's geometry needs /100 here.
const importZone = (zone: Zone): SketchNode => ({
  name: zone.id,
  x: sketchPercentage((zone.anchorCenter.x - zone.localSize.w / 2) / 100),
  y: sketchPercentage((zone.anchorCenter.y - zone.localSize.h / 2) / 100),
  w: sketchPercentage(zone.localSize.w / 100),
  h: sketchPercentage(zone.localSize.h / 100),
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
    ...(editor.version === 2 && editor.root !== undefined && Array.isArray(editor.variables)
      ? {
          editor: {
            version: 2 as const,
            root: editor.root,
            variables: editor.variables as { name: string; value: string }[],
          },
        }
      : {}),
  };
}

/** Imports Zone geometry and rotation; arrangement remains editor metadata for now. */
export const importLayoutPreset = (preset: LayoutPreset, sourceFile?: string): SketchDraft => {
  const draft: SketchDraft = preset.editor
    ? readSketchDocument({
        getItem: () =>
          JSON.stringify({
            version: 4,
            drafts: [
              {
                name: preset.name,
                viewport: preset.referenceCanvas,
                root: preset.editor!.root,
                variables: preset.editor!.variables,
              },
            ],
            activeDraft: preset.name,
            selectedName: "viewport",
            leftWidth: 240,
            leftTreeHeight: 280,
            rightWidth: 280,
          }),
      }).drafts[0]!
    : (() => {
        const scale = Math.max(preset.referenceCanvas.w, preset.referenceCanvas.h) / 16;
        return {
          name: preset.name,
          viewport: { w: preset.referenceCanvas.w / scale, h: preset.referenceCanvas.h / scale },
          root: {
            name: "viewport",
            x: sketchPercentage(0),
            y: sketchPercentage(0),
            w: sketchPercentage(1),
            h: sketchPercentage(1),
            kind: "element" as const,
            shadow: false,
            backgroundColor: "#fde2e4" as const,
            children: preset.root.children?.map(importZone) ?? [],
          },
          variables: [],
        };
      })();
  return sourceFile ? { ...draft, sourceFile } : draft;
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
  w: { raw: "1", resolved: 1 },
  h: { raw: "1", resolved: 1 },
  kind: "element",
  shadow: false,
  backgroundColor: "#fde2e4",
  children: [
    {
      name: "L1A",
      x: { raw: "0.1", resolved: 0.1 },
      y: { raw: "0.1", resolved: 0.1 },
      w: { raw: "0.3", resolved: 0.3 },
      h: { raw: "0.2", resolved: 0.2 },
      kind: "element",
      shadow: false,
      backgroundColor: randomSketchBackgroundColor(),
      children: [],
    },
  ],
});
export const defaultSketchDocument = (): SketchDocument => ({
  version: 4,
  drafts: [{ name: "draft1", viewport: { w: 16, h: 9 }, root: root(), variables: [] }],
  activeDraft: "draft1",
  selectedName: "L1A",
  leftWidth: 240,
  leftTreeHeight: 280,
  rightWidth: 280,
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
    // No upper bound — values over 1 (over 100% once exported) are a
    // legitimate real-world layout, not a parsing mistake to clamp away.
    const resolved = number(value, fallback.resolved, min, Infinity);
    return { raw: String(resolved), resolved };
  }
  const item = record(value);
  if (typeof item.raw !== "string") return fallback;
  const resolved =
    parsePercentage(item.raw) ??
    (typeof item.resolved === "number" && Number.isFinite(item.resolved)
      ? item.resolved
      : undefined);
  return resolved !== undefined && resolved >= min
    ? { raw: normalizeRawExpression(item.raw), resolved }
    : fallback;
};
const name = (value: unknown, fallback: string) =>
  typeof value === "string" && /^[A-Za-z][A-Za-z0-9_-]*$/.test(value) ? value : fallback;
const parseVariables = (value: unknown): SketchVariable[] =>
  Array.isArray(value)
    ? value.reduce<SketchVariable[]>((variables, entry) => {
        const item = record(entry);
        if (
          typeof item.name === "string" &&
          /^[A-Za-z0-9_]+$/.test(item.name) &&
          typeof item.value === "string" &&
          !variables.some((variable) => variable.name === item.name)
        )
          variables.push({ name: item.name, value: item.value });
        return variables;
      }, [])
    : [];

function node(value: unknown, fallback: SketchNode): SketchNode {
  const item = record(value);
  const kind: SketchNodeKind =
    item.kind === "grid" || item.kind === "gridCell" ? item.kind : "element";
  const result: SketchNode = {
    name: name(item.name, fallback.name),
    x: percentage(item.x, fallback.x, 0),
    y: percentage(item.y, fallback.y, 0),
    w: percentage(item.w, fallback.w, 0.001),
    h: percentage(item.h, fallback.h, 0.001),
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
    hidden: typeof item.hidden === "boolean" ? item.hidden : false,
    children: Array.isArray(item.children)
      ? item.children.map((child, index) =>
          node(child, { ...fallback, name: `object${index + 1}`, children: [] }),
        )
      : [],
  };
  result.centerX =
    typeof record(item.centerX).raw === "string"
      ? percentage(item.centerX, { raw: "0", resolved: 0 }, 0)
      : sketchPercentage(roundRatio(result.x.resolved + result.w.resolved / 2));
  result.centerY =
    typeof record(item.centerY).raw === "string"
      ? percentage(item.centerY, { raw: "0", resolved: 0 }, 0)
      : sketchPercentage(roundRatio(result.y.resolved + result.h.resolved / 2));
  return result.kind === "grid"
    ? (applyGridTemplate(result, result.grid?.raw ?? "(1)(1)") ?? result)
    : result;
}

export function readSketchDocument(
  storage: Pick<Storage, "getItem"> = localStorage,
): SketchDocument {
  try {
    const raw = storage.getItem(LAYOUT_SKETCH_STORAGE_KEY);
    if (!raw) return defaultSketchDocument();
    const parsed = record(JSON.parse(raw));
    // Only the current document version is accepted — versions 1 and 2 both
    // predate the switch from a 0-100 percentage scale to 0-1 ratios (see
    // parsePercentage's docs), and reinterpreting their raw numbers under
    // the new scale without rescaling them would silently produce zones
    // 100x too large; version 3 predates moving `variables` from
    // document-level to per-draft. Deliberately not migrated: this is a
    // local, single-developer dev tool with no real user-data-loss stakes,
    // so an old document just falls back to a blank draft — same path as
    // any other malformed/unparseable storage content below.
    if (parsed.version !== 4 || !Array.isArray(parsed.drafts) || parsed.drafts.length === 0)
      return defaultSketchDocument();
    const drafts = parsed.drafts.map((draft, index) => {
      const item = record(draft);
      const fallback = defaultSketchDocument().drafts[0]!;
      return {
        name: name(item.name, `draft${index + 1}`),
        viewport: {
          w: number(record(item.viewport).w, fallback.viewport.w, 1, 32),
          h: number(record(item.viewport).h, fallback.viewport.h, 1, 32),
        },
        root: node(item.root, fallback.root),
        variables: parseVariables(item.variables),
        ...(typeof item.sourceFile === "string" ? { sourceFile: item.sourceFile } : {}),
        ...(typeof item.sourceMtimeMs === "number" && Number.isFinite(item.sourceMtimeMs)
          ? { sourceMtimeMs: item.sourceMtimeMs }
          : {}),
        ...(typeof item.savedSnapshot === "string" ? { savedSnapshot: item.savedSnapshot } : {}),
      };
    });
    if (new Set(drafts.map((draft) => draft.name)).size !== drafts.length)
      return defaultSketchDocument();
    const allNames = flatten(
      drafts.find((draft) => draft.name === parsed.activeDraft)?.root ?? drafts[0]!.root,
    ).map((item) => item.name);
    return {
      version: 4,
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
/**
 * Names visible under a Tree search query: every node whose own name matches,
 * plus every ancestor on the path down to it (so the tree stays structurally
 * intact instead of collapsing to a flat list of hits). Empty query means
 * everything is visible.
 */
export function namesMatchingQuery(root: SketchNode, query: string): Set<string> {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return new Set(flatten(root).map((node) => node.name));
  const visible = new Set<string>();
  const walk = (node: SketchNode, ancestors: string[]) => {
    const path = [...ancestors, node.name];
    if (node.name.toLowerCase().includes(trimmed)) path.forEach((name) => visible.add(name));
    node.children.forEach((child) => walk(child, path));
  };
  walk(root, []);
  return visible;
}
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
const setHiddenDeep = (node: SketchNode, hidden: boolean): SketchNode => ({
  ...node,
  hidden,
  children: node.children.map((child) => setHiddenDeep(child, hidden)),
});
// The root (Viewpoint) itself has no Tree row or toggle button and always
// renders regardless of `hidden`, so it's left untouched — only its
// children (the actual hideable items) get the flag.
export const setAllHidden = (root: SketchNode, hidden: boolean): SketchNode => ({
  ...root,
  children: root.children.map((child) => setHiddenDeep(child, hidden)),
});
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
/**
 * Moves `target` to `newIndex` within its own sibling list (clamped to
 * bounds) — same-level reordering only, never changes which parent it
 * belongs to. `newIndex` is the position among the *other* siblings after
 * `target` is removed (i.e. drop-target semantics, not "swap with").
 */
export const reorderSibling = (root: SketchNode, target: string, newIndex: number): SketchNode => {
  const index = root.children.findIndex((child) => child.name === target);
  if (index >= 0) {
    const children = [...root.children];
    const [moved] = children.splice(index, 1);
    if (!moved) return root;
    children.splice(Math.max(0, Math.min(newIndex, children.length)), 0, moved);
    return { ...root, children };
  }
  return {
    ...root,
    children: root.children.map((child) => reorderSibling(child, target, newIndex)),
  };
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
  // Only names change (root name gets a unique suffix, descendant names are
  // rewritten by substituting the old prefix for the new one so uniqueness
  // holds tree-wide) — every other field, including raw expressions that
  // reference variables, is carried over untouched by the `...node` spread.
  const copy = (node: SketchNode, sourceParent?: string, copyParent?: string): SketchNode => {
    const base =
      sourceParent && copyParent && node.name.startsWith(sourceParent)
        ? `${copyParent}${node.name.slice(sourceParent.length)}`
        : node.name;
    const name = nextName(base);
    return { ...node, name, children: node.children.map((child) => copy(child, node.name, name)) };
  };
  return copy(source);
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

// Only digits, a decimal point, `$name` variable references, `+ - * / ( )`,
// and whitespace may appear — anything else (including any JS syntax beyond
// plain arithmetic) is rejected before the string ever reaches `Function`.
const EXPRESSION_PATTERN = /^(?:\s|\d+(?:\.\d*)?|\.\d+|\$[A-Za-z0-9_]+|[+\-*/()])*$/;
const VARIABLE_REFERENCE_PATTERN = /\$([A-Za-z0-9_]+)/g;

/**
 * Bare numbers, `$name` references, and full arithmetic expressions
 * combining both (`+ - * /`, parentheses, unary +/-) all resolve to a plain
 * ratio of the parent — not a 0-100 percentage (despite the name, kept as-is
 * to avoid a purely mechanical rename churning every call site — see
 * `table-layout-lab-plan.md`'s "变量及属性支持表达式" entry for the full
 * scale-change writeup). `1/2` is just ordinary division (0.5), not a
 * special-cased fraction shorthand: since the whole tool's unit changed
 * from 0-100 to 0-1, plain division already produces the intended value
 * with no special-casing needed.
 *
 * `$name` references are resolved to plain numbers by `resolveVar` first
 * (recursively, with cycle detection via `seen` — a cycle anywhere in the
 * expression tree, not just a single `$a`→`$b`→`$a` chain, resolves to
 * `undefined` instead of infinitely recursing) — the actual arithmetic
 * combination is then delegated to `new Function` rather than a hand-rolled
 * parser: every caller of this module is a local developer working against
 * their own browser, this tool is entirely excluded from the production
 * bundle (gated behind `import.meta.env.DEV` in router.tsx — verified empty
 * in the built output), and the whitelist above means `Function` only ever
 * evaluates plain arithmetic over already-resolved numbers, never sees the
 * original `$name` syntax or anything else.
 */
function evaluateExpression(
  source: string,
  resolveVar: (name: string, seen: Set<string>) => number | undefined,
  seen: Set<string>,
): number | undefined {
  const trimmed = source.trim();
  if (trimmed === "" || !EXPRESSION_PATTERN.test(trimmed)) return undefined;
  const names = new Set(
    [...trimmed.matchAll(VARIABLE_REFERENCE_PATTERN)].map((match) => match[1]!),
  );
  const vars: Record<string, number> = {};
  for (const name of names) {
    const value = resolveVar(name, seen);
    if (value === undefined) return undefined;
    vars[name] = value;
  }
  const jsExpression = trimmed.replace(
    VARIABLE_REFERENCE_PATTERN,
    (_match, name: string) => `vars[${JSON.stringify(name)}]`,
  );
  try {
    const evaluate = new Function("vars", `"use strict"; return (${jsExpression});`) as (
      vars: Record<string, number>,
    ) => unknown;
    const result = evaluate(vars);
    return typeof result === "number" && Number.isFinite(result) ? roundRatio(result) : undefined;
  } catch {
    return undefined;
  }
}

export function parsePercentage(value: string): number | undefined {
  return evaluateExpression(value, () => undefined, new Set());
}

export const resolvePercentage = (raw: string, minimum = 0): SketchPercentage | undefined => {
  const resolved = parsePercentage(raw);
  return resolved !== undefined && resolved >= minimum
    ? { raw: normalizeRawExpression(raw), resolved }
    : undefined;
};

export function resolveVariablePercentage(raw: string, variables: SketchVariable[], minimum = 0) {
  const lookup = new Map(variables.map((variable) => [variable.name, variable.value]));
  const resolveVar = (name: string, seen: Set<string>): number | undefined => {
    if (seen.has(name)) return undefined;
    const value = lookup.get(name);
    return value === undefined
      ? undefined
      : evaluateExpression(value, resolveVar, new Set([...seen, name]));
  };
  const resolved = evaluateExpression(raw, resolveVar, new Set());
  return resolved !== undefined && resolved >= minimum
    ? { raw: normalizeRawExpression(raw), resolved }
    : undefined;
}

export type SketchGridDefinition = { rows: SketchPercentage[]; columns: SketchPercentage[] };
const gridAxes = (source: string) => {
  const match = /^\s*\(([^()]*)\)\s*\(([^()]*)\)\s*$/.exec(source);
  return match
    ? [match[1]!.trim().split(/\s+/).filter(Boolean), match[2]!.trim().split(/\s+/).filter(Boolean)]
    : undefined;
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
    const fixed = tokens.map((token) => (token === "*" ? undefined : resolve(token, 0.001)));
    if (tokens.length === 0 || fixed.some((value, index) => tokens[index] !== "*" && !value))
      return undefined;
    const fixedTotal = fixed.reduce((sum, value) => sum + (value?.resolved ?? 0), 0);
    if (stars === 0)
      return Math.abs(fixedTotal - 1) < 1e-6 ? (fixed as SketchPercentage[]) : undefined;
    const auto = (1 - fixedTotal) / stars;
    if (auto < 0.001) return undefined;
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
  hidden = false,
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
    hidden,
    children,
  };
};

// A cell slot is identified by name (`<grid>-r<row>c<col>`), not by kind — a
// cell converted into its own nested grid (kind "grid") is still one of its
// parent grid's slots, not a free child, even though it no longer has kind
// "gridCell". Used both to reconcile a grid's children on template changes
// (applyGridTemplate) and to group the Tree panel's display the same way.
export const isGridCellSlotName = (gridName: string, childName: string) =>
  new RegExp(`^${gridName}-r\\d+c\\d+$`).test(childName);

export function applyGridTemplate(
  grid: SketchNode,
  raw: string,
  resolve?: (raw: string, minimum: number) => SketchPercentage | undefined,
): SketchNode | undefined {
  const definition = parseGridTemplate(raw, resolve);
  const formatted = formatGridTemplate(raw);
  if (!definition || !formatted) return undefined;
  // Free children are whatever doesn't match the naming scheme for the
  // *current* template (row/column counts can shrink between edits,
  // orphaning some cell names into free children, which is intentional —
  // it's how a shrunk grid hands content back instead of deleting it).
  const existingCells = new Map(
    grid.children
      .filter((child) => isGridCellSlotName(grid.name, child.name))
      .map((child) => [child.name, child]),
  );
  const freeChildren = grid.children.filter((child) => !isGridCellSlotName(grid.name, child.name));
  return {
    ...grid,
    kind: "grid",
    grid: { raw: formatted },
    children: [
      ...definition.rows.flatMap((_, row) =>
        definition.columns.map((_, column) => {
          const name = `${grid.name}-r${row + 1}c${column + 1}`;
          const existing = existingCells.get(name);
          if (existing?.kind === "grid") {
            // Preserve a nested grid's own kind/template/children — only
            // reposition it to track this regenerated outer cell's slot.
            const y = definition.rows.slice(0, row).reduce((sum, value) => sum + value.resolved, 0);
            const x = definition.columns
              .slice(0, column)
              .reduce((sum, value) => sum + value.resolved, 0);
            return {
              ...existing,
              x: { raw: String(x), resolved: x },
              y: { raw: String(y), resolved: y },
              w: definition.columns[column]!,
              h: definition.rows[row]!,
            };
          }
          return gridCell(
            grid,
            row,
            column,
            definition,
            existing?.children ?? [],
            existing?.shadow ?? true,
            existing?.hidden ?? false,
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

// The one place that converts the Lab's internal 0-1 ratios back to the
// 0-100 percentages production Zones already expect (see importZone's
// matching /100 at the other end) — production rendering code never has to
// know the Lab's own scale changed.
// Rounded to 6 decimal places (of a 0-100 percentage, so ~1e-8 of the
// parent) — plain float arithmetic on the *100 conversion hits binary-
// representation noise even for "nice" inputs (e.g. 0.55 * 100 =
// 55.00000000000001), and this is the one boundary whose output gets
// checked into the repo as production LayoutPreset JSON.
const roundExportedPercentage = (value: number) => Math.round(value * 1e6) / 1e6;

const exportZone = (node: SketchNode): Zone => {
  const children = exportChildren(node);
  const centerX = node.centerX?.resolved ?? node.x.resolved + node.w.resolved / 2;
  const centerY = node.centerY?.resolved ?? node.y.resolved + node.h.resolved / 2;
  return {
    id: node.name,
    anchorCenter: {
      x: roundExportedPercentage(centerX * 100),
      y: roundExportedPercentage(centerY * 100),
    },
    localSize: {
      w: roundExportedPercentage(node.w.resolved * 100),
      h: roundExportedPercentage(node.h.resolved * 100),
    },
    rotationDeg: node.rotationDeg ?? 0,
    ...(children.length > 0 ? { children } : {}),
  };
};

/** Exports resolved geometry only; empty Grid-cell placeholders are omitted. */
export const exportSketchDraft = (draft: SketchDraft): LayoutPreset => ({
  name: draft.name,
  referenceCanvas: { ...draft.viewport },
  root: {
    id: draft.root.name,
    anchorCenter: { x: 50, y: 50 },
    localSize: { w: 100, h: 100 },
    rotationDeg: 0,
    ...(exportChildren(draft.root).length > 0 ? { children: exportChildren(draft.root) } : {}),
  },
  editor: { version: 2, root: draft.root, variables: draft.variables },
});
