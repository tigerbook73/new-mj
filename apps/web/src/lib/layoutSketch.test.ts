import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { desktopTableLayout } from "@/features/mahjong/desktop.table-config";
import type { Zone } from "@/shared/lib/layoutPreset";
import {
  addChild,
  applyGridTemplate,
  formatGridTemplate,
  gridTemplatesEqual,
  moveSibling,
  childName,
  copyNodeWithUniqueNames,
  defaultSketchDocument,
  exportSketchDraft,
  parseLayoutPresetJson,
  parsePercentage,
  namesMatchingQuery,
  parseGridTemplate,
  readSketchDocument,
  reorderSibling,
  resolvePercentage,
  resolveVariablePercentage,
  setAllHidden,
} from "./layoutSketch";

const expectZonesToMatch = (actual: Zone, expected: Zone) => {
  expect(actual.id).toBe(expected.id);
  expect(actual.anchorCenter.x).toBeCloseTo(expected.anchorCenter.x, 10);
  expect(actual.anchorCenter.y).toBeCloseTo(expected.anchorCenter.y, 10);
  expect(actual.localSize.w).toBeCloseTo(expected.localSize.w, 10);
  expect(actual.localSize.h).toBeCloseTo(expected.localSize.h, 10);
  expect(actual.rotationDeg).toBe(expected.rotationDeg);
  expect(actual.children?.length ?? 0).toBe(expected.children?.length ?? 0);
  actual.children?.forEach((child, index) => expectZonesToMatch(child, expected.children![index]!));
};

describe("layout sketch document", () => {
  it("imports the checked-in desktop production layout JSON", () => {
    const source = readFileSync(
      new URL("../layouts/desktop.table-layout.json", import.meta.url),
      "utf8",
    );
    const imported = parseLayoutPresetJson(source);
    expect(imported.name).toBe(desktopTableLayout.name);
    expect(imported.referenceCanvas).toEqual(desktopTableLayout.referenceCanvas);
    expectZonesToMatch(imported.root, desktopTableLayout.root);
  });

  it("validates imported LayoutPreset JSON before creating a draft", () => {
    expect(
      parseLayoutPresetJson(
        JSON.stringify({
          name: "imported",
          referenceCanvas: { w: 1, h: 1 },
          root: {
            id: "viewport",
            anchorCenter: { x: 50, y: 50 },
            localSize: { w: 100, h: 100 },
            rotationDeg: 0,
            children: [],
          },
        }),
      ).root.id,
    ).toBe("viewport");
    expect(() => parseLayoutPresetJson('{"name":"bad"}')).toThrow("referenceCanvas.w");
  });
  it("creates names that are unique across a draft and appends children", () => {
    const root = defaultSketchDocument().drafts[0]!.root;
    expect(childName(root, "viewport")).toBe("L1B");
    expect(childName(root, "L1A")).toBe("L1A-1");
    expect(
      addChild(root, "L1A", {
        name: "L1A-1",
        x: { raw: "0", resolved: 0 },
        y: { raw: "0", resolved: 0 },
        w: { raw: "0.1", resolved: 0.1 },
        h: { raw: "0.1", resolved: 0.1 },
        kind: "element",
        backgroundColor: "#fde2e4",
        children: [],
      }).children[0]!.children[0]!.name,
    ).toBe("L1A-1");
  });

  it("keeps a matched node's ancestor chain visible under a search query", () => {
    const root = addChild(defaultSketchDocument().drafts[0]!.root, "L1A", {
      name: "L1A-1",
      x: { raw: "0", resolved: 0 },
      y: { raw: "0", resolved: 0 },
      w: { raw: "0.1", resolved: 0.1 },
      h: { raw: "0.1", resolved: 0.1 },
      kind: "element",
      backgroundColor: "#fde2e4",
      children: [],
    });
    // "L1A-1" matches directly; its ancestor "L1A" must stay visible too,
    // even though "L1A" itself doesn't match "-1".
    const visible = namesMatchingQuery(root, "-1");
    expect(visible.has("L1A-1")).toBe(true);
    expect(visible.has("L1A")).toBe(true);
    expect(namesMatchingQuery(root, "nonexistent").size).toBe(0);
    expect(namesMatchingQuery(root, "").has("L1A-1")).toBe(true);
  });

  it("moves a node only within its current sibling list", () => {
    const root = defaultSketchDocument().drafts[0]!.root;
    const withSibling = addChild(root, "viewport", {
      ...root.children[0]!,
      name: "L1B",
      children: [],
    });
    expect(moveSibling(withSibling, "L1B", -1).children.map((node) => node.name)).toEqual([
      "L1B",
      "L1A",
    ]);
    expect(moveSibling(withSibling, "L1A", -1)).toBe(withSibling);
  });

  it("reorders a node to an arbitrary index within its sibling list", () => {
    const root = defaultSketchDocument().drafts[0]!.root;
    const withSiblings = [
      { ...root.children[0]!, name: "L1B", children: [] },
      { ...root.children[0]!, name: "L1C", children: [] },
    ].reduce((acc, child) => addChild(acc, "viewport", child), root);
    expect(reorderSibling(withSiblings, "L1C", 0).children.map((node) => node.name)).toEqual([
      "L1C",
      "L1A",
      "L1B",
    ]);
    // Index is a drop position among the *other* siblings (post-removal),
    // not a swap — moving the first item to index 1 lands it after L1B.
    expect(reorderSibling(withSiblings, "L1A", 1).children.map((node) => node.name)).toEqual([
      "L1B",
      "L1A",
      "L1C",
    ]);
    // Out-of-range indices clamp instead of throwing.
    expect(reorderSibling(withSiblings, "L1A", 99).children.map((node) => node.name)).toEqual([
      "L1B",
      "L1C",
      "L1A",
    ]);
  });

  it("copies an element subtree with unique names", () => {
    const root = addChild(defaultSketchDocument().drafts[0]!.root, "L1A", {
      name: "L1A-1",
      x: { raw: "0", resolved: 0 },
      y: { raw: "0", resolved: 0 },
      w: { raw: "0.1", resolved: 0.1 },
      h: { raw: "0.1", resolved: 0.1 },
      kind: "element",
      backgroundColor: "#fde2e4",
      children: [],
    });
    const copy = copyNodeWithUniqueNames(root, "L1A")!;
    expect(copy.name).toBe("L1A1");
    // Only the name changes — position/size are carried over verbatim.
    expect(copy.x).toEqual({ raw: "0.1", resolved: 0.1 });
    expect(copy.y).toEqual({ raw: "0.1", resolved: 0.1 });
    expect(copy.children[0]?.name).toBe("L1A1-1");
  });

  it("preserves a raw variable-reference expression untouched when copying", () => {
    const withVarX = {
      ...defaultSketchDocument().drafts[0]!.root,
      children: [
        {
          ...defaultSketchDocument().drafts[0]!.root.children[0]!,
          name: "L1A",
          x: { raw: "$margin + 0.1", resolved: 0.2 },
        },
      ],
    };
    const copy = copyNodeWithUniqueNames(withVarX, "L1A")!;
    expect(copy.x).toEqual({ raw: "$margin + 0.1", resolved: 0.2 });
  });

  it("falls back safely for malformed stored documents", () => {
    expect(readSketchDocument({ getItem: () => "{bad" })).toMatchObject({
      version: 4,
      activeDraft: "draft1",
      selectedName: "L1A",
      drafts: [{ name: "draft1", root: { name: "viewport" } }],
    });
  });

  it("resets to the default draft for an unrecognized document version", () => {
    // Versions 1 and 2 both predate the 0-100-percentage -> 0-1-ratio scale
    // change (see parsePercentage's docs) and are deliberately not migrated
    // — reinterpreting their raw numbers under the new scale without
    // rescaling them would silently produce zones 100x too large; version 3
    // predates moving `variables` from document-level to per-draft. All are
    // treated the same as any other unparseable storage content: reset to a
    // blank default draft.
    const stored = JSON.stringify({
      version: 2,
      drafts: [
        {
          name: "draft1",
          viewport: { w: 16, h: 9 },
          root: {
            name: "viewport",
            x: { raw: "0", resolved: 0 },
            y: { raw: "0", resolved: 0 },
            w: { raw: "100", resolved: 100 },
            h: { raw: "100", resolved: 100 },
            children: [],
          },
        },
      ],
      activeDraft: "draft1",
      selectedName: "viewport",
    });
    expect(readSketchDocument({ getItem: () => stored })).toMatchObject({
      version: 4,
      activeDraft: "draft1",
      selectedName: "L1A",
    });
  });

  it("evaluates bare numbers, division, and out-of-grammar or invalid arithmetic", () => {
    expect(parsePercentage("0.5")).toBe(0.5);
    expect(parsePercentage("1/2")).toBe(0.5);
    expect(parsePercentage(".25")).toBe(0.25);
    expect(parsePercentage("1")).toBe(1);
    // No upper bound — a value over 1 (over 100% once exported) is a
    // legitimate real-world layout, not something to reject.
    expect(parsePercentage("1.5")).toBe(1.5);
    expect(parsePercentage("1/0")).toBeUndefined();
    expect(parsePercentage("")).toBeUndefined();
    expect(parsePercentage("1 2")).toBeUndefined();
    // Whitelisted-character check runs before anything reaches `Function` —
    // arbitrary JS (property access, function calls, ...) is rejected
    // outright rather than merely failing to look like a number.
    expect(parsePercentage("alert(1)")).toBeUndefined();
    expect(parsePercentage("window")).toBeUndefined();
  });

  it("evaluates arithmetic expressions combining literals, operators, and parentheses", () => {
    expect(parsePercentage("0.2 + 0.3")).toBeCloseTo(0.5);
    expect(parsePercentage("(0.1 + 0.4) * 2")).toBeCloseTo(1);
    expect(parsePercentage("1 - 0.25 * 2")).toBeCloseTo(0.5);
    expect(parsePercentage("-0.5 + 1")).toBeCloseTo(0.5);
  });

  it("resolves $name references embedded in larger expressions, recursively and with cycle detection", () => {
    const variables = [
      { name: "half", value: "1/2" },
      { name: "quarter", value: "$half" },
    ];
    expect(resolveVariablePercentage("$quarter", variables)).toEqual({
      raw: "$quarter",
      resolved: 0.5,
    });
    expect(resolveVariablePercentage("$half * 2", variables)).toEqual({
      raw: "$half * 2",
      resolved: 1,
    });
    expect(resolveVariablePercentage("$missing", variables)).toBeUndefined();
    expect(
      resolveVariablePercentage("$first", [
        { name: "first", value: "$second" },
        { name: "second", value: "$first" },
      ]),
    ).toBeUndefined();
    // A cycle through a larger expression (not just a bare $a -> $b -> $a
    // chain) must also be caught, not just infinitely recurse.
    expect(
      resolveVariablePercentage("$a + 1", [
        { name: "a", value: "$b + 0.1" },
        { name: "b", value: "$a + 0.1" },
      ]),
    ).toBeUndefined();
    // Sibling references within one expression don't share a "seen" chain
    // with each other — only an actual cycle along one path is rejected.
    expect(
      resolveVariablePercentage("$a + $b", [
        { name: "a", value: "0.2" },
        { name: "b", value: "0.3" },
      ]),
    ).toEqual({ raw: "$a + $b", resolved: 0.5 });
  });

  it("normalizes whitespace in the stored raw expression without reformatting it otherwise", () => {
    expect(resolvePercentage("  0.5  ")).toEqual({ raw: "0.5", resolved: 0.5 });
    expect(resolveVariablePercentage("  $a   +   1  ", [{ name: "a", value: "0.2" }])).toEqual({
      raw: "$a + 1",
      resolved: 1.2,
    });
  });

  it("resolves variables recursively when loading a persisted document", () => {
    const variables = [{ name: "half", value: "1/2" }];
    const stored = JSON.stringify({
      version: 4,
      drafts: [
        {
          name: "draft1",
          viewport: { w: 16, h: 9 },
          root: {
            name: "viewport",
            x: 0,
            y: 0,
            w: 1,
            h: 1,
            children: [
              {
                name: "L1A",
                x: { raw: "$half", resolved: 0.5 },
                y: 0,
                w: 0.3,
                h: 0.2,
                children: [],
              },
            ],
          },
          variables,
        },
      ],
      activeDraft: "draft1",
      selectedName: "L1A",
    });
    const document = readSketchDocument({ getItem: () => stored });
    expect(document.drafts[0]!.variables).toEqual(variables);
    expect(document.drafts[0]!.root.children[0]!.x).toEqual({ raw: "$half", resolved: 0.5 });
  });

  it("parses each draft's variables independently, without leaking into other drafts", () => {
    const stored = JSON.stringify({
      version: 4,
      drafts: [
        {
          name: "draft1",
          viewport: { w: 16, h: 9 },
          root: { name: "viewport", x: 0, y: 0, w: 1, h: 1, children: [] },
          variables: [{ name: "margin", value: "0.1" }],
        },
        {
          name: "draft2",
          viewport: { w: 16, h: 9 },
          root: { name: "viewport", x: 0, y: 0, w: 1, h: 1, children: [] },
          variables: [{ name: "margin", value: "0.2" }],
        },
      ],
      activeDraft: "draft1",
      selectedName: "viewport",
    });
    const document = readSketchDocument({ getItem: () => stored });
    expect(document.drafts[0]!.variables).toEqual([{ name: "margin", value: "0.1" }]);
    expect(document.drafts[1]!.variables).toEqual([{ name: "margin", value: "0.2" }]);
  });

  it("derives protected grid cells from a valid row and column definition", () => {
    const grid = applyGridTemplate(
      defaultSketchDocument().drafts[0]!.root.children[0]!,
      "(1/3 2/3)(0.5 0.5)",
    );
    expect(grid).toMatchObject({ kind: "grid", grid: { raw: "(1/3 2/3)(0.5 0.5)" } });
    expect(grid?.children).toHaveLength(4);
    expect(grid?.children[3]).toMatchObject({
      name: "L1A-r2c2",
      kind: "gridCell",
      shadow: true,
    });
    expect(grid?.children[3]?.x.resolved).toBeCloseTo(1 / 3);
    expect(grid?.children[3]?.y.resolved).toBe(0.5);
    expect(grid?.children[3]?.w.resolved).toBeCloseTo(2 / 3);
    expect(grid?.children[3]?.h.resolved).toBe(0.5);
    expect(
      applyGridTemplate(defaultSketchDocument().drafts[0]!.root.children[0]!, "(0.4 0.4)(1)"),
    ).toBeUndefined();
  });

  it("splits an axis remainder evenly across automatic star tracks", () => {
    const grid = applyGridTemplate(
      defaultSketchDocument().drafts[0]!.root.children[0]!,
      "(* *)(0.25 *)",
    );
    expect(grid?.children).toHaveLength(4);
    expect(grid?.children[0]?.h).toEqual({ raw: "0.25", resolved: 0.25 });
    expect(grid?.children[2]?.h).toEqual({ raw: "*", resolved: 0.75 });
    expect(grid?.children[0]?.w).toEqual({ raw: "*", resolved: 0.5 });
    expect(
      applyGridTemplate(defaultSketchDocument().drafts[0]!.root.children[0]!, "(1)(1 *)"),
    ).toBeUndefined();
  });

  it("uses variables in fixed grid tracks", () => {
    const resolve = (raw: string, minimum: number) =>
      resolveVariablePercentage(raw, [{ name: "half", value: "0.5" }], minimum);
    expect(parseGridTemplate("($half *)(1)", resolve)?.columns).toEqual([
      { raw: "$half", resolved: 0.5 },
      { raw: "*", resolved: 0.5 },
    ]);
  });

  it("keeps children of cells that remain after a grid update", () => {
    const source = defaultSketchDocument().drafts[0]!.root.children[0]!;
    const grid = applyGridTemplate(source, "(1)(1)")!;
    const withChild = addChild(grid, "L1A-r1c1", {
      name: "L1A-r1c1-1",
      x: { raw: "0.1", resolved: 0.1 },
      y: { raw: "0.1", resolved: 0.1 },
      w: { raw: "0.3", resolved: 0.3 },
      h: { raw: "0.2", resolved: 0.2 },
      kind: "element",
      backgroundColor: "#fde2e4",
      children: [],
    });
    expect(applyGridTemplate(withChild, "(0.5 0.5)(0.5 0.5)")?.children[0]?.children[0]?.name).toBe(
      "L1A-r1c1-1",
    );
  });

  it("keeps free children of a grid when its template changes", () => {
    const source = applyGridTemplate(
      defaultSketchDocument().drafts[0]!.root.children[0]!,
      "(1)(1)",
    )!;
    const withFreeChild = addChild(source, "L1A", {
      name: "L1A-free",
      x: { raw: "0.1", resolved: 0.1 },
      y: { raw: "0.1", resolved: 0.1 },
      w: { raw: "0.3", resolved: 0.3 },
      h: { raw: "0.2", resolved: 0.2 },
      kind: "element",
      shadow: false,
      backgroundColor: "#fde2e4",
      children: [],
    });
    const updated = applyGridTemplate(withFreeChild, "(0.5 0.5)(1)")!;
    expect(updated.children.filter((child) => child.kind === "gridCell")).toHaveLength(2);
    expect(updated.children.find((child) => child.name === "L1A-free")).toMatchObject({
      kind: "element",
      x: { resolved: 0.1 },
    });
  });

  it("preserves a grid cell's hidden flag when the template regenerates", () => {
    const grid = applyGridTemplate(defaultSketchDocument().drafts[0]!.root.children[0]!, "(1)(1)")!;
    const withHiddenCell = {
      ...grid,
      children: grid.children.map((cell) => ({ ...cell, hidden: true })),
    };
    // Regenerating to a 2-cell template keeps the surviving cell (L1A-r1c1)
    // hidden, while the newly created cell (L1A-r1c2) defaults to visible.
    const regenerated = applyGridTemplate(withHiddenCell, "(0.5 0.5)(1)")!;
    expect(regenerated.children.find((cell) => cell.name === "L1A-r1c1")?.hidden).toBe(true);
    expect(regenerated.children.find((cell) => cell.name === "L1A-r1c2")?.hidden).toBe(false);
  });

  it("hides only the targeted subtree, leaving the root (Viewpoint) itself untouched", () => {
    const root = defaultSketchDocument().drafts[0]!.root;
    const withChild = addChild(root, "L1A", {
      name: "L1A-1",
      x: { raw: "0", resolved: 0 },
      y: { raw: "0", resolved: 0 },
      w: { raw: "0.1", resolved: 0.1 },
      h: { raw: "0.1", resolved: 0.1 },
      kind: "element",
      backgroundColor: "#fde2e4",
      children: [],
    });
    const hidden = setAllHidden(withChild, true);
    expect(hidden.hidden).toBeUndefined();
    expect(hidden.children[0]?.hidden).toBe(true);
    expect(hidden.children[0]?.children[0]?.hidden).toBe(true);
    expect(setAllHidden(hidden, false).children[0]?.hidden).toBe(false);
  });

  it("converts a grid cell into its own nested grid", () => {
    const grid = applyGridTemplate(defaultSketchDocument().drafts[0]!.root.children[0]!, "(1)(1)")!;
    const cell = grid.children[0]!;
    expect(cell.kind).toBe("gridCell");
    const nested = applyGridTemplate(cell, "(0.5 0.5)(1)")!;
    expect(nested.kind).toBe("grid");
    expect(nested.children.map((child) => child.name)).toEqual([
      `${cell.name}-r1c1`,
      `${cell.name}-r1c2`,
    ]);
  });

  it("preserves a nested grid's own template and children when the outer grid regenerates", () => {
    const grid = applyGridTemplate(defaultSketchDocument().drafts[0]!.root.children[0]!, "(1)(1)")!;
    const nestedGrid = applyGridTemplate(grid.children[0]!, "(0.5 0.5)(1)")!;
    const nestedGridWithContent = addChild(nestedGrid, `${nestedGrid.name}-r1c1`, {
      name: `${nestedGrid.name}-r1c1-content`,
      x: { raw: "0.1", resolved: 0.1 },
      y: { raw: "0.1", resolved: 0.1 },
      w: { raw: "0.3", resolved: 0.3 },
      h: { raw: "0.2", resolved: 0.2 },
      kind: "element",
      backgroundColor: "#fde2e4",
      children: [],
    });
    const outerWithNested = { ...grid, children: [nestedGridWithContent] };
    // Regenerating the outer grid's own template (e.g. resizing its
    // tracks) must not blow away the nested grid living in one of its
    // cells — only that cell's position/size should change.
    const regenerated = applyGridTemplate(outerWithNested, "(0.5 0.5)(1)")!;
    const survivingNestedCell = regenerated.children.find(
      (child) => child.name === nestedGrid.name,
    );
    expect(survivingNestedCell?.kind).toBe("grid");
    expect(survivingNestedCell?.grid).toEqual({ raw: "(0.5 0.5)(1)" });
    expect(survivingNestedCell?.children.map((child) => child.name)).toEqual([
      `${nestedGrid.name}-r1c1`,
      `${nestedGrid.name}-r1c2`,
    ]);
    expect(
      survivingNestedCell?.children.find((child) => child.name === `${nestedGrid.name}-r1c1`)
        ?.children[0]?.name,
    ).toBe(`${nestedGrid.name}-r1c1-content`);
    expect(survivingNestedCell?.w).toEqual({ raw: "0.5", resolved: 0.5 });
  });

  it("treats whitespace-only grid edits as equivalent", () => {
    expect(gridTemplatesEqual("(50 50)(* *)", "( 50   50 ) ( *  * )")).toBe(true);
    expect(gridTemplatesEqual("(50 50)(* *)", "(50 *)(* *)")).toBe(false);
    expect(gridTemplatesEqual("(50 50)(* *)", "(25 75)(* *)")).toBe(false);
  });

  it("formats valid grid parameters consistently", () => {
    expect(formatGridTemplate(" ( 25   * )  ( *  * ) ")).toBe("(25 *)(* *)");
    expect(formatGridTemplate("invalid")).toBeUndefined();
  });

  it("omits empty grid-cell placeholders but exports cells with content", () => {
    const draft = defaultSketchDocument().drafts[0]!;
    const grid = applyGridTemplate(draft.root.children[0]!, "(0.5 0.5)(1)")!;
    const withChild = addChild(grid, "L1A-r1c2", {
      name: "content",
      x: { raw: "0.1", resolved: 0.1 },
      y: { raw: "0.2", resolved: 0.2 },
      w: { raw: "0.5", resolved: 0.5 },
      h: { raw: "0.6", resolved: 0.6 },
      kind: "element",
      backgroundColor: "#fde2e4",
      children: [],
    });
    const preset = exportSketchDraft({ ...draft, root: { ...draft.root, children: [withChild] } });
    // Exported anchorCenter/localSize stay on the production 0-100 scale
    // (exportSketchDraft multiplies the 0-1 internal ratios by 100) — these
    // numbers are unchanged from what this test asserted before the scale
    // change, since the inputs above were divided by 100 to compensate.
    expect(preset).toMatchObject({
      name: "draft1",
      referenceCanvas: { w: 16, h: 9 },
      root: {
        id: "viewport",
        children: [
          {
            id: "L1A",
            children: [
              {
                id: "L1A-r1c2",
                anchorCenter: { x: 75, y: 50 },
                localSize: { w: 50, h: 100 },
                children: [
                  {
                    id: "content",
                    anchorCenter: { x: 35, y: 50 },
                    localSize: { w: 50, h: 60 },
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    expect(JSON.stringify(preset.root)).toContain("L1A-r1c2");
    expect(JSON.stringify(preset.editor)).toContain("L1A-r1c2");
  });

  it("never exports the hidden flag into the production LayoutPreset root", () => {
    const draft = defaultSketchDocument().drafts[0]!;
    const hiddenChild = { ...draft.root.children[0]!, hidden: true };
    const preset = exportSketchDraft({
      ...draft,
      root: { ...draft.root, children: [hiddenChild] },
    });
    // Canvas-only: the hidden item still exports (visibility isn't
    // omission — see shouldExportZone), just without a "hidden" key.
    expect(JSON.stringify(preset.root)).not.toContain("hidden");
    // The editor round-trip payload is allowed to carry it (it's how the
    // Lab restores its own editing state, not production data).
    expect(JSON.stringify(preset.editor)).toContain('"hidden":true');
  });

  it("exports an explicitly promoted empty grid cell and preserves its mode across grid updates", () => {
    const draft = defaultSketchDocument().drafts[0]!;
    const grid = applyGridTemplate(draft.root.children[0]!, "(0.5 0.5)(1)")!;
    const promoted = {
      ...grid,
      children: grid.children.map((child, index) =>
        index === 0 ? { ...child, shadow: false } : child,
      ),
    };
    const updated = applyGridTemplate(promoted, "(0.5 0.5)(1)")!;
    expect(updated.children[0]?.shadow).toBe(false);
    const preset = exportSketchDraft({ ...draft, root: { ...draft.root, children: [updated] } });
    expect(preset.root.children?.[0]?.children?.map((zone) => zone.id)).toEqual(["L1A-r1c1"]);
  });

  it("exports a grid free child without exporting its empty shadow cells", () => {
    const draft = defaultSketchDocument().drafts[0]!;
    const grid = applyGridTemplate(draft.root.children[0]!, "(0.5 0.5)(1)")!;
    const withFreeChild = addChild(grid, "L1A", {
      name: "free",
      x: { raw: "0.2", resolved: 0.2 },
      y: { raw: "0.3", resolved: 0.3 },
      w: { raw: "0.4", resolved: 0.4 },
      h: { raw: "0.5", resolved: 0.5 },
      kind: "element",
      shadow: false,
      backgroundColor: "#fde2e4",
      children: [],
    });
    const preset = exportSketchDraft({
      ...draft,
      root: { ...draft.root, children: [withFreeChild] },
    });
    expect(preset.root.children?.[0]?.children).toMatchObject([
      {
        id: "free",
        anchorCenter: { x: 40, y: 55 },
        localSize: { w: 40, h: 50 },
      },
    ]);
    expect(JSON.stringify(preset.root)).not.toContain("L1A-r1c1");
    expect(JSON.stringify(preset.root)).not.toContain("L1A-r1c2");
  });

  it("preserves nested quarter-turn rotations in exported zones", () => {
    const draft = defaultSketchDocument().drafts[0]!;
    const rotated = {
      ...draft.root.children[0]!,
      rotationDeg: 90 as const,
      children: [
        {
          ...draft.root.children[0]!,
          name: "nested",
          rotationDeg: -90 as const,
          children: [],
        },
      ],
    };
    const preset = exportSketchDraft({ ...draft, root: { ...draft.root, children: [rotated] } });
    expect(preset.root.children?.[0]?.rotationDeg).toBe(90);
    expect(preset.root.children?.[0]?.children?.[0]?.rotationDeg).toBe(-90);
  });
});
