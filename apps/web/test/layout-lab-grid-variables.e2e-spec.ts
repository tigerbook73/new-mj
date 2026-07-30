import { expect, test } from "@playwright/test";

test.describe("Layout Sketch Lab — grid & variables", { tag: "@lab" }, () => {
  test("an element converts irreversibly to a grid with derived cells", async ({ page }) => {
    await page.goto("/dev/table-layout");
    await page.getByRole("button", { name: "More actions for L1A", exact: true }).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByLabel("Convert L1A to grid", { exact: true }).click();
    const grid = page.getByLabel("Grid template");
    await expect(grid).toHaveValue("(1)(1)");
    await expect(page.getByLabel("Add child to L1A-r1c1")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Add child to L1A", exact: true })).toHaveCount(
      1,
    );
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
});
