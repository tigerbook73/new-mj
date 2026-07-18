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

async function createAndStartRoom(browser: Browser, rulesetId: "junk" | "bloodbattle") {
  // Prefixed by rulesetId so the two callers below (junk/bloodbattle tests)
  // never collide on the same dev userId when Playwright runs them in
  // parallel workers (deriveUserId(nickname) is deterministic).
  const [host, p2, p3, p4]: [Page, Page, Page, Page] = await Promise.all([
    loginAs(browser, `${rulesetId}-host`),
    loginAs(browser, `${rulesetId}-p2`),
    loginAs(browser, `${rulesetId}-p3`),
    loginAs(browser, `${rulesetId}-p4`),
  ]);
  const players: [Page, Page, Page, Page] = [host, p2, p3, p4];

  const variant = rulesetId === "junk" ? "Junk Hu" : "Bloodbattle";
  await host.getByRole("tab", { name: variant }).click();
  await host.getByRole("button", { name: "Create room" }).last().click();
  await host.getByLabel("Room name").fill("Table test");
  await host.getByRole("button", { name: "Create room" }).click();
  await expect(host).toHaveURL(/\/lobby\//, { timeout: 10_000 });
  const roomId = new URL(host.url()).pathname.split("/").at(-1)!;
  for (const [page, seat] of [
    [p2, 1],
    [p3, 2],
    [p4, 3],
  ] as const) {
    await page.getByRole("tab", { name: variant }).click();
    await page.getByRole("button", { name: "Refresh" }).click();
    await page.getByRole("button", { name: "Table test" }).click();
    await page
      .locator(`[data-seat="${seat + 1}"]`)
      .getByRole("button", { name: "Sit" })
      .click();
  }
  for (const page of players) {
    await page.getByRole("checkbox").check();
  }
  await expect(host.getByText("(Ready)")).toHaveCount(4, { timeout: 10_000 });
  await host.getByRole("button", { name: "Start game" }).click();

  for (const page of players) {
    await expect(page).toHaveURL(new RegExp(`/room/${roomId}$`), { timeout: 10_000 });
  }
  return { players, roomId };
}

// 3e 的核心验证：TableView 渲染 PlayerView 通用骨架，且能真的把一个动作发给
// server 并成功执行——不是只渲染静态数据。房主(座位0)在第 1 局天然是庄家
// （session-mechanics.md §5），游戏一开局就轮到他，所以他的手牌按钮应该立刻
// 可点。
test("junk table renders hands and a discard action succeeds", async ({ browser }) => {
  const { players } = await createAndStartRoom(browser, "junk");
  const [host] = players;

  const myBadge = host.getByTestId("player-badge").filter({ hasText: "(you)" });
  await expect(myBadge).toBeVisible({ timeout: 10_000 });
  const handTiles = host.getByTestId("hand-tile");
  await expect(handTiles.first()).toBeVisible({ timeout: 10_000 });
  const tileCountBefore = await handTiles.count();

  await handTiles.first().click();

  // 打出的这张牌从我手牌里消失、座位手牌数同步减少（TileDiscarded 事实型事件
  // 驱动的增量更新，见 useSessionStore.applyTileDiscarded），不是等下一次快照
  // 才刷新——这两个断言本身就证明了动作真的被 server 接受，不需要额外去检查
  // 有没有报错文案。
  await expect(handTiles).toHaveCount(tileCountBefore - 1, { timeout: 10_000 });
  await expect(myBadge.getByTestId("player-hand-count")).toHaveText("13", { timeout: 10_000 });

  for (const page of players) {
    await page.context().close();
  }
});

// 冒烟：血战刚进桌是"换三张/定缺"阶段（BloodbattlePhase 的 exchanging/
// choosing-lack），这两步的专属 UI 明确留到下一轮（phase-3-web-slice.md），
// 这里只验证公共骨架本身（手牌渲染、座位信息）在血战下也能正常工作，不要求
// 发出动作。
test("bloodbattle table renders the common skeleton", async ({ browser }) => {
  const { players } = await createAndStartRoom(browser, "bloodbattle");
  const [host] = players;

  await expect(host.getByText(/^Table \(Seat/)).toBeVisible({ timeout: 10_000 });
  await expect(host.getByTestId("hand-tile").first()).toBeVisible({ timeout: 10_000 });

  for (const page of players) {
    await page.context().close();
  }
});
