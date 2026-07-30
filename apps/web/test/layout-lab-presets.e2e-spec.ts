import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const LAYOUTS_DIR = fileURLToPath(new URL("../src/features/mahjong/layouts/", import.meta.url));

test.describe("Layout Sketch Lab — presets & files", { tag: "@lab" }, () => {
  test("layout sketch copies the exported LayoutPreset JSON", async ({ page, context }) => {
    await page.goto("/dev/table-layout");
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: new URL(page.url()).origin,
    });
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

  // These tests hardcode exact draft counts/names and/or write real files
  // into apps/web/src/features/mahjong/layouts/ — the dev-only file API's target directory is
  // shared across every parallel worker hitting the same dev server, so a
  // file written by one test would auto-open as an extra draft in any other
  // concurrently-running page and throw off the others' counts. Serializing
  // this group relative to itself (the rest of the file's tests neither
  // write files nor assert on draft counts, so they're unaffected and stay
  // parallel) avoids that cross-test interference.
  test.describe.serial("draft counts and Save/Load touch the shared layouts directory", () => {
    test("drafts can be copied and deleted with a stable active-draft fallback", async ({
      page,
    }) => {
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
      await expect(dialog.getByRole("alert")).toHaveText(
        "desktop.table-layout.json already exists",
      );
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
});
