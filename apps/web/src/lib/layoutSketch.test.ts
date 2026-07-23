import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DESKTOP_TABLE_PRESET } from "./desktopTablePreset";
import type { Zone } from "./layoutPreset";
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
  parseGridTemplate,
  readSketchDocument,
  resolvePercentage,
  resolveVariablePercentage,
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
    expect(imported.name).toBe(DESKTOP_TABLE_PRESET.name);
    expect(imported.referenceCanvas).toEqual(DESKTOP_TABLE_PRESET.referenceCanvas);
    expectZonesToMatch(imported.root, DESKTOP_TABLE_PRESET.root);
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
        w: { raw: "10", resolved: 10 },
        h: { raw: "10", resolved: 10 },
        kind: "element",
        backgroundColor: "#fde2e4",
        children: [],
      }).children[0]!.children[0]!.name,
    ).toBe("L1A-1");
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

  it("copies an element subtree with unique names", () => {
    const root = addChild(defaultSketchDocument().drafts[0]!.root, "L1A", {
      name: "L1A-1",
      x: { raw: "0", resolved: 0 },
      y: { raw: "0", resolved: 0 },
      w: { raw: "10", resolved: 10 },
      h: { raw: "10", resolved: 10 },
      kind: "element",
      backgroundColor: "#fde2e4",
      children: [],
    });
    const copy = copyNodeWithUniqueNames(root, "L1A")!;
    expect(copy.name).toBe("L1A1");
    expect(copy.x).toEqual({ raw: "20", resolved: 20 });
    expect(copy.y).toEqual({ raw: "20", resolved: 20 });
    expect(copy.children[0]?.name).toBe("L1A1-1");
  });

  it("falls back safely for malformed stored documents", () => {
    expect(readSketchDocument({ getItem: () => "{bad" })).toMatchObject({
      version: 2,
      activeDraft: "draft1",
      selectedName: "L1A",
      drafts: [{ name: "draft1", root: { name: "viewport" } }],
    });
  });

  it("accepts fractions and normalized decimals as parent-relative percentages", () => {
    expect(parsePercentage("1/2")).toBe(50);
    expect(parsePercentage(".25")).toBe(25);
    expect(parsePercentage("1")).toBe(100);
    expect(parsePercentage("0.99999999")).toBe(100);
    expect(parsePercentage("3/2")).toBeUndefined();
    expect(parsePercentage("1/0")).toBeUndefined();
  });

  it("migrates numeric geometry and retains valid raw expressions", () => {
    const stored = JSON.stringify({
      version: 1,
      drafts: [
        {
          name: "draft1",
          viewport: { w: 16, h: 9 },
          root: {
            name: "viewport",
            x: 0,
            y: 0,
            w: 100,
            h: 100,
            children: [
              {
                name: "L1A",
                x: "invalid",
                y: { raw: "1/2", resolved: 0 },
                w: { raw: "30", resolved: 30 },
                h: { raw: "20", resolved: 20 },
                children: [],
              },
            ],
          },
        },
      ],
      activeDraft: "draft1",
      selectedName: "L1A",
    });
    const node = readSketchDocument({ getItem: () => stored }).drafts[0]!.root.children[0]!;
    expect(node.x).toEqual({ raw: "0", resolved: 0 });
    expect(node.y).toEqual({ raw: "1/2", resolved: 50 });
    expect(resolvePercentage("1/3")?.raw).toBe("1/3");
    expect(resolvePercentage("1/3")?.resolved).toBeCloseTo(100 / 3);
  });

  it("migrates v1 grid axes so existing drafts retain their geometry", () => {
    const stored = JSON.stringify({
      version: 1,
      drafts: [
        {
          name: "draft1",
          viewport: { w: 16, h: 9 },
          root: {
            name: "viewport",
            x: 0,
            y: 0,
            w: 100,
            h: 100,
            children: [
              {
                name: "L1A",
                x: 0,
                y: 0,
                w: 100,
                h: 100,
                kind: "grid",
                grid: { raw: "(25 75)(100)" },
                children: [],
              },
            ],
          },
        },
      ],
      activeDraft: "draft1",
      selectedName: "L1A",
    });
    const grid = readSketchDocument({ getItem: () => stored }).drafts[0]!.root.children[0]!;
    expect(grid.grid?.raw).toBe("(100)(25 75)");
    expect(grid.children[1]?.h.resolved).toBe(75);
  });

  it("resolves variables recursively and retains persisted expression geometry", () => {
    const variables = [
      { name: "half", value: "1/2" },
      { name: "quarter", value: "$half" },
    ];
    expect(resolveVariablePercentage("$quarter", variables)).toEqual({
      raw: "$quarter",
      resolved: 50,
    });
    expect(resolveVariablePercentage("$missing", variables)).toBeUndefined();
    expect(
      resolveVariablePercentage("$first", [
        { name: "first", value: "$second" },
        { name: "second", value: "$first" },
      ]),
    ).toBeUndefined();

    const stored = JSON.stringify({
      version: 1,
      drafts: [
        {
          name: "draft1",
          viewport: { w: 16, h: 9 },
          root: {
            name: "viewport",
            x: 0,
            y: 0,
            w: 100,
            h: 100,
            children: [
              {
                name: "L1A",
                x: { raw: "$half", resolved: 50 },
                y: 0,
                w: 30,
                h: 20,
                children: [],
              },
            ],
          },
        },
      ],
      activeDraft: "draft1",
      selectedName: "L1A",
      variables,
    });
    const document = readSketchDocument({ getItem: () => stored });
    expect(document.variables).toEqual(variables);
    expect(document.drafts[0]!.root.children[0]!.x).toEqual({ raw: "$half", resolved: 50 });
  });

  it("derives protected grid cells from a valid row and column definition", () => {
    const grid = applyGridTemplate(
      defaultSketchDocument().drafts[0]!.root.children[0]!,
      "(1/3 2/3)(50 50)",
    );
    expect(grid).toMatchObject({ kind: "grid", grid: { raw: "(1/3 2/3)(50 50)" } });
    expect(grid?.children).toHaveLength(4);
    expect(grid?.children[3]).toMatchObject({
      name: "L1A-r2c2",
      kind: "gridCell",
      shadow: true,
    });
    expect(grid?.children[3]?.x.resolved).toBeCloseTo(100 / 3);
    expect(grid?.children[3]?.y.resolved).toBe(50);
    expect(grid?.children[3]?.w.resolved).toBeCloseTo(200 / 3);
    expect(grid?.children[3]?.h.resolved).toBe(50);
    expect(
      applyGridTemplate(defaultSketchDocument().drafts[0]!.root.children[0]!, "(40 40)(100)"),
    ).toBeUndefined();
  });

  it("splits an axis remainder evenly across automatic star tracks", () => {
    const grid = applyGridTemplate(
      defaultSketchDocument().drafts[0]!.root.children[0]!,
      "(* *)(25 *)",
    );
    expect(grid?.children).toHaveLength(4);
    expect(grid?.children[0]?.h).toEqual({ raw: "25", resolved: 25 });
    expect(grid?.children[2]?.h).toEqual({ raw: "*", resolved: 75 });
    expect(grid?.children[0]?.w).toEqual({ raw: "*", resolved: 50 });
    expect(
      applyGridTemplate(defaultSketchDocument().drafts[0]!.root.children[0]!, "(100)(100 *)"),
    ).toBeUndefined();
  });

  it("uses variables in fixed grid tracks", () => {
    const resolve = (raw: string, minimum: number) =>
      resolveVariablePercentage(raw, [{ name: "half", value: "50" }], minimum);
    expect(parseGridTemplate("($half *)(100)", resolve)?.columns).toEqual([
      { raw: "$half", resolved: 50 },
      { raw: "*", resolved: 50 },
    ]);
  });

  it("keeps children of cells that remain after a grid update", () => {
    const source = defaultSketchDocument().drafts[0]!.root.children[0]!;
    const grid = applyGridTemplate(source, "(100)(100)")!;
    const withChild = addChild(grid, "L1A-r1c1", {
      name: "L1A-r1c1-1",
      x: { raw: "10", resolved: 10 },
      y: { raw: "10", resolved: 10 },
      w: { raw: "30", resolved: 30 },
      h: { raw: "20", resolved: 20 },
      kind: "element",
      backgroundColor: "#fde2e4",
      children: [],
    });
    expect(applyGridTemplate(withChild, "(50 50)(50 50)")?.children[0]?.children[0]?.name).toBe(
      "L1A-r1c1-1",
    );
  });

  it("keeps free children of a grid when its template changes", () => {
    const source = applyGridTemplate(
      defaultSketchDocument().drafts[0]!.root.children[0]!,
      "(100)(100)",
    )!;
    const withFreeChild = addChild(source, "L1A", {
      name: "L1A-free",
      x: { raw: "10", resolved: 10 },
      y: { raw: "10", resolved: 10 },
      w: { raw: "30", resolved: 30 },
      h: { raw: "20", resolved: 20 },
      kind: "element",
      shadow: false,
      backgroundColor: "#fde2e4",
      children: [],
    });
    const updated = applyGridTemplate(withFreeChild, "(50 50)(100)")!;
    expect(updated.children.filter((child) => child.kind === "gridCell")).toHaveLength(2);
    expect(updated.children.find((child) => child.name === "L1A-free")).toMatchObject({
      kind: "element",
      x: { resolved: 10 },
    });
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
    const grid = applyGridTemplate(draft.root.children[0]!, "(50 50)(100)")!;
    const withChild = addChild(grid, "L1A-r1c2", {
      name: "content",
      x: { raw: "10", resolved: 10 },
      y: { raw: "20", resolved: 20 },
      w: { raw: "50", resolved: 50 },
      h: { raw: "60", resolved: 60 },
      kind: "element",
      backgroundColor: "#fde2e4",
      children: [],
    });
    const preset = exportSketchDraft({ ...draft, root: { ...draft.root, children: [withChild] } });
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

  it("exports an explicitly promoted empty grid cell and preserves its mode across grid updates", () => {
    const draft = defaultSketchDocument().drafts[0]!;
    const grid = applyGridTemplate(draft.root.children[0]!, "(50 50)(100)")!;
    const promoted = {
      ...grid,
      children: grid.children.map((child, index) =>
        index === 0 ? { ...child, shadow: false } : child,
      ),
    };
    const updated = applyGridTemplate(promoted, "(50 50)(100)")!;
    expect(updated.children[0]?.shadow).toBe(false);
    const preset = exportSketchDraft({ ...draft, root: { ...draft.root, children: [updated] } });
    expect(preset.root.children?.[0]?.children?.map((zone) => zone.id)).toEqual(["L1A-r1c1"]);
  });

  it("exports a grid free child without exporting its empty shadow cells", () => {
    const draft = defaultSketchDocument().drafts[0]!;
    const grid = applyGridTemplate(draft.root.children[0]!, "(50 50)(100)")!;
    const withFreeChild = addChild(grid, "L1A", {
      name: "free",
      x: { raw: "20", resolved: 20 },
      y: { raw: "30", resolved: 30 },
      w: { raw: "40", resolved: 40 },
      h: { raw: "50", resolved: 50 },
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
