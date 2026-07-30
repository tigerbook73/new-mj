import { expect, test } from "@playwright/test";

test.describe("Layout Sketch Lab — editing", { tag: "@lab" }, () => {
  test("layout sketch creates a selected child and persists numeric edits", async ({ page }) => {
    await page.goto("/dev/table-layout");
    await expect(page.getByTestId("layout-lab-page")).toBeVisible();
    await page.getByLabel("Add child to Viewpoint").click();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("L1B");
    const x = page.getByLabel("Center X");
    // useSketchEditor.ts debounces the localStorage write by 150ms after any
    // `document` state change — poll for that write to actually land instead
    // of a fixed sleep (which is either wasted time or, under load, flaky).
    const storageKey = "new-mj:layout-sketches:v1";
    const before = await page.evaluate((key) => localStorage.getItem(key), storageKey);
    await x.fill("25");
    await x.blur();
    await expect
      .poll(() => page.evaluate((key) => localStorage.getItem(key), storageKey))
      .not.toBe(before);
    await page.reload();
    await expect(page.getByLabel("Center X")).toHaveValue("25");
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

  test("a conflicting object name reverts when the property editor loses focus", async ({
    page,
  }) => {
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

  test("clicking an overlapping canvas area cycles through its objects", async ({ page }) => {
    await page.goto("/dev/table-layout");
    await page.getByLabel("Add child to L1A").click();
    const overlap = page.getByLabel("Select L1A-1");
    await overlap.click();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("L1A");
    await overlap.click();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("L1A-1");
  });

  test("Viewpoint is not selectable and has no properties", async ({ page }) => {
    await page.goto("/dev/table-layout");
    await page.getByLabel("Delete L1A").click();
    await expect(page.getByLabel("Name", { exact: true })).toHaveCount(0);
    await page.getByLabel("Add child to Viewpoint").click();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("L1A");
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

  test("percentage properties accept parent-relative fractions", async ({ page }) => {
    await page.goto("/dev/table-layout");
    const x = page.getByLabel("Center X");
    await x.fill("1/2");
    await x.blur();
    await expect(x).toHaveValue("1/2");
  });
});
