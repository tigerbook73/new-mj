import { expect, test } from "@playwright/test";

test.describe("Layout Sketch Lab — viewport & panels", { tag: "@lab" }, () => {
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
    await page.mouse.move(
      movedRightBounds.x - 59,
      movedRightBounds.y + movedRightBounds.height / 2,
    );
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
      const [viewportBox, zoneBox] = await Promise.all([
        viewport.boundingBox(),
        zone.boundingBox(),
      ]);
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
});
