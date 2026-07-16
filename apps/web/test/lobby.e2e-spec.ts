import { test, expect, type Browser, type Page } from "@playwright/test";

async function loginAs(browser: Browser, nickname: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByPlaceholder("Enter nickname").fill(nickname);
  await page.getByRole("button", { name: "Enter game" }).click();
  await expect(page).toHaveURL(/\/games$/, { timeout: 10_000 });
  return page;
}

async function openVariant(page: Page, name: "Junk Hu" | "Bloodbattle") {
  await page.getByRole("tab", { name }).click();
  await expect(page.getByRole("tab", { name })).toHaveAttribute("aria-selected", "true");
}

test("four players find a room, choose seats, ready up, and start", async ({ browser }) => {
  const [host, p2, p3, p4] = await Promise.all([
    loginAs(browser, "host"),
    loginAs(browser, "p2"),
    loginAs(browser, "p3"),
    loginAs(browser, "p4"),
  ]);

  await openVariant(host, "Junk Hu");
  await host.getByLabel("Room name").fill("Four players");
  await host.getByRole("button", { name: "Create room" }).click();
  await expect(host).toHaveURL(/\/lobby\/[0-9a-f-]{36}$/);

  for (const [page, seat] of [
    [p2, 1],
    [p3, 2],
    [p4, 3],
  ] as const) {
    await openVariant(page, "Junk Hu");
    await page.getByRole("button", { name: "Refresh" }).click();
    await page.getByRole("button", { name: "Four players" }).click();
    await expect(page).toHaveURL(/\/lobby\//);
    await page.getByRole("button", { name: `Sit in seat ${seat + 1}` }).click();
  }

  const players = [host, p2, p3, p4];
  for (const page of players) await page.getByRole("checkbox", { name: "Ready" }).check();
  await expect(host.getByText("(Ready)")).toHaveCount(4, { timeout: 10_000 });
  await host.getByRole("button", { name: "Start game" }).click();
  for (const page of players) await expect(page).toHaveURL(/\/room\//, { timeout: 10_000 });
  for (const page of players) await page.context().close();
});

test("host can name a room and fill specifically selected seats with bots", async ({ browser }) => {
  const page = await loginAs(browser, "host");
  await openVariant(page, "Junk Hu");
  await page.getByLabel("Room name").fill("Solo table");
  await page.getByRole("button", { name: "Create room" }).click();
  await expect(page).toHaveURL(/\/lobby\//);

  await page.getByRole("button", { name: "Add bot to seat 4" }).click();
  await page.getByRole("button", { name: "Add bot to seat 2" }).click();
  await page.getByRole("button", { name: "Add bot to seat 3" }).click();
  await expect(page.getByText("(Bot)")).toHaveCount(3);
  await page.getByRole("checkbox", { name: "Ready" }).check();
  await page.getByRole("button", { name: "Start game" }).click();
  await expect(page).toHaveURL(/\/room\//, { timeout: 10_000 });
  await page.context().close();
});

test("switching tabs changes the active game lobby", async ({ browser }) => {
  const page = await loginAs(browser, "host");
  await openVariant(page, "Bloodbattle");
  await expect(page.getByText("No open rooms found.")).toBeVisible();
  await openVariant(page, "Junk Hu");
  await page.context().close();
});
