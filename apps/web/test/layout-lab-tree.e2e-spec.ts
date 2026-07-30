import { expect, test } from "@playwright/test";

test.describe("Layout Sketch Lab — tree panel", { tag: "@lab" }, () => {
  test("tree actions create child objects without controls in the viewport", async ({ page }) => {
    await page.goto("/dev/table-layout");
    await page.getByLabel("Add child to L1A").click();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("L1A-1");
    await expect(page.getByTestId("layout-sketch-viewport").getByRole("button")).toHaveCount(2);
  });

  // Both assertions below need the same 14-child tree to have anything worth
  // scrolling — merged into one test (rather than two nearly-identical ones)
  // so that setup only runs once.
  test("Tree panel scrolling: Viewpoint stays visible, and selecting a node scrolls it into view", async ({
    page,
  }) => {
    await page.goto("/dev/table-layout");
    for (let index = 0; index < 14; index += 1)
      await page.getByLabel("Add child to Viewpoint").click();
    const tree = page.getByTestId("layout-tree-panel");
    const treeList = page.getByTestId("layout-tree-list");

    await treeList.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    const treeBoundsAtBottom = await tree.boundingBox();
    const viewpointBounds = await page.getByRole("heading", { name: "Viewpoint" }).boundingBox();
    expect(treeBoundsAtBottom).not.toBeNull();
    expect(viewpointBounds).not.toBeNull();
    if (treeBoundsAtBottom && viewpointBounds) {
      expect(viewpointBounds.y).toBeGreaterThanOrEqual(treeBoundsAtBottom.y);
      expect(viewpointBounds.y).toBeLessThan(treeBoundsAtBottom.y + 40);
    }

    await treeList.evaluate((element) => {
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
});
