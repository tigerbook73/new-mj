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

async function createRoom(page: Page, name: string) {
  await page.getByRole("button", { name: "Create room" }).last().click();
  await page.getByLabel("Room name").fill(name);
  await page.getByRole("button", { name: "Create room" }).click();
}

test("four players find a room, choose seats, ready up, and start", async ({ browser }) => {
  const [host, p2, p3, p4] = await Promise.all([
    loginAs(browser, "start-host"),
    loginAs(browser, "start-p2"),
    loginAs(browser, "start-p3"),
    loginAs(browser, "start-p4"),
  ]);

  await openVariant(host, "Junk Hu");
  await createRoom(host, "Four players");
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
    await page
      .locator(`[data-seat="${seat + 1}"]`)
      .getByRole("button", { name: "Sit" })
      .click();
  }

  const players = [host, p2, p3, p4];
  for (const page of players) await page.getByRole("checkbox", { name: "Ready" }).check();
  await expect(host.getByText("(Ready)")).toHaveCount(4, { timeout: 10_000 });
  await host.getByRole("button", { name: "Start game" }).click();
  for (const page of players) await expect(page).toHaveURL(/\/room\//, { timeout: 10_000 });
  for (const page of players) await page.context().close();
});

test("host can name a room and fill specifically selected seats with bots", async ({ browser }) => {
  const page = await loginAs(browser, "solo-host");
  await openVariant(page, "Junk Hu");
  await createRoom(page, "Solo table");
  await expect(page).toHaveURL(/\/lobby\//);
  await expect(page.getByText(/Owner:/)).toBeVisible();

  await page.locator('[data-seat="4"]').getByRole("button", { name: "Bot" }).click();
  await page.locator('[data-seat="2"]').getByRole("button", { name: "Bot" }).click();
  await page.locator('[data-seat="3"]').getByRole("button", { name: "Bot" }).click();
  await expect(page.getByText("BOT")).toHaveCount(3);
  await page.getByRole("checkbox", { name: "Ready" }).check();
  await page.getByRole("button", { name: "Start game" }).click();
  await expect(page).toHaveURL(/\/room\//, { timeout: 10_000 });
  await page.context().close();
});

test("switching tabs changes the active game lobby", async ({ browser }) => {
  const page = await loginAs(browser, "tabs-host");
  await openVariant(page, "Bloodbattle");
  await expect(page.getByText("No open rooms found.")).toBeVisible();
  await openVariant(page, "Junk Hu");
  await page.context().close();
});

test("a guest can leave a waiting room and return to the lobby", async ({ browser }) => {
  const [host, guest] = await Promise.all([
    loginAs(browser, "leave-host"),
    loginAs(browser, "leave-guest"),
  ]);
  await openVariant(host, "Junk Hu");
  await createRoom(host, "Guest leaves");
  await openVariant(guest, "Junk Hu");
  await guest.getByRole("button", { name: "Refresh" }).click();
  await guest.getByRole("button", { name: "Guest leaves" }).click();
  await guest.locator('[data-seat="2"]').getByRole("button", { name: "Sit" }).click();
  await guest.getByRole("button", { name: "Leave room" }).click();
  await expect(guest).toHaveURL(/\/games$/);
  await expect(host.locator('[data-seat="2"]').getByRole("button", { name: "Sit" })).toBeVisible();
  await host.context().close();
  await guest.context().close();
});

test("a visitor can leave a room preview without taking a seat", async ({ browser }) => {
  const [host, visitor] = await Promise.all([
    loginAs(browser, "preview-host"),
    loginAs(browser, "preview-visitor"),
  ]);
  await openVariant(host, "Junk Hu");
  await createRoom(host, "Preview only");
  await openVariant(visitor, "Junk Hu");
  await visitor.getByRole("button", { name: "Refresh" }).click();
  await visitor.getByRole("button", { name: "Preview only" }).click();
  await expect(
    visitor.locator('[data-seat="2"]').getByRole("button", { name: "Sit" }),
  ).toBeVisible();
  await visitor.getByRole("button", { name: "Leave room" }).click();
  await expect(visitor).toHaveURL(/\/games$/);
  await host.context().close();
  await visitor.context().close();
});

test("a player can switch to another empty seat in the same room", async ({ browser }) => {
  const page = await loginAs(browser, "seat-switcher");
  await openVariant(page, "Junk Hu");
  await createRoom(page, "Seat switch");
  await page.locator('[data-seat="2"]').getByRole("button", { name: "Sit" }).click();
  await page.locator('[data-seat="3"]').getByRole("button", { name: "Sit" }).click();
  await expect(page.locator('[data-seat="2"]').getByRole("button", { name: "Sit" })).toBeVisible();
  await expect(
    page.locator('[data-seat="3"]').getByRole("button", { name: "Sit" }),
  ).not.toBeVisible();
  await page.context().close();
});

test("the host can remove a bot from a waiting seat", async ({ browser }) => {
  const page = await loginAs(browser, "bot-remover");
  await openVariant(page, "Junk Hu");
  await createRoom(page, "Remove bot");
  await page.locator('[data-seat="2"]').getByRole("button", { name: "Bot" }).click();
  await expect(page.locator('[data-seat="2"]')).toContainText("BOT");
  await page.locator('[data-seat="2"]').getByRole("button", { name: "Remove" }).click();
  await expect(page.locator('[data-seat="2"]')).not.toContainText("BOT");
  await page.context().close();
});

test("the host can remove another player from a waiting room", async ({ browser }) => {
  const [host, guest] = await Promise.all([
    loginAs(browser, "remove-host"),
    loginAs(browser, "remove-guest"),
  ]);
  await openVariant(host, "Junk Hu");
  await createRoom(host, "Remove player");
  await openVariant(guest, "Junk Hu");
  await guest.getByRole("button", { name: "Refresh" }).click();
  await guest.getByRole("button", { name: "Remove player" }).click();
  await guest.locator('[data-seat="2"]').getByRole("button", { name: "Sit" }).click();
  await host.locator('[data-seat="2"]').getByRole("button", { name: "Remove" }).click();
  await expect(guest).toHaveURL(/\/games$/);
  await expect(guest.getByText("You were removed by the host.")).toBeVisible();
  await host.context().close();
  await guest.context().close();
});

test("the host leaving a waiting room closes it for everyone", async ({ browser }) => {
  const [host, guest] = await Promise.all([
    loginAs(browser, "close-host"),
    loginAs(browser, "close-guest"),
  ]);
  await openVariant(host, "Junk Hu");
  await createRoom(host, "Host leaves");
  await openVariant(guest, "Junk Hu");
  await guest.getByRole("button", { name: "Refresh" }).click();
  await guest.getByRole("button", { name: "Host leaves" }).click();
  await guest.locator('[data-seat="2"]').getByRole("button", { name: "Sit" }).click();
  await host.getByRole("button", { name: "Leave room" }).click();
  await host.getByRole("dialog").getByRole("button", { name: "Leave room" }).click();
  await expect(host).toHaveURL(/\/games$/);
  await expect(guest).toHaveURL(/\/games$/);
  await expect(guest.getByText("The host closed this room.")).toBeVisible();
  await host.context().close();
  await guest.context().close();
});

test("leaving an in-game room keeps the other human in the match", async ({ browser }) => {
  const [host, guest] = await Promise.all([
    loginAs(browser, "game-leave-host"),
    loginAs(browser, "game-leave-guest"),
  ]);
  await openVariant(host, "Junk Hu");
  await createRoom(host, "Game leaves");
  await host.locator('[data-seat="3"]').getByRole("button", { name: "Bot" }).click();
  await host.locator('[data-seat="4"]').getByRole("button", { name: "Bot" }).click();
  await openVariant(guest, "Junk Hu");
  await guest.getByRole("button", { name: "Refresh" }).click();
  await guest.getByRole("button", { name: "Game leaves" }).click();
  await guest.locator('[data-seat="2"]').getByRole("button", { name: "Sit" }).click();
  await host.getByRole("checkbox", { name: "Ready" }).check();
  await guest.getByRole("checkbox", { name: "Ready" }).check();
  await host.getByRole("button", { name: "Start game" }).click();
  await expect(host).toHaveURL(/\/room\//, { timeout: 10_000 });
  await expect(guest).toHaveURL(/\/room\//, { timeout: 10_000 });
  await host.getByRole("button", { name: "Leave room" }).click();
  await host.getByRole("dialog").getByRole("button", { name: "Leave room" }).click();
  await expect(host).toHaveURL(/\/games$/);
  await expect(guest).toHaveURL(/\/room\//);
  await host.context().close();
  await guest.context().close();
});
