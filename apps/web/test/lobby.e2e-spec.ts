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

// Shared by every test below where a second person finds an already-created
// room from the lobby list and opens its preview — refresh is needed because
// the list doesn't live-update on room creation. Doesn't sit down; call
// `sitAt` afterward for tests that need an occupied seat.
async function openRoomAsGuest(guest: Page, roomName: string) {
  await openVariant(guest, "Junk Hu");
  await guest.getByRole("button", { name: "Refresh" }).click();
  await guest.getByRole("button", { name: roomName }).click();
}

async function sitAt(page: Page, seat: 1 | 2 | 3 | 4) {
  await page.locator(`[data-seat="${seat}"]`).getByRole("button", { name: "Sit" }).click();
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

test("host ready fills empty waiting seats with bots and starts", async ({ browser }) => {
  const page = await loginAs(browser, "solo-host");
  await openVariant(page, "Junk Hu");
  await createRoom(page, "Solo table");
  await expect(page).toHaveURL(/\/lobby\//);
  await expect(page.getByText(/Owner:/)).toBeVisible();

  await page.getByRole("checkbox", { name: "Ready" }).check();
  await expect(page.getByText("BOT")).toHaveCount(3);
  await page.getByRole("button", { name: "Start game" }).click();
  await expect(page).toHaveURL(/\/room\//, { timeout: 10_000 });
  await page.context().close();
});

test("host can choose an allowed total-rounds session setting", async ({ browser }) => {
  const page = await loginAs(browser, "round-config-host");
  await openVariant(page, "Junk Hu");
  await page.getByRole("button", { name: "Create room" }).last().click();
  await page.getByLabel("Room name").fill("Eight rounds");
  await page.getByLabel("Total rounds").click();
  await page.getByRole("option", { name: "8" }).click();
  await page.getByRole("button", { name: "Create room" }).click();
  await expect(page.getByText("Rounds: 0 / 8")).toBeVisible();
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
  await openRoomAsGuest(guest, "Guest leaves");
  await sitAt(guest, 2);
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
  await openRoomAsGuest(visitor, "Preview only");
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
  await openRoomAsGuest(guest, "Remove player");
  await sitAt(guest, 2);
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
  await openRoomAsGuest(guest, "Host leaves");
  await sitAt(guest, 2);
  await host.getByRole("button", { name: "Leave room" }).click();
  await host.getByRole("dialog").getByRole("button", { name: "Leave room" }).click();
  await expect(host).toHaveURL(/\/games$/);
  await expect(guest).toHaveURL(/\/games$/);
  await expect(guest.getByText("The host closed this room.")).toBeVisible();
  await host.context().close();
  await guest.context().close();
});

// LobbyView.tsx only renders a seat's "Sit" button when `!player` — an
// occupied seat (bot or human) never shows one at all, so a full room has no
// error message to surface, just zero "Sit" buttons anywhere a fifth visitor
// looks.
test("a room with all four seats filled shows no sittable seat to a later visitor", async ({
  browser,
}) => {
  const [host, visitor] = await Promise.all([
    loginAs(browser, "full-host"),
    loginAs(browser, "full-visitor"),
  ]);
  await openVariant(host, "Junk Hu");
  await createRoom(host, "Full room");
  await host.locator('[data-seat="2"]').getByRole("button", { name: "Bot" }).click();
  await host.locator('[data-seat="3"]').getByRole("button", { name: "Bot" }).click();
  await host.locator('[data-seat="4"]').getByRole("button", { name: "Bot" }).click();
  await expect(host.getByText("BOT")).toHaveCount(3);

  await openRoomAsGuest(visitor, "Full room");
  await expect(visitor.getByRole("button", { name: "Sit" })).toHaveCount(0);
  await host.context().close();
  await visitor.context().close();
});

// canStart (LobbyView.tsx) is `players.every(isReady)` recomputed on every
// room update — unchecking Ready must disable Start game again immediately,
// not just leave it enabled from an earlier all-ready moment.
test("unchecking ready disables Start game again", async ({ browser }) => {
  const page = await loginAs(browser, "unready-host");
  await openVariant(page, "Junk Hu");
  await createRoom(page, "Unready room");

  const readyBox = page.getByRole("checkbox", { name: "Ready" });
  const startButton = page.getByRole("button", { name: "Start game" });
  await expect(startButton).toBeDisabled();

  await readyBox.check();
  await expect(page.getByText("BOT")).toHaveCount(3);
  await expect(startButton).toBeEnabled();

  await readyBox.uncheck();
  await expect(startButton).toBeDisabled();
  await page.context().close();
});

// junk has a real playable table; bloodbattle only has the shared public
// skeleton so far (apps/web/AGENTS.md) — this only smoke-tests that the
// bloodbattle room lifecycle itself (create/ready/start) works end to end,
// not any bloodbattle-specific table content.
test("a bloodbattle room can be created, readied, and started", async ({ browser }) => {
  const page = await loginAs(browser, "bloodbattle-host");
  await openVariant(page, "Bloodbattle");
  await createRoom(page, "Bloodbattle smoke");
  await expect(page).toHaveURL(/\/lobby\//);

  await page.getByRole("checkbox", { name: "Ready" }).check();
  await expect(page.getByText("BOT")).toHaveCount(3);
  await page.getByRole("button", { name: "Start game" }).click();
  await expect(page).toHaveURL(/\/room\//, { timeout: 10_000 });
  await expect(page.getByTestId("table-hud")).toBeVisible({ timeout: 10_000 });
  await page.context().close();
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
  await openRoomAsGuest(guest, "Game leaves");
  await sitAt(guest, 2);
  await host.getByRole("checkbox", { name: "Ready" }).check();
  await guest.getByRole("checkbox", { name: "Ready" }).check();
  await host.getByRole("button", { name: "Start game" }).click();
  await expect(host).toHaveURL(/\/room\//, { timeout: 10_000 });
  await expect(guest).toHaveURL(/\/room\//, { timeout: 10_000 });
  await host.getByTestId("table-hud").click();
  await host.getByRole("button", { name: "Leave room" }).click();
  await host.getByRole("dialog").getByRole("button", { name: "Hand off to AI" }).click();
  await expect(host).toHaveURL(/\/games$/);
  await expect(guest).toHaveURL(/\/room\//);
  await host.context().close();
  await guest.context().close();
});

test("force exiting an in-game room ends the session for every player", async ({ browser }) => {
  const [host, guest] = await Promise.all([
    loginAs(browser, "force-exit-host"),
    loginAs(browser, "force-exit-guest"),
  ]);
  await openVariant(host, "Junk Hu");
  await createRoom(host, "Force exit");
  await host.locator('[data-seat="3"]').getByRole("button", { name: "Bot" }).click();
  await host.locator('[data-seat="4"]').getByRole("button", { name: "Bot" }).click();
  await openRoomAsGuest(guest, "Force exit");
  await sitAt(guest, 2);
  await host.getByRole("checkbox", { name: "Ready" }).check();
  await guest.getByRole("checkbox", { name: "Ready" }).check();
  await host.getByRole("button", { name: "Start game" }).click();
  await expect(host).toHaveURL(/\/room\//, { timeout: 10_000 });
  await expect(guest).toHaveURL(/\/room\//, { timeout: 10_000 });

  await host.getByTestId("table-hud").click();
  await host.getByRole("button", { name: "Leave room" }).click();
  await host.getByRole("dialog").getByRole("button", { name: "Force exit" }).click();

  // The one who forced it navigates straight back to the game picker...
  await expect(host).toHaveURL(/\/games$/);
  // ...while everyone still on the table page lands on the settlement screen,
  // not a stuck mid-round UI.
  await expect(guest.getByTestId("session-finished-overlay")).toBeVisible({ timeout: 10_000 });
  await host.context().close();
  await guest.context().close();
});
