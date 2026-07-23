import { expect, test } from "@playwright/test";

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
  await page.getByLabel("Copy LayoutPreset JSON").click();
  await expect(page.getByRole("status")).toHaveText("LayoutPreset copied");
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toMatch(/"name": "draft1"/);
});

test("layout sketch imports the existing desktop preset as an approximation", async ({ page }) => {
  await page.goto("/dev/table-layout");
  await page.getByLabel("Import desktop preset").click();
  await expect(page.getByLabel("Active draft")).toHaveValue("desktop");
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("hand-bottom");
});

test("layout sketch imports validated LayoutPreset JSON from the header dialog", async ({
  page,
}) => {
  await page.goto("/dev/table-layout");
  await page.getByLabel("Import LayoutPreset JSON").click();
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

  await page.getByLabel("Import LayoutPreset JSON").click();
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
  await expect(page.getByRole("textbox", { name: "Center X", exact: true })).toHaveValue("35");
  await expect(page.getByRole("textbox", { name: "Center Y", exact: true })).toHaveValue("30");
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
  await expect(grid).toHaveValue("(100)(100)");
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
  await grid.fill("( 100 ) ( 100 )");
  await grid.blur();
  await expect(grid).toHaveValue("(100)(100)");
  await grid.fill("(50 50)(100)");
  await grid.blur();
  await page
    .getByRole("dialog", { name: "Confirm grid update" })
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(grid).toHaveValue("(100)(100)");
  await expect(page.locator('[data-sketch-node="L1A-r1c2"]')).toHaveCount(0);
  await grid.fill("(50 *)(* *)");
  await grid.blur();
  const confirmGrid = page.getByRole("dialog", { name: "Confirm grid update" });
  await expect(confirmGrid).toContainText("Grid cells will change from 1 to 4.");
  await confirmGrid.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.locator('[data-sketch-node="L1A-r2c2"]')).toBeVisible();
  await expect(page.locator('[data-sketch-node="L1A-r1c1-1"]')).toBeVisible();
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
  await variableValue.fill("50");
  await variableValue.press("Enter");
  const x = page.getByLabel("Center X");
  await x.fill("$half");
  await x.blur();
  await expect(x).toHaveValue("$half");
  await variableValue.fill("not-valid");
  await variableValue.blur();
  await expect(variableValue).toHaveValue("50");

  await page.getByRole("button", { name: "More actions for L1A", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByLabel("Convert L1A to grid", { exact: true }).click();
  const grid = page.getByLabel("Grid template");
  await grid.fill("($half *)(100)");
  await grid.blur();
  await page
    .getByRole("dialog", { name: "Confirm grid update" })
    .getByRole("button", { name: "Apply", exact: true })
    .click();
  await expect(grid).toHaveValue("($half *)(100)");
  await expect(page.locator('[data-sketch-node="L1A-r1c2"]')).toBeVisible();

  await variableName.fill("middle");
  await variableName.press("Enter");
  await expect(x).toHaveValue("$middle");
  await expect(grid).toHaveValue("($middle *)(100)");
  await expect(page.getByLabel("Delete variable middle")).toBeDisabled();

  await page.getByLabel("Add variable").click();
  const secondName = page.getByLabel("Variable name 2");
  await secondName.fill("alpha");
  await secondName.press("Enter");
  await expect(page.getByLabel("Variable name 1")).toHaveValue("alpha");
  await expect(page.getByLabel("Variable name 2")).toHaveValue("middle");
  await page.getByLabel("Delete variable alpha").click();
  await expect(page.getByLabel("Variable value alpha")).toHaveCount(0);
});

test("draft selection and viewport ratio are editable", async ({ page }) => {
  await page.goto("/dev/table-layout");
  await page.getByLabel("New draft").click();
  await expect(page.getByLabel("Active draft")).toHaveValue("draft2");
  await page.getByLabel("Viewport preset").selectOption("square");
  await expect(page.getByTestId("layout-sketch-viewport")).toHaveCSS("aspect-ratio", "1 / 1");
  await page.getByLabel("Viewport preset").selectOption("custom");
  await page.getByLabel("Viewport width").fill("4");
  await page.getByLabel("Viewport height").fill("3");
  await expect(page.getByTestId("layout-sketch-viewport")).toHaveCSS("aspect-ratio", "4 / 3");
});

test("a centered quarter-turned Zone stays inside a square viewport", async ({ page }) => {
  await page.goto("/dev/table-layout");
  await page.getByLabel("New draft").click();
  await page.getByLabel("Viewport preset").selectOption("square");
  for (const [label, value] of [
    ["Center X", "1/2"],
    ["Center Y", "1/2"],
    ["W", "100"],
    ["H", "50"],
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

test("drafts can be copied and deleted with a stable active-draft fallback", async ({ page }) => {
  await page.goto("/dev/table-layout");
  await page.getByLabel("New draft").click();
  const x = page.getByLabel("Center X");
  await x.fill("25");
  await x.blur();
  await page.getByLabel("Copy draft").click();
  await expect(page.getByLabel("Active draft")).toHaveValue("draft3");
  await expect(x).toHaveValue("25");
  await page.getByLabel("Delete draft").click();
  await page
    .getByRole("dialog", { name: "Delete draft confirmation" })
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(page.getByLabel("Active draft")).toHaveValue("draft2");
  await expect(x).toHaveValue("25");
  await page.getByLabel("Delete draft").click();
  await page
    .getByRole("dialog", { name: "Delete draft confirmation" })
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(page.getByLabel("Active draft")).toHaveValue("draft1");
  await expect(page.getByLabel("Delete draft")).toBeDisabled();
});
