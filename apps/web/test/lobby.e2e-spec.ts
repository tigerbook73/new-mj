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

async function openVariant(page: Page, name: "垃圾胡" | "血战到底") {
  await page.getByRole("tab", { name }).click();
  await expect(page.getByRole("tab", { name })).toHaveAttribute("aria-selected", "true");
}

async function createRoom(page: Page, name: string) {
  await page.getByRole("button", { name: "Create room" }).last().click();
  await page.getByLabel("Room name").fill(name);
  await page.getByRole("button", { name: "Create room" }).click();
}

// Shared by every test below where a second person finds an already-created
// room from the lobby list and opens its preview. The explicit Refresh click
// is belt-and-suspenders — lobby:changed already triggers a live refresh
// (see "a newly created room appears live..." below) — kept here so this
// helper doesn't race that push's timing in tests that don't care about it.
// Doesn't sit down; call `sitAt` afterward for tests that need an occupied seat.
async function openRoomAsGuest(guest: Page, roomName: string) {
  await openVariant(guest, "垃圾胡");
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

  await openVariant(host, "垃圾胡");
  await createRoom(host, "Four players");
  await expect(host).toHaveURL(/\/lobby\/[0-9a-f-]{36}$/);

  for (const [page, seat] of [
    [p2, 1],
    [p3, 2],
    [p4, 3],
  ] as const) {
    await openVariant(page, "垃圾胡");
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
  await expect(host.getByRole("img", { name: "Ready" })).toHaveCount(4, { timeout: 10_000 });
  await host.getByRole("button", { name: "Start game" }).click();
  for (const page of players) await expect(page).toHaveURL(/\/room\//, { timeout: 10_000 });
  for (const page of players) await page.context().close();
});

test("host ready fills empty waiting seats with bots and starts", async ({ browser }) => {
  const page = await loginAs(browser, "solo-host");
  await openVariant(page, "垃圾胡");
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
  await openVariant(page, "垃圾胡");
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
  await openVariant(page, "血战到底");
  await expect(page.getByText("No open rooms found.")).toBeVisible();
  await openVariant(page, "垃圾胡");
  await page.context().close();
});

test("a newly created room appears live in another browser's lobby, no refresh needed", async ({
  browser,
}) => {
  const [viewer, creator] = await Promise.all([
    loginAs(browser, "roompush-viewer"),
    loginAs(browser, "roompush-creator"),
  ]);
  await openVariant(viewer, "垃圾胡");
  await openVariant(creator, "垃圾胡");

  await createRoom(creator, "Live pushed room");
  await expect(creator).toHaveURL(/\/lobby\//, { timeout: 10_000 });

  // No Refresh click — this must arrive via lobby:changed alone (viewer
  // re-issuing its own lobby:list query on receipt).
  await expect(viewer.getByRole("button", { name: "Live pushed room" })).toBeVisible({
    timeout: 10_000,
  });
  await viewer.context().close();
  await creator.context().close();
});

test("a room disappears live from another browser's lobby once it starts or its host closes it", async ({
  browser,
}) => {
  const [viewer, starter, closer] = await Promise.all([
    loginAs(browser, "roomgone-viewer"),
    loginAs(browser, "roomgone-starter"),
    loginAs(browser, "roomgone-closer"),
  ]);
  await openVariant(viewer, "垃圾胡");
  await openVariant(starter, "垃圾胡");
  await openVariant(closer, "垃圾胡");

  // Case 1: starting a full room removes it from the lobby (no longer
  // `waiting`) — three bots fill it out, host readies and starts.
  await createRoom(starter, "About to start");
  await expect(starter).toHaveURL(/\/lobby\//, { timeout: 10_000 });
  await expect(viewer.getByRole("button", { name: "About to start" })).toBeVisible({
    timeout: 10_000,
  });
  await starter.getByRole("checkbox", { name: "Ready" }).check();
  await expect(starter.getByText("BOT")).toHaveCount(3);
  await starter.getByRole("button", { name: "Start game" }).click();
  await expect(starter).toHaveURL(/\/room\//, { timeout: 10_000 });
  await expect(viewer.getByRole("button", { name: "About to start" })).toHaveCount(0, {
    timeout: 10_000,
  });

  // Case 2: the host closing a still-waiting room removes it too.
  await createRoom(closer, "About to close");
  await expect(closer).toHaveURL(/\/lobby\//, { timeout: 10_000 });
  await expect(viewer.getByRole("button", { name: "About to close" })).toBeVisible({
    timeout: 10_000,
  });
  await closer.getByRole("button", { name: "Leave room" }).click();
  await expect(closer).toHaveURL(/\/games$/, { timeout: 10_000 });
  await expect(viewer.getByRole("button", { name: "About to close" })).toHaveCount(0, {
    timeout: 10_000,
  });

  await viewer.context().close();
  await starter.context().close();
  await closer.context().close();
});

test("a pushed room for a different ruleset never appears in the viewer's list", async ({
  browser,
}) => {
  const [viewer, creator] = await Promise.all([
    loginAs(browser, "roompush-filter-viewer"),
    loginAs(browser, "roompush-filter-creator"),
  ]);
  // Viewer is on a *different* ruleset tab than the room being created — this
  // is a global broadcast (every connected socket), so the client-side
  // rulesetId filter is the only thing keeping it out.
  await openVariant(viewer, "血战到底");
  await openVariant(creator, "垃圾胡");
  await createRoom(creator, "Wrong ruleset room");
  await expect(creator).toHaveURL(/\/lobby\//, { timeout: 10_000 });
  await viewer.waitForTimeout(500);
  await expect(viewer.getByRole("button", { name: "Wrong ruleset room" })).toHaveCount(0);

  // Switching to the matching tab triggers the normal lobby:list query (not
  // the push, which only ever fires once, at creation time) and finds it —
  // proving the room really was created, just correctly never pushed here.
  await openVariant(viewer, "垃圾胡");
  await expect(viewer.getByRole("button", { name: "Wrong ruleset room" })).toBeVisible({
    timeout: 10_000,
  });

  await viewer.context().close();
  await creator.context().close();
});

test("each variant tab's own info icon opens that variant's info page directly", async ({
  browser,
}) => {
  const page = await loginAs(browser, "rules-link-host");
  // "垃圾胡" is the initially-selected tab — its info icon works from there.
  await page.getByRole("link", { name: "垃圾胡 玩法规则" }).click();
  await expect(page).toHaveURL(/\/variants\/junk$/);
  await expect(page.getByRole("heading", { name: "垃圾胡" })).toBeVisible();

  // "血战到底"'s own icon works without ever selecting that tab first — each
  // icon is independent of which tab is currently active.
  await page.getByRole("link", { name: "返回大厅" }).click();
  await expect(page).toHaveURL(/\/games$/);
  await page.getByRole("link", { name: "血战到底 玩法规则" }).click();
  await expect(page).toHaveURL(/\/variants\/bloodbattle$/);
  await expect(page.getByRole("heading", { name: "血战到底" })).toBeVisible();
  await page.context().close();
});

test("a guest can leave a waiting room and return to the lobby", async ({ browser }) => {
  const [host, guest] = await Promise.all([
    loginAs(browser, "leave-host"),
    loginAs(browser, "leave-guest"),
  ]);
  await openVariant(host, "垃圾胡");
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
  await openVariant(host, "垃圾胡");
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
  await openVariant(page, "垃圾胡");
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
  await openVariant(page, "垃圾胡");
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
  await openVariant(host, "垃圾胡");
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
  await openVariant(host, "垃圾胡");
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
  await openVariant(host, "垃圾胡");
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
  await openVariant(page, "垃圾胡");
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
  await openVariant(page, "血战到底");
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
  await openVariant(host, "垃圾胡");
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
  // No explicit timeout here defaults to expect()'s global 5s, tighter than
  // the 10s used elsewhere in this file for waits of comparable weight (a
  // server round-trip + navigation) — under full-suite/multi-worker
  // contention that's been observed to flake (see docs/process/plan.md's
  // former note on this test). Match the file's existing generous convention.
  await expect(host).toHaveURL(/\/games$/, { timeout: 15_000 });
  await expect(guest).toHaveURL(/\/room\//, { timeout: 15_000 });
  await host.context().close();
  await guest.context().close();
});

test("force exiting an in-game room ends the session for every player", async ({ browser }) => {
  const [host, guest] = await Promise.all([
    loginAs(browser, "force-exit-host"),
    loginAs(browser, "force-exit-guest"),
  ]);
  await openVariant(host, "垃圾胡");
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
  // (see the sibling "leaving" test above for why 15s, not the implicit 5s default.)
  await expect(host).toHaveURL(/\/games$/, { timeout: 15_000 });
  // ...while everyone still on the table page lands on the settlement screen,
  // not a stuck mid-round UI.
  await expect(guest.getByTestId("session-finished-overlay")).toBeVisible({ timeout: 15_000 });
  await host.context().close();
  await guest.context().close();
});
