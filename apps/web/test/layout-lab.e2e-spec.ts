import { expect, test, type Locator } from "@playwright/test";

async function boxes(locator: Locator) {
  return locator.evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    }),
  );
}

test("layout lab adjusts, persists and resets parameters", async ({ page }) => {
  await page.goto("/dev/table-layout");
  await expect(page.getByTestId("layout-lab-page")).toBeVisible();
  const playerTrack = page.getByLabel("Player track %");
  await playerTrack.fill("18");
  await expect(playerTrack).toHaveValue("18");
  await page.waitForTimeout(250);
  await page.reload();
  await expect(playerTrack).toHaveValue("18");

  await page.getByRole("button", { name: "6×4" }).click();
  await expect(page.getByTestId("lab-slot-discard-bottom-23")).toBeAttached();
  await expect(page.getByTestId("lab-slot-discard-bottom-23")).toHaveAttribute(
    "data-empty",
    "true",
  );
  await page.getByRole("button", { name: "Reset defaults" }).click();
  await expect(playerTrack).toHaveValue("12");
});

test("meld append and draw preserve existing slot coordinates", async ({ page }) => {
  await page.goto("/dev/table-layout");
  const meldCount = page.getByLabel("Meld group count");
  const drawn = page.getByLabel("Drawn tile");

  await meldCount.fill("1");
  const meldBefore = await boxes(page.locator('[data-testid^="lab-slot-meld-bottom-"]').first());
  const handBefore = await boxes(page.locator('[data-testid^="lab-slot-hand-bottom-"]').nth(0));
  await meldCount.fill("3");
  expect(await boxes(page.locator('[data-testid="lab-slot-meld-bottom-0"]'))).toEqual(meldBefore);
  expect(await boxes(page.locator('[data-testid="lab-slot-hand-bottom-0"]'))).toEqual(handBefore);

  await drawn.uncheck();
  const bodyBefore = await boxes(page.locator('[data-testid^="lab-slot-hand-bottom-"]'));
  await expect(page.getByTestId("lab-slot-hand-bottom-draw")).toHaveAttribute("data-empty", "true");
  await drawn.check();
  const bodyAfterDraw = await boxes(page.locator('[data-testid^="lab-slot-hand-bottom-"]'));
  expect(bodyAfterDraw).toEqual(bodyBefore);
  await expect(page.getByTestId("lab-slot-hand-bottom-draw")).not.toHaveAttribute(
    "data-empty",
    "true",
  );
});

test("region debug borders keep the same box geometry", async ({ page }) => {
  await page.goto("/dev/table-layout");
  const region = page.getByTestId("lab-region-hand-bottom");
  const tile = page.getByTestId("lab-slot-hand-bottom-12");
  const before = { region: await region.boundingBox(), tile: await tile.boundingBox() };
  await page.getByText("showRegions", { exact: true }).locator("input").uncheck();
  expect({ region: await region.boundingBox(), tile: await tile.boundingBox() }).toEqual(before);
  await expect(region).toHaveCSS("padding", "0px");
  await expect(region).toHaveCSS("border-width", "2px");
  await expect(page.getByTestId("lab-region-content-wall-bottom")).toHaveCSS("padding", "0px");

  // The meld/info band intentionally spans the full ring width (no inlineInsetPct) so its
  // sub-regions aren't squeezed — it no longer needs to align with the discard ring below it.
  const wallContent = await page.getByTestId("lab-region-content-wall-bottom").boundingBox();
  const wallRegion = await page.getByTestId("lab-region-wall-bottom").boundingBox();
  expect(wallContent).not.toBeNull();
  expect(wallRegion).not.toBeNull();
  expect(Math.abs(wallContent!.x - wallRegion!.x)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(wallContent!.y - wallRegion!.y)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(wallContent!.width - wallRegion!.width)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(wallContent!.height - wallRegion!.height)).toBeLessThanOrEqual(0.5);
});

test("wall and discard occupied tiles stay separate and inside the board", async ({ page }) => {
  await page.goto("/dev/table-layout");
  for (const preset of ["14×2", "8×3", "6×4"]) {
    await page.getByRole("button", { name: preset, exact: true }).click();
    const result = await page.evaluate(() => {
      const board = document
        .querySelector('[data-testid="layout-lab-board"]')!
        .getBoundingClientRect();
      const collect = (area: string) =>
        [...document.querySelectorAll(`[data-testid^="lab-slot-${area}-"]:not([data-empty])`)].map(
          (element) => ({
            id: element.getAttribute("data-testid"),
            box: element.getBoundingClientRect(),
          }),
        );
      const wall = collect("wall");
      const discard = collect("discard");
      const inside = [...wall, ...discard].every(
        ({ box }) =>
          box.left >= board.left &&
          box.top >= board.top &&
          box.right <= board.right &&
          box.bottom <= board.bottom,
      );
      const intersections = wall.flatMap((a) =>
        discard
          .filter(
            (b) =>
              a.box.left < b.box.right &&
              a.box.right > b.box.left &&
              a.box.top < b.box.bottom &&
              a.box.bottom > b.box.top,
          )
          .map((b) => `${a.id}/${b.id}`),
      );
      return { inside, intersections };
    });
    expect(result, preset).toEqual({ inside: true, intersections: [] });
  }
});
