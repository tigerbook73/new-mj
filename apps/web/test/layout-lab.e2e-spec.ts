import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const LAYOUTS_DIR = fileURLToPath(new URL("../src/features/mahjong/layouts/", import.meta.url));

test("layout sketch creates a selected child and persists numeric edits", async ({ page }) => {
  await page.goto("/dev/table-layout");
  await expect(page.getByTestId("layout-lab-page")).toBeVisible();
  await page.getByLabel("Add child to Viewpoint").click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("L1B");
  const x = page.getByLabel("Center X");
  await x.fill("25");
  await x.blur();
  await page.waitForTimeout(250);
  await page.reload();
  await expect(page.getByLabel("Center X")).toHaveValue("25");
});

test("layout sketch copies the exported LayoutPreset JSON", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://localhost:5274",
  });
  await page.goto("/dev/table-layout");
  await page.getByLabel("Copy JSON").click();
  await expect(page.getByRole("status")).toHaveText("LayoutPreset JSON copied");
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toMatch(/"name": "draft1"/);
});

// apps/web/src/features/mahjong/layouts/desktop.table-layout.json auto-opens as a draft on
// cold start (see the Save/Load plan's "打开 Lab" scenario) — this replaces
// the old manual "Import desktop preset" button, which is gone.
test("the desktop preset file auto-opens as a draft on cold start", async ({ page }) => {
  await page.goto("/dev/table-layout");
  await expect(
    page.getByLabel("Active draft").locator("option", { hasText: "desktop" }),
  ).toHaveCount(1);
  await page.getByLabel("Active draft").selectOption("desktop");
  await expect(page.getByLabel("Active draft")).toHaveValue("desktop");
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("hand-bottom");
});

test("real preview uses the current draft config and exposes deterministic samples", async ({
  page,
}) => {
  await page.goto("/dev/table-layout");
  await page.getByLabel("Active draft").selectOption("desktop");
  const gap = page.getByLabel("Tile gap px");
  await expect(gap).toHaveValue("1.9");
  await gap.fill("4");
  await expect(gap).toHaveValue("4");
  await page.getByRole("button", { name: "Real preview" }).click();
  const preview = page.getByTestId("layout-real-preview");
  const table = page.getByTestId("table-core");
  await expect(preview).toBeVisible();
  await expect(table).toBeVisible();
  const previewBounds = await preview.boundingBox();
  const tableBounds = await table.boundingBox();
  expect(previewBounds).not.toBeNull();
  expect(tableBounds).not.toBeNull();
  if (previewBounds && tableBounds)
    expect(tableBounds.x + tableBounds.width / 2).toBeCloseTo(
      previewBounds.x + previewBounds.width / 2,
      0,
    );
  await page.getByLabel("Preview sample").selectOption("dense");
  await expect(page.getByLabel("Preview sample")).toHaveValue("dense");
});

test("real preview honors hidden Zones without changing the production export", async ({
  page,
}) => {
  await page.goto("/dev/table-layout");
  await page.getByLabel("Active draft").selectOption("desktop");
  await page.getByLabel("Hide hand-bottom", { exact: true }).click();
  await page.getByRole("button", { name: "Real preview" }).click();
  await expect(page.locator('[data-zone="hand-bottom"]')).toHaveCount(0);
  await expect(page.locator('[data-zone="hand-top"]')).toHaveCount(1);
});

// Regression: clicking a node whose hit-test button is rotated 90°/270° must
// select that node, not some unrelated sibling or nothing at all. The old
// hit-test (nodesAtPoint) recomputed each node's box from its unrotated x/y/
// w/h percentages and never accounted for `rotationDeg` — for a 90°/270°-
// rotated node the on-screen box has swapped width/height vs. what that math
// assumed, so a click on the visibly correct spot could land outside the
// (wrongly shaped) computed box, or inside an overlapping sibling's. In the
// desktop preset, "hand-left"/"hand-right" (and everything nested under
// them) are exactly this kind of rotated node. Fixed by hit-testing via the
// browser's own `elementsFromPoint` instead of reimplementing the transform
// math in JS — see SketchCanvas.tsx's `nodesAtScreenPoint`.
test("clicking a 90°-rotated zone selects that zone, not an unrelated sibling", async ({
  page,
}) => {
  await page.goto("/dev/table-layout");
  await expect(
    page.getByLabel("Active draft").locator("option", { hasText: "desktop" }),
  ).toHaveCount(1);
  await page.getByLabel("Active draft").selectOption("desktop");
  // force:true — every node in this tree shares the same "absolute z-20"
  // wrapper class, which trips Playwright's own actionability pre-check
  // (it's overly strict about adjacent same-z-index siblings, unrelated to
  // the click-routing bug this test guards); the click itself still
  // dispatches a real, trusted event at the target's real screen position.
  await page.getByLabel("Select hand-left").click({ force: true });
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("hand-left");
  await page.getByLabel("Select meld-left").click({ force: true });
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("meld-left");
});

test("layout sketch imports validated LayoutPreset JSON from the header dialog", async ({
  page,
}) => {
  await page.goto("/dev/table-layout");
  await page.getByLabel("Import JSON").click();
  const dialog = page.getByRole("dialog", { name: "Import LayoutPreset JSON" });
  await dialog.getByRole("textbox", { name: "LayoutPreset JSON", exact: true }).fill(
    JSON.stringify({
      name: "pasted",
      referenceCanvas: { w: 1, h: 1 },
      root: {
        id: "viewport",
        anchorCenter: { x: 50, y: 50 },
        localSize: { w: 100, h: 100 },
        rotationDeg: 0,
        children: [
          {
            id: "zone",
            anchorCenter: { x: 50, y: 50 },
            localSize: { w: 50, h: 50 },
            rotationDeg: 0,
          },
        ],
      },
    }),
  );
  await dialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByLabel("Active draft")).toHaveValue("pasted");
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("zone");

  await page.getByLabel("Import JSON").click();
  await page.getByRole("textbox", { name: "LayoutPreset JSON", exact: true }).fill("not json");
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Invalid JSON");
});

test("a conflicting object name reverts when the property editor loses focus", async ({ page }) => {
  await page.goto("/dev/table-layout");
  await page.getByLabel("Add child to Viewpoint").click();
  const name = page.getByLabel("Name", { exact: true });
  await name.fill("L1A");
  await name.blur();
  await expect(name).toHaveValue("L1B");
});

test("string edits confirm on Enter and Escape cancels without changing the object", async ({
  page,
}) => {
  await page.goto("/dev/table-layout");
  const name = page.getByLabel("Name", { exact: true });
  await name.fill("cancelled");
  await name.press("Escape");
  await expect(name).toHaveValue("L1A");
  await name.fill("confirmed");
  await name.press("Enter");
  await expect(name).toHaveValue("confirmed");
});

test("tree actions create child objects without controls in the viewport", async ({ page }) => {
  await page.goto("/dev/table-layout");
  await page.getByLabel("Add child to L1A").click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("L1A-1");
  await expect(page.getByTestId("layout-sketch-viewport").getByRole("button")).toHaveCount(2);
});

test("clicking an overlapping canvas area cycles through its objects", async ({ page }) => {
  await page.goto("/dev/table-layout");
  await page.getByLabel("Add child to L1A").click();
  const overlap = page.getByLabel("Select L1A-1");
  await overlap.click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("L1A");
  await overlap.click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("L1A-1");
});

test("Tree keeps Viewpoint visible while its object list scrolls", async ({ page }) => {
  await page.goto("/dev/table-layout");
  for (let index = 0; index < 14; index += 1)
    await page.getByLabel("Add child to Viewpoint").click();
  const tree = page.getByTestId("layout-tree-panel");
  await page.getByTestId("layout-tree-list").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const treeBounds = await tree.boundingBox();
  const viewpointBounds = await page.getByRole("heading", { name: "Viewpoint" }).boundingBox();
  expect(treeBounds).not.toBeNull();
  expect(viewpointBounds).not.toBeNull();
  if (!treeBounds || !viewpointBounds) return;
  expect(viewpointBounds.y).toBeGreaterThanOrEqual(treeBounds.y);
  expect(viewpointBounds.y).toBeLessThan(treeBounds.y + 40);
});

test("Tree hides sorting controls and keeps copy in the More menu", async ({ page }) => {
  await page.goto("/dev/table-layout");
  await expect(page.getByLabel("Move L1A up")).toHaveCount(0);
  await expect(page.getByLabel("Copy L1A")).toHaveCount(0);
  await expect(page.getByLabel("Delete L1A")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "More actions for L1A", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "More actions for L1A", exact: true }).click();
  await expect(page.getByLabel("Copy L1A")).toBeVisible();
  await page.getByTestId("layout-sketch-viewport").click({ position: { x: 5, y: 5 } });
  await expect(page.getByLabel("Copy L1A")).toHaveCount(0);
});

test("Tree copies an element subtree as a selected sibling", async ({ page }) => {
  await page.goto("/dev/table-layout");
  await page.getByLabel("Add child to L1A").click();
  await page.getByRole("button", { name: "More actions for L1A", exact: true }).click();
  await page.getByLabel("Copy L1A", { exact: true }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("L1A1");
  await expect(page.getByRole("textbox", { name: "Center X", exact: true })).toHaveValue("0.25");
  await expect(page.getByRole("textbox", { name: "Center Y", exact: true })).toHaveValue("0.2");
  await expect(page.getByLabel("Select L1A1-1")).toHaveCount(1);
  await expect(
    page.locator('[data-testid="layout-tree-panel"] button[data-sketch-node]'),
  ).toHaveText(["L1A", "L1A-1", "L1A1", "L1A1-1"]);
});

test("Viewpoint is not selectable and has no properties", async ({ page }) => {
  await page.goto("/dev/table-layout");
  await page.getByLabel("Delete L1A").click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveCount(0);
  await page.getByLabel("Add child to Viewpoint").click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("L1A");
});

test("an element converts irreversibly to a grid with derived cells", async ({ page }) => {
  await page.goto("/dev/table-layout");
  await page.getByRole("button", { name: "More actions for L1A", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByLabel("Convert L1A to grid", { exact: true }).click();
  const grid = page.getByLabel("Grid template");
  await expect(grid).toHaveValue("(1)(1)");
  await expect(page.getByLabel("Add child to L1A-r1c1")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Add child to L1A", exact: true })).toHaveCount(1);
  await expect(page.getByText("Grid cells", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add child to L1A", exact: true }).click();
  await expect(page.getByText("Free children", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("L1A-1");
  await page.locator('[data-sketch-node="L1A-r1c1"]').click();
  await expect(page.getByLabel("Delete L1A-r1c1")).toHaveCount(0);
  await page.locator('[data-sketch-node="L1A-r1c1"]').click();
  const shadow = page.getByLabel("Shadow");
  await expect(shadow).toBeChecked();
  await expect(shadow).toBeEnabled();
  await expect(page.getByText("Center X", { exact: true })).toBeVisible();
  await expect(page.getByText("W", { exact: true })).toBeVisible();
  await shadow.uncheck();
  await expect(shadow).not.toBeChecked();
  await shadow.check();
  await page.getByLabel("Add child to L1A-r1c1").click();
  await page.locator('[data-sketch-node="L1A-r1c1"]').click();
  await expect(shadow).toBeDisabled();
  await page.locator('[data-sketch-node="L1A-r1c1-1"]').click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("L1A-r1c1-1");
  await page.locator('[data-sketch-node="L1A"]').click();
  await grid.fill("( 1 ) ( 1 )");
  await grid.blur();
  await expect(grid).toHaveValue("(1)(1)");
  await grid.fill("(0.5 0.5)(1)");
  await grid.blur();
  await page
    .getByRole("dialog", { name: "Confirm grid update" })
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(grid).toHaveValue("(1)(1)");
  await expect(page.locator('[data-sketch-node="L1A-r1c2"]')).toHaveCount(0);
  await grid.fill("(0.5 *)(* *)");
  await grid.blur();
  const confirmGrid = page.getByRole("dialog", { name: "Confirm grid update" });
  await expect(confirmGrid).toContainText("Grid cells will change from 1 to 4.");
  await confirmGrid.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.locator('[data-sketch-node="L1A-r2c2"]')).toBeVisible();
  await expect(page.locator('[data-sketch-node="L1A-r1c1-1"]')).toBeVisible();
});

test("a grid cell can be converted into its own nested grid, surviving the outer grid's resize", async ({
  page,
}) => {
  await page.goto("/dev/table-layout");
  await page.getByRole("button", { name: "More actions for L1A", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByLabel("Convert L1A to grid", { exact: true }).click();
  await page.getByLabel("Add child to L1A-r1c1").click();
  await page.locator('[data-sketch-node="L1A"]').click();
  await page.getByRole("button", { name: "More actions for L1A-r1c1", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByLabel("Convert L1A-r1c1 to grid", { exact: true }).click();
  await expect(page.locator('[data-sketch-node="L1A-r1c1-r1c1"]')).toBeVisible();
  // The content added before nesting doesn't match the new nested grid's
  // own cell-name pattern, so it rides along as a free child rather than
  // being dropped or forced into a cell slot.
  await expect(page.locator('[data-sketch-node="L1A-r1c1-1"]')).toBeVisible();
  // Tree grouping keys off the cell-name pattern, not kind — the now-nested
  // "L1A-r1c1" still belongs under L1A's own "Grid cells", not "Free
  // children", even though its kind changed from gridCell to grid.
  await expect(
    page.locator(
      'xpath=//button[@data-sketch-node="L1A-r1c1"]/ancestor::li[1]/parent::ul/preceding-sibling::p[1]',
    ),
  ).toHaveText("Grid cells");
  await page.locator('[data-sketch-node="L1A"]').click();
  const grid = page.getByLabel("Grid template");
  await grid.fill("(0.5 0.5)(1)");
  await grid.blur();
  const confirmGrid = page.getByRole("dialog", { name: "Confirm grid update" });
  await confirmGrid.getByRole("button", { name: "Apply", exact: true }).click();
  // The nested grid and its free child must have survived the outer grid's
  // template regenerating around it.
  await expect(page.locator('[data-sketch-node="L1A-r1c1-r1c1"]')).toBeVisible();
  await expect(page.locator('[data-sketch-node="L1A-r1c1-1"]')).toBeVisible();
  await expect(page.locator('[data-sketch-node="L1A-r1c2"]')).toBeVisible();
});

test("items can be hidden/shown individually and in bulk, without affecting the exported preset", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://localhost:5274",
  });
  await page.goto("/dev/table-layout");
  const canvasL1A = page.getByLabel("Select L1A", { exact: true });
  await expect(canvasL1A).toBeVisible();

  // Individual toggle: only one of Hide/Show is present at a time, chosen
  // by the item's current state.
  await page.getByLabel("Hide L1A", { exact: true }).click();
  await expect(canvasL1A).toHaveCount(0);
  await expect(page.getByLabel("Show L1A", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Hide L1A", { exact: true })).toHaveCount(0);
  await page.getByLabel("Show L1A", { exact: true }).click();
  await expect(canvasL1A).toBeVisible();

  // Bulk toggle: Show all/Hide all are always both present in the
  // Viewpoint row, regardless of current state.
  await expect(page.getByLabel("Show all")).toBeVisible();
  await expect(page.getByLabel("Hide all")).toBeVisible();
  await page.getByLabel("Hide all").click();
  await expect(canvasL1A).toHaveCount(0);
  await expect(page.getByLabel("Show L1A", { exact: true })).toBeVisible();
  await page.getByLabel("Show all").click();
  await expect(canvasL1A).toBeVisible();
  await expect(page.getByLabel("Hide L1A", { exact: true })).toBeVisible();

  // Hidden is canvas-only — it must never leak into the production `root`
  // Zone tree (the `editor` block is allowed to carry it, for round-tripping
  // the Lab's own editing state on re-import).
  await page.getByLabel("Hide L1A", { exact: true }).click();
  await page.getByLabel("Copy JSON").click();
  await expect(page.getByRole("status")).toHaveText("LayoutPreset JSON copied");
  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  expect(JSON.stringify(JSON.parse(clipboardText).root)).not.toContain("hidden");
});

test("the tree and properties panels have a draggable separator", async ({ page }) => {
  await page.goto("/dev/table-layout");
  const tree = page.getByTestId("layout-tree-panel");
  const separator = page.getByTestId("tree-properties-resizer");
  const before = await tree.boundingBox();
  const handle = await separator.boundingBox();
  expect(before).not.toBeNull();
  expect(handle).not.toBeNull();
  if (!before || !handle) return;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 80);
  await page.mouse.up();
  const after = await tree.boundingBox();
  expect(after?.height).toBeGreaterThan(before.height + 60);
});

test("sidebars have draggable width separators", async ({ page }) => {
  await page.goto("/dev/table-layout");
  const tree = page.getByTestId("layout-tree-panel");
  const variables = page.getByTestId("layout-variables-panel");
  const leftHandle = page.getByTestId("left-sidebar-resizer");
  const rightHandle = page.getByTestId("right-sidebar-resizer");
  const treeBefore = await tree.boundingBox();
  const variablesBefore = await variables.boundingBox();
  const leftBounds = await leftHandle.boundingBox();
  const rightBounds = await rightHandle.boundingBox();
  expect(treeBefore).not.toBeNull();
  expect(variablesBefore).not.toBeNull();
  expect(leftBounds).not.toBeNull();
  expect(rightBounds).not.toBeNull();
  if (!treeBefore || !variablesBefore || !leftBounds || !rightBounds) return;
  await page.mouse.move(leftBounds.x + 1, leftBounds.y + leftBounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(leftBounds.x + 61, leftBounds.y + leftBounds.height / 2);
  await page.mouse.up();
  const movedRightBounds = await rightHandle.boundingBox();
  expect(movedRightBounds).not.toBeNull();
  if (!movedRightBounds) return;
  await page.mouse.move(movedRightBounds.x + 1, movedRightBounds.y + movedRightBounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(movedRightBounds.x - 59, movedRightBounds.y + movedRightBounds.height / 2);
  await page.mouse.up();
  expect((await tree.boundingBox())?.width).toBeGreaterThan(treeBefore.width + 40);
  expect((await variables.boundingBox())?.width).toBeGreaterThan(variablesBefore.width + 40);
});

test("Config panel has a resizable, independently scrollable height", async ({ page }) => {
  await page.goto("/dev/table-layout");
  const config = page.getByTestId("layout-config-panel");
  const separator = page.getByTestId("config-panel-resizer");
  const before = await config.boundingBox();
  const handle = await separator.boundingBox();
  expect(before).not.toBeNull();
  expect(handle).not.toBeNull();
  if (!before || !handle) return;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, handle.y - 80);
  await page.mouse.up();
  expect((await config.boundingBox())?.height).toBeGreaterThan(before.height + 60);
});

test("the variables sidebar is anchored at the top", async ({ page }) => {
  await page.goto("/dev/table-layout");
  const pageBounds = await page.getByTestId("layout-lab-page").boundingBox();
  const variablesBounds = await page.getByTestId("layout-variables-panel").boundingBox();
  expect(pageBounds).not.toBeNull();
  expect(variablesBounds).not.toBeNull();
  if (!pageBounds || !variablesBounds) return;
  expect(variablesBounds.y).toBeCloseTo(pageBounds.y + 56, 0);
});

test("selecting an element scrolls its tree node into view", async ({ page }) => {
  await page.goto("/dev/table-layout");
  for (let index = 0; index < 14; index += 1)
    await page.getByLabel("Add child to Viewpoint").click();
  const tree = page.getByTestId("layout-tree-panel");
  await page.getByTestId("layout-tree-list").evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.getByLabel("Select L1A").dispatchEvent("click");
  await page.getByLabel("Select L1O").dispatchEvent("click");
  const treeBounds = await tree.boundingBox();
  const nodeBounds = await page.locator('[data-sketch-node="L1O"]').boundingBox();
  expect(treeBounds).not.toBeNull();
  expect(nodeBounds).not.toBeNull();
  if (!treeBounds || !nodeBounds) return;
  expect(nodeBounds.y).toBeGreaterThanOrEqual(treeBounds.y);
  expect(nodeBounds.y + nodeBounds.height).toBeLessThanOrEqual(treeBounds.y + treeBounds.height);
});

test("scrollable sidebars reserve a stable scrollbar gutter", async ({ page }) => {
  await page.goto("/dev/table-layout");
  for (const panel of [
    page.getByTestId("layout-tree-list"),
    page.getByTestId("layout-properties-panel"),
  ]) {
    await expect(panel).toHaveCSS("overflow-y", "scroll");
    await expect(panel).toHaveCSS("scrollbar-gutter", "stable");
  }
});

test("percentage properties accept parent-relative fractions", async ({ page }) => {
  await page.goto("/dev/table-layout");
  const x = page.getByLabel("Center X");
  await x.fill("1/2");
  await x.blur();
  await expect(x).toHaveValue("1/2");
});

test("nested Zone rotations render in the final canvas", async ({ page }) => {
  await page.goto("/dev/table-layout");
  await page.getByLabel("Rotation").selectOption("90");
  await expect(page.getByLabel("Rotation")).toHaveValue("90");
  await expect(
    page.getByTestId("layout-sketch-viewport").getByLabel("Select L1A").locator(".."),
  ).toHaveCSS("transform", "matrix(0, 1, -1, 0, 0, 0)");
});

test("selected Zones can switch between world and local coordinate views", async ({ page }) => {
  await page.goto("/dev/table-layout");
  await page.getByLabel("Rotation").selectOption("90");
  await page.getByLabel("Coordinate view").selectOption("parent");
  const viewport = page.getByTestId("layout-sketch-viewport");
  await expect(viewport).toContainText("Parent View");
  await expect(viewport).toContainText("Parent: viewport");
  await expect(page.getByText("Parent: viewport · unrotated local axes")).toBeVisible();
  await page.getByLabel("Coordinate view").selectOption("zone");
  await expect(viewport).toContainText("Zone View");
  await expect(viewport).toContainText("Zone local: L1A");
  await expect(page.getByText("Zone: L1A · local axes")).toBeVisible();
  await page.getByLabel("Coordinate view").selectOption("world");
  await expect(viewport).toContainText("World View");
});

test("Parent-local view keeps a nested Zone's parent at its actual size", async ({ page }) => {
  await page.goto("/dev/table-layout");
  await page.getByLabel("Rotation").selectOption("90");
  await page.getByLabel("Add child to L1A").click();
  await page.getByLabel("Coordinate view").selectOption("parent");
  const viewport = page.getByTestId("layout-sketch-viewport");
  await expect(viewport).toHaveAttribute("data-coordinate-view", "parent");
  await expect(viewport).toHaveAttribute("style", /width: min\(90cqw/);
  await expect(viewport.locator('[data-sketch-root="true"]')).toHaveCSS("transform", "none");
  await expect(viewport).toContainText("Parent: L1A");
});

test("Zone-local view keeps the selected Zone at its actual size", async ({ page }) => {
  await page.goto("/dev/table-layout");
  await page.getByLabel("Add child to L1A").click();
  await page.getByLabel("Coordinate view").selectOption("zone");
  const viewport = page.getByTestId("layout-sketch-viewport");
  await expect(viewport).toHaveAttribute("data-coordinate-view", "zone");
  await expect(viewport).toHaveAttribute("style", /width: min\(90cqw/);
  await expect(viewport).toContainText("Zone local: L1A-1");
});

test("variables resolve geometry and grid tracks, with invalid edits reverting", async ({
  page,
}) => {
  await page.goto("/dev/table-layout");
  await page.getByLabel("Add variable").click();
  const variableName = page.getByLabel("Variable name 1");
  await variableName.fill("half");
  await variableName.press("Enter");
  const variableValue = page.getByLabel("Variable value half");
  await variableValue.fill("0.5");
  await variableValue.press("Enter");
  const x = page.getByLabel("Center X");
  await x.fill("$half");
  await x.blur();
  await expect(x).toHaveValue("$half");
  await variableValue.fill("not-valid");
  await variableValue.blur();
  await expect(variableValue).toHaveValue("0.5");

  await page.getByRole("button", { name: "More actions for L1A", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByLabel("Convert L1A to grid", { exact: true }).click();
  const grid = page.getByLabel("Grid template");
  await grid.fill("($half *)(1)");
  await grid.blur();
  await page
    .getByRole("dialog", { name: "Confirm grid update" })
    .getByRole("button", { name: "Apply", exact: true })
    .click();
  await expect(grid).toHaveValue("($half *)(1)");
  await expect(page.locator('[data-sketch-node="L1A-r1c2"]')).toBeVisible();

  // The name field is display-only until double-clicked (edits already
  // committed once above via Enter, which drops back out of edit mode).
  await variableName.dblclick();
  await variableName.fill("middle");
  await variableName.press("Enter");
  await expect(x).toHaveValue("$middle");
  await expect(grid).toHaveValue("($middle *)(1)");
  await expect(page.getByLabel("Delete variable middle")).toBeDisabled();

  await page.getByLabel("Add variable").click();
  const secondName = page.getByLabel("Variable name 2");
  await secondName.fill("alpha");
  await secondName.press("Enter");
  // Creation order, not alphabetical — "middle" was created first.
  await expect(page.getByLabel("Variable name 1")).toHaveText("middle");
  await expect(page.getByLabel("Variable name 2")).toHaveText("alpha");
  await page.getByLabel("Delete variable alpha").click();
  await expect(page.getByLabel("Variable value alpha")).toHaveCount(0);
});

test("variable names are read-only until double-clicked, and search filters the list", async ({
  page,
}) => {
  await page.goto("/dev/table-layout");
  await page.getByLabel("Add variable").click();
  // A freshly created variable is immediately editable and selected —
  // .fill() alone proves that (a plain button can't be filled).
  await page.getByLabel("Variable name 1").fill("first");
  await page.getByLabel("Variable name 1").press("Enter");
  // Once committed, the name renders as a plain button, not an input.
  const nameDisplay = page.getByLabel("Variable name 1");
  await expect(nameDisplay).toHaveText("first");
  await nameDisplay.dblclick();
  await expect(page.getByLabel("Variable name 1")).toBeEditable();
  await page.getByLabel("Variable name 1").press("Escape");
  await expect(page.getByLabel("Variable name 1")).toHaveText("first");

  await page.getByLabel("Add variable").click();
  await page.getByLabel("Variable name 2").fill("second");
  await page.getByLabel("Variable name 2").press("Enter");

  const search = page.getByLabel("Search variables");
  await search.fill("first");
  await expect(page.getByLabel("Variable name 1")).toHaveText("first");
  await expect(page.getByLabel("Variable name 2")).toHaveCount(0);
  await search.fill("nonexistent");
  await expect(page.getByText("No variables match “nonexistent”.")).toBeVisible();
  await search.fill("");
  // Filters by name only — a value match doesn't count.
  const secondValue = page.getByLabel("Variable value second");
  await secondValue.fill("distinctivevalue");
  await secondValue.press("Enter");
  await search.fill("distinctivevalue");
  await expect(page.getByText("No variables match “distinctivevalue”.")).toBeVisible();
  await search.fill("");
  await expect(page.getByLabel("Variable name 2")).toHaveText("second");
});

test("variables can be drag-reordered in sort mode, which exits on an outside click", async ({
  page,
}) => {
  await page.goto("/dev/table-layout");
  for (const name of ["first", "second", "third"]) {
    await page.getByLabel("Add variable").click();
    const input = page.locator('input[aria-label^="Variable name "]');
    await input.fill(name);
    await input.press("Enter");
  }
  await expect(page.getByLabel("Variable name 1")).toHaveText("first");
  await expect(page.getByLabel("Variable name 2")).toHaveText("second");
  await expect(page.getByLabel("Variable name 3")).toHaveText("third");

  await page.getByLabel("Sort variables").click();
  // Adding a new variable mid-reorder would be confusing — the button is
  // hidden for the duration of sort mode, like the per-row action buttons.
  await expect(page.getByLabel("Add variable")).toHaveCount(0);
  const handle = page.getByLabel("Reorder variable first");
  const thirdRow = page.getByLabel("Variable name 3");
  const handleBox = await handle.boundingBox();
  const thirdBox = await thirdRow.boundingBox();
  expect(handleBox).not.toBeNull();
  expect(thirdBox).not.toBeNull();
  if (!handleBox || !thirdBox) return;
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  // Land in the bottom quarter of row 3's own box (not past its edge) so
  // elementFromPoint resolves to that row — below its midpoint means "drop
  // after this row".
  await page.mouse.move(thirdBox.x + thirdBox.width / 2, thirdBox.y + thirdBox.height * 0.9, {
    steps: 5,
  });
  await page.mouse.up();
  // "first" dropped below "third" — new order is second, third, first.
  await expect(page.getByLabel("Variable name 1")).toHaveText("second");
  await expect(page.getByLabel("Variable name 2")).toHaveText("third");
  await expect(page.getByLabel("Variable name 3")).toHaveText("first");

  await expect(page.getByLabel("Reorder variable first")).toBeVisible();
  await page.getByTestId("layout-sketch-viewport").click({ position: { x: 5, y: 5 } });
  await expect(page.getByLabel("Reorder variable first")).toHaveCount(0);
  await expect(page.getByLabel("Add variable")).toBeVisible();
});

test("a variable row's height doesn't change when entering sort mode", async ({ page }) => {
  await page.goto("/dev/table-layout");
  for (const name of ["first", "second"]) {
    await page.getByLabel("Add variable").click();
    const input = page.locator('input[aria-label^="Variable name "]');
    await input.fill(name);
    await input.press("Enter");
  }
  const row = page.getByLabel("Variable name 1").locator("..");
  const before = await row.boundingBox();
  await page.getByLabel("Sort variables").click();
  const after = await row.boundingBox();
  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  // The sort-mode name span must reserve the same (transparent) border the
  // normal-mode name button has, or the row shrinks by the border width.
  expect(after?.height).toBe(before?.height);
});

test("Tree search keeps a matched node's ancestors visible and hides the rest", async ({
  page,
}) => {
  await page.goto("/dev/table-layout");
  await page.getByLabel("Add child to L1A").click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("L1A-1");
  const search = page.getByLabel("Search elements");
  await search.fill("L1A-1");
  await expect(page.locator('[data-sketch-node="L1A-1"]')).toBeVisible();
  // "L1A" is the matched node's ancestor — stays visible to keep the tree
  // structurally intact, even though its own name doesn't contain the query.
  await expect(page.locator('[data-sketch-node="L1A"]')).toBeVisible();
  await search.fill("nonexistent");
  await expect(page.getByText("No elements match “nonexistent”.")).toBeVisible();
  await expect(page.locator('[data-sketch-node="L1A"]')).toHaveCount(0);
  await search.fill("");
  await expect(page.locator('[data-sketch-node="L1A"]')).toBeVisible();
});

test("Tree items collapse/expand, and a search bypasses collapsed state", async ({ page }) => {
  await page.goto("/dev/table-layout");
  await page.getByLabel("Add child to L1A").click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("L1A-1");
  // A leaf node (no children) gets no collapse toggle at all.
  await expect(page.getByLabel("Collapse L1A-1")).toHaveCount(0);
  await expect(page.getByLabel("Expand L1A-1")).toHaveCount(0);

  await expect(page.locator('[data-sketch-node="L1A-1"]')).toBeVisible();
  await page.getByLabel("Collapse L1A").click();
  await expect(page.locator('[data-sketch-node="L1A-1"]')).toHaveCount(0);
  await expect(page.getByLabel("Expand L1A")).toBeVisible();
  await page.getByLabel("Expand L1A").click();
  await expect(page.locator('[data-sketch-node="L1A-1"]')).toBeVisible();

  // Collapse again, then search for the now-hidden child — the match must
  // still surface even though its parent is collapsed.
  await page.getByLabel("Collapse L1A").click();
  await expect(page.locator('[data-sketch-node="L1A-1"]')).toHaveCount(0);
  await page.getByLabel("Search elements").fill("L1A-1");
  await expect(page.locator('[data-sketch-node="L1A-1"]')).toBeVisible();
  await page.getByLabel("Search elements").fill("");
  // Clearing the search restores the earlier collapsed state.
  await expect(page.locator('[data-sketch-node="L1A-1"]')).toHaveCount(0);
  await expect(page.getByLabel("Expand L1A")).toBeVisible();
});

test("Tree items can be drag-reordered in sort mode; grid cells can't be", async ({ page }) => {
  await page.goto("/dev/table-layout");
  await page.getByLabel("Add child to Viewpoint").click();
  await page.getByLabel("Add child to Viewpoint").click();
  // Not scoped to `button` — the name renders as a plain span in sort mode
  // (see below), but both carry data-sketch-node.
  const treeNodeNames = () =>
    page.locator('[data-testid="layout-tree-list"] [data-sketch-node]').allTextContents();
  await expect.poll(treeNodeNames).toEqual(["L1A", "L1B", "L1C"]);

  await page.getByLabel("Sort elements").click();
  // Adding a new element mid-reorder would be confusing — the top-level
  // "Add child to Viewpoint" button is hidden for the duration of sort
  // mode, like the per-row action buttons.
  await expect(page.getByLabel("Add child to Viewpoint")).toHaveCount(0);
  const handle = page.getByLabel("Reorder L1A");
  const targetRow = page.locator('[data-sketch-node="L1C"]');
  const handleBox = await handle.boundingBox();
  const targetBox = await targetRow.boundingBox();
  expect(handleBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  if (!handleBox || !targetBox) return;
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height * 0.9, {
    steps: 5,
  });
  await page.mouse.up();
  await expect.poll(treeNodeNames).toEqual(["L1B", "L1C", "L1A"]);

  // Grid cells are positioned by the grid template, not array order — no
  // reorder handle for them, sort mode or not.
  await page.getByLabel("Stop sorting elements").click();
  await page.getByRole("button", { name: "More actions for L1B", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByLabel("Convert L1B to grid", { exact: true }).click();
  await page.getByLabel("Sort elements").click();
  await expect(page.getByLabel("Reorder L1B-r1c1")).toHaveCount(0);

  // Clicking outside the tree panel exits sort mode.
  await page.getByTestId("layout-sketch-viewport").click({ position: { x: 5, y: 5 } });
  await expect(page.getByLabel("Reorder L1C")).toHaveCount(0);
  await expect(page.getByLabel("Add child to Viewpoint")).toBeVisible();
});

test("typing $ autocompletes variable names in property, grid, and variable-value fields", async ({
  page,
}) => {
  await page.goto("/dev/table-layout");
  await page.getByLabel("Add variable").click();
  await page.getByLabel("Variable name 1").fill("half");
  await page.getByLabel("Variable name 1").press("Enter");
  await page.getByLabel("Add variable").click();
  await page.getByLabel("Variable name 2").fill("quarter");
  await page.getByLabel("Variable name 2").press("Enter");

  // Property field (Center X): "$h" only matches "half", not "quarter".
  const centerX = page.getByLabel("Center X");
  await centerX.fill("$h");
  await expect(page.getByRole("option", { name: "$half" })).toBeVisible();
  await expect(page.getByRole("option", { name: "$quarter" })).toHaveCount(0);
  await centerX.press("Enter");
  await expect(centerX).toHaveValue("$half");
  // Enter selected the suggestion — it must not also have blurred/committed.
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await centerX.blur();

  // Grid template field.
  await page.getByRole("button", { name: "More actions for L1A", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByLabel("Convert L1A to grid", { exact: true }).click();
  const grid = page.getByLabel("Grid template");
  await grid.fill("($qu");
  await expect(page.getByRole("option", { name: "$quarter" })).toBeVisible();
  await page.getByRole("option", { name: "$quarter" }).click();
  await expect(grid).toHaveValue("($quarter");
  await grid.press("Escape");

  // A variable's own value field can reference another variable — the
  // trigger match is against the text immediately before the caret, so
  // filling "$ha" (caret lands at the end) still matches "half".
  const quarterValue = page.getByLabel("Variable value quarter");
  await quarterValue.fill("$ha");
  await expect(page.getByRole("option", { name: "$half" })).toBeVisible();
  await quarterValue.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
});

test("draft selection and viewport ratio are editable", async ({ page }) => {
  await page.goto("/dev/table-layout");
  const activeDraft = page.getByLabel("Active draft");
  const original = await activeDraft.inputValue();
  await page.getByLabel("New draft").click();
  // Not asserting a specific "draftN" name here — the desktop preset file
  // auto-opens as an extra draft on cold start, which shifts the numbering
  // (see "the desktop preset file auto-opens..." above); this test only
  // cares that a new, different draft became active.
  await expect(activeDraft).not.toHaveValue(original);
  await page.getByLabel("Viewport preset").selectOption("square");
  await expect(page.getByTestId("layout-sketch-viewport")).toHaveCSS("aspect-ratio", "1 / 1");
  await page.getByLabel("Viewport preset").selectOption("custom");
  await page.getByLabel("Viewport width").fill("4");
  await page.getByLabel("Viewport height").fill("3");
  await expect(page.getByTestId("layout-sketch-viewport")).toHaveCSS("aspect-ratio", "4 / 3");
});

test("World View canvas stays inside its section for a portrait viewport", async ({ page }) => {
  await page.goto("/dev/table-layout");
  await page.getByLabel("Viewport preset").selectOption("phone");
  const section = page.getByTestId("layout-sketch-viewport").locator("..");
  const [sectionBox, viewportBox] = await Promise.all([
    section.boundingBox(),
    page.getByTestId("layout-sketch-viewport").boundingBox(),
  ]);
  expect(sectionBox).not.toBeNull();
  expect(viewportBox).not.toBeNull();
  expect(viewportBox!.y).toBeGreaterThanOrEqual(sectionBox!.y - 1);
  expect(viewportBox!.y + viewportBox!.height).toBeLessThanOrEqual(
    sectionBox!.y + sectionBox!.height + 1,
  );
});

test("a centered quarter-turned Zone stays inside a square viewport", async ({ page }) => {
  await page.goto("/dev/table-layout");
  await page.getByLabel("New draft").click();
  await page.getByLabel("Viewport preset").selectOption("square");
  for (const [label, value] of [
    ["Center X", "1/2"],
    ["Center Y", "1/2"],
    ["W", "1"],
    ["H", "0.5"],
  ] as const) {
    const input = page.getByRole("textbox", { name: label, exact: true });
    await input.fill(value);
    await input.blur();
  }
  await page.getByLabel("Rotation").selectOption("90");
  for (const coordinateView of ["world", "parent"] as const) {
    await page.getByLabel("Coordinate view").selectOption(coordinateView);
    const viewport = page.getByTestId("layout-sketch-viewport");
    const zone = viewport.getByLabel("Select L1A", { exact: true }).locator("..");
    const [viewportBox, zoneBox] = await Promise.all([viewport.boundingBox(), zone.boundingBox()]);
    expect(viewportBox).not.toBeNull();
    expect(zoneBox).not.toBeNull();
    expect(zoneBox!.x).toBeGreaterThanOrEqual(viewportBox!.x - 1);
    expect(zoneBox!.y).toBeGreaterThanOrEqual(viewportBox!.y - 1);
    expect(zoneBox!.x + zoneBox!.width).toBeLessThanOrEqual(
      viewportBox!.x + viewportBox!.width + 1,
    );
    expect(zoneBox!.y + zoneBox!.height).toBeLessThanOrEqual(
      viewportBox!.y + viewportBox!.height + 1,
    );
  }
});

test("Parent-local uses an unrotated parent's local 4:1 aspect ratio", async ({ page }) => {
  await page.goto("/dev/table-layout");
  await page.getByLabel("New draft").click();
  await page.getByLabel("Viewport preset").selectOption("square");
  for (const [label, value] of [
    ["Center X", "87.5"],
    ["Center Y", "50"],
    ["W", "100"],
    ["H", "25"],
  ] as const) {
    const input = page.getByRole("textbox", { name: label, exact: true });
    await input.fill(value);
    await input.blur();
  }
  await page.getByLabel("Rotation").selectOption("-90");
  await page.getByLabel("Add child to L1A").click();
  await page.getByLabel("Coordinate view").selectOption("parent");
  const bounds = await page.getByTestId("layout-sketch-viewport").boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.width / bounds!.height).toBeCloseTo(4, 1);
});

// These tests hardcode exact draft counts/names and/or write real files
// into apps/web/src/features/mahjong/layouts/ — the dev-only file API's target directory is
// shared across every parallel worker hitting the same dev server, so a
// file written by one test would auto-open as an extra draft in any other
// concurrently-running page and throw off the others' counts. Serializing
// this group relative to itself (the rest of the file's tests neither
// write files nor assert on draft counts, so they're unaffected and stay
// parallel) avoids that cross-test interference.
test.describe.serial("draft counts and Save/Load touch the shared layouts directory", () => {
  test("drafts can be copied and deleted with a stable active-draft fallback", async ({ page }) => {
    await page.goto("/dev/table-layout");
    const activeDraft = page.getByLabel("Active draft");
    // Wait for the desktop preset file's auto-opened draft so the "draftN"
    // numbering below (which counts all existing drafts) is deterministic.
    await expect(activeDraft.locator("option", { hasText: "desktop" })).toHaveCount(1);
    await page.getByLabel("New draft").click();
    const x = page.getByLabel("Center X");
    await x.fill("25");
    await x.blur();
    await page.getByLabel("Copy draft").click();
    await expect(activeDraft).toHaveValue("draft4");
    await expect(x).toHaveValue("25");
    await page.getByLabel("Delete draft").click();
    await page
      .getByRole("dialog", { name: "Delete draft confirmation" })
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await expect(activeDraft).toHaveValue("draft3");
    await expect(x).toHaveValue("25");
    await page.getByLabel("Delete draft").click();
    await page
      .getByRole("dialog", { name: "Delete draft confirmation" })
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    // Falls back to "desktop" (the next draft in list order after draft1) —
    // and it's promptly protected: a file-backed draft's Delete button is
    // disabled, unlike the plain local drafts just removed above.
    await expect(activeDraft).toHaveValue("desktop");
    await expect(page.getByLabel("Delete draft")).toBeDisabled();
    // draft1 is still a plain local draft and can be deleted freely, leaving
    // "desktop" as the sole remaining draft — disabled for a second reason
    // now too (it's the only draft left).
    await activeDraft.selectOption("draft1");
    await page.getByLabel("Delete draft").click();
    await page
      .getByRole("dialog", { name: "Delete draft confirmation" })
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await expect(activeDraft).toHaveValue("desktop");
    await expect(page.getByLabel("Delete draft")).toBeDisabled();
  });

  test("Save prompts for a filename on a new draft, tracks dirty state, and Load reverts local edits", async ({
    page,
  }) => {
    const filename = "e2e-save-roundtrip.table-layout.json";
    try {
      await page.goto("/dev/table-layout");
      await page.getByLabel("New draft").click();
      await expect(page.getByLabel("Save")).toBeEnabled();
      await expect(page.getByLabel("Load")).toBeDisabled();
      await page.getByLabel("Save").click();
      const saveDialog = page.getByRole("dialog", { name: "Save as" });
      await expect(saveDialog).toBeVisible();
      await saveDialog.getByLabel("Filename").fill(filename);
      await saveDialog.getByRole("button", { name: "Save", exact: true }).click();
      await expect(saveDialog).toBeHidden();
      await expect(page.getByRole("status")).toHaveText(`Saved ${filename}`);
      await expect(page.getByLabel("Save")).toBeDisabled();
      await expect(page.getByLabel("Load")).toBeDisabled();

      // Editing re-dirties the draft: Save re-enables, and Load becomes an
      // available "undo back to disk" escape hatch.
      const x = page.getByLabel("Center X");
      const savedCenterX = await x.inputValue();
      await x.fill("33");
      await x.blur();
      await expect(page.getByLabel("Save")).toBeEnabled();
      await expect(page.getByLabel("Load")).toBeEnabled();

      await page.getByLabel("Load").click();
      const loadDialog = page.getByRole("dialog", { name: "Load confirmation" });
      await expect(loadDialog).toBeVisible();
      await loadDialog.getByRole("button", { name: "Load", exact: true }).click();
      await expect(loadDialog).toBeHidden();
      await expect(page.getByRole("status")).toHaveText(`Reloaded ${filename}`);
      await expect(x).toHaveValue(savedCenterX);
      await expect(page.getByLabel("Save")).toBeDisabled();
      await expect(page.getByLabel("Load")).toBeDisabled();

      // Already bound to a file, so this Save goes straight to disk — no
      // filename dialog this time.
      await x.fill("40");
      await x.blur();
      await page.getByLabel("Save").click();
      await expect(page.getByRole("status")).toHaveText(`Saved ${filename}`);
      await expect(page.getByLabel("Save")).toBeDisabled();
    } finally {
      await fs.rm(path.join(LAYOUTS_DIR, filename), { force: true });
    }
  });

  test("Save rejects a filename that already exists on disk", async ({ page }) => {
    await page.goto("/dev/table-layout");
    await expect(
      page.getByLabel("Active draft").locator("option", { hasText: "desktop" }),
    ).toHaveCount(1);
    await page.getByLabel("New draft").click();
    await page.getByLabel("Save").click();
    const dialog = page.getByRole("dialog", { name: "Save as" });
    await dialog.getByLabel("Filename").fill("desktop.table-layout.json");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("alert")).toHaveText("desktop.table-layout.json already exists");
  });

  test("a bound file deleted outside the Lab becomes save-as-new and deletable again", async ({
    page,
  }) => {
    const filename = "e2e-save-missing.table-layout.json";
    try {
      await page.goto("/dev/table-layout");
      await page.getByLabel("New draft").click();
      await page.getByLabel("Save").click();
      const dialog = page.getByRole("dialog", { name: "Save as" });
      await dialog.getByLabel("Filename").fill(filename);
      await dialog.getByRole("button", { name: "Save", exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByLabel("Delete draft")).toBeDisabled();

      // Simulate the file being deleted outside the Lab (by hand, or by
      // another tool) — the app only finds out on its next disk-file
      // refresh, triggered here by a reload (same discovery path as a
      // window focus in real use).
      await fs.rm(path.join(LAYOUTS_DIR, filename));
      await page.reload();

      await expect(page.getByLabel("Load")).toBeDisabled();
      await expect(page.getByLabel("Delete draft")).toBeEnabled();
      await expect(page.getByLabel("Save")).toBeEnabled();
      await page.getByLabel("Save").click();
      await expect(page.getByRole("dialog", { name: "Save as" })).toBeVisible();
    } finally {
      await fs.rm(path.join(LAYOUTS_DIR, filename), { force: true });
    }
  });
});
