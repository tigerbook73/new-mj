import {
  test,
  expect,
  type Browser,
  type BrowserContextOptions,
  type Page,
} from "@playwright/test";

async function loginAs(
  browser: Browser,
  nickname: string,
  contextOptions: BrowserContextOptions = {},
): Promise<Page> {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByPlaceholder("Enter nickname").fill(nickname);
  await page.getByRole("button", { name: "Enter game" }).click();
  await expect(page).toHaveURL(/\/games$/, { timeout: 10_000 });
  return page;
}

async function createAndStartRoom(
  browser: Browser,
  rulesetId: "junk" | "bloodbattle",
  identityPrefix: string = rulesetId,
  contextOptions: BrowserContextOptions = {},
) {
  // Prefixed by rulesetId so the two callers below (junk/bloodbattle tests)
  // never collide on the same dev userId when Playwright runs them in
  // parallel workers (deriveUserId(nickname) is deterministic).
  const [host, p2, p3, p4]: [Page, Page, Page, Page] = await Promise.all([
    loginAs(browser, `${identityPrefix}-host`, contextOptions),
    loginAs(browser, `${identityPrefix}-p2`, contextOptions),
    loginAs(browser, `${identityPrefix}-p3`, contextOptions),
    loginAs(browser, `${identityPrefix}-p4`, contextOptions),
  ]);
  const players: [Page, Page, Page, Page] = [host, p2, p3, p4];
  const roomName = `Table test ${identityPrefix}`;

  const variant = rulesetId === "junk" ? "Junk Hu" : "Bloodbattle";
  await host.getByRole("tab", { name: variant }).click();
  await host.getByRole("button", { name: "Create room" }).last().click();
  await host.getByLabel("Room name").fill(roomName);
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
    await page.getByRole("button", { name: roomName }).click();
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

async function expectDesktopTableFits(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  const tablePage = page.getByTestId("table-page");
  const tableCore = page.getByTestId("table-core");
  await expect(tablePage).toBeVisible();
  await expect(tableCore).toBeVisible();
  await expect(page.getByTestId("table-center-status")).toBeVisible();
  for (const direction of ["top", "left", "right", "bottom"]) {
    await expect(page.getByTestId(`player-track-${direction}`)).toBeVisible();
    await expect(page.getByTestId(`player-info-${direction}`)).toBeVisible();
    await expect(page.getByTestId(`table-area-${direction}`)).toBeVisible();
  }

  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  expect(dimensions.scrollHeight).toBeLessThanOrEqual(dimensions.clientHeight);

  const coreBox = await tableCore.boundingBox();
  expect(coreBox).not.toBeNull();
  expect(coreBox!.x).toBeGreaterThanOrEqual(0);
  expect(coreBox!.y).toBeGreaterThanOrEqual(0);
  expect(coreBox!.x + coreBox!.width).toBeLessThanOrEqual(viewport.width);
  expect(coreBox!.y + coreBox!.height).toBeLessThanOrEqual(viewport.height);
}

// 3e 的核心验证：TableView 渲染 PlayerView 通用骨架，且能真的把一个动作发给
// server 并成功执行——不是只渲染静态数据。房主(座位0)在第 1 局天然是庄家
// （session-mechanics.md §5），游戏一开局就轮到他，所以他的手牌按钮应该立刻
// 可点。
test("junk desktop table fits both target viewports and a discard succeeds", async ({
  browser,
}) => {
  const { players } = await createAndStartRoom(browser, "junk", "junk-desktop");
  const [host] = players;

  // From the host's own view, "bottom" is always their own seat (seatAt(view.seat, "bottom") === view.seat).
  const myInfo = host.getByTestId("player-info-bottom");
  await expect(myInfo).toBeVisible({ timeout: 10_000 });
  const handTiles = host.getByTestId("hand-tile");
  await expect(handTiles.first()).toBeVisible({ timeout: 10_000 });
  await expectDesktopTableFits(host, { width: 1440, height: 900 });
  await expectDesktopTableFits(host, { width: 1366, height: 768 });
  // The structural child zones are transparent to input; the actual Tile must
  // receive hover so its clickable border feedback is visible before a discard.
  await handTiles.first().hover();
  await expect
    .poll(() => handTiles.first().evaluate((tile) => getComputedStyle(tile).cursor))
    .toBe("pointer");
  const tileCountBefore = await handTiles.count();
  const displayedTileIds = (await handTiles.evaluateAll((tiles) =>
    tiles.map((tile) => Number(tile.getAttribute("data-tile-id"))),
  )) as number[];
  expect(displayedTileIds.map((tileId) => Math.floor(tileId / 4))).toEqual(
    [...displayedTileIds].map((tileId) => Math.floor(tileId / 4)).sort((a, b) => a - b),
  );
  const discardedTileId = displayedTileIds[0]!;
  // The just-drawn tile is pinned outside the main "hand-tile" row (see HandTrack) — discarding
  // any tile clears my own justDrawn regardless of which one, so if it was pinned before this
  // discard, it rejoins the main row here and the row's own count doesn't shrink even though my
  // hand did.
  const drawnWasPinned =
    (await host.getByTestId("hand-track-drawn-bottom").getAttribute("data-empty")) === null;

  await handTiles.first().click();

  // 打出的这张牌从我手牌里消失，这来自 server 接受动作后广播的权威
  // snapshot，不依赖命令 ack 或事件推导。
  await expect(handTiles).toHaveCount(drawnWasPinned ? tileCountBefore : tileCountBefore - 1, {
    timeout: 10_000,
  });
  await expect(
    host.getByTestId("table-area-bottom").locator(`[data-tile-id="${discardedTileId}"]`),
  ).toBeVisible({ timeout: 10_000 });

  for (const page of players) {
    await page.context().close();
  }
});

test("junk claim dock submits a direct pass or a hovered multi-option chi", async ({ browser }) => {
  const runClaim = async (choice: "pass" | "chi") => {
    const { players } = await createAndStartRoom(browser, "junk", `junk-claim-${choice}`);
    const [host, claimant] = players;
    try {
      await claimant.setViewportSize(
        choice === "pass" ? { width: 1440, height: 900 } : { width: 1366, height: 768 },
      );
      // TEST_GAME_SEED=121 gives the dealer TileId 4 and seat 1 exactly
      // chi [2,9], chi [9,12], plus pass after that discard (verified in core).
      await host.getByTestId("player-track-bottom").locator('[data-tile-id="4"]').click();
      const dock = claimant.getByTestId("action-dock");
      await expect(dock).toBeVisible({ timeout: 10_000 });
      const passAction = dock.getByRole("button", { name: /^过/ });
      const chiAction = dock.getByRole("button", { name: /^吃/ });
      await expect(passAction).toBeVisible();
      await expect(chiAction).toBeVisible();
      const actionFontSize = await passAction.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).fontSize),
      );
      let candidateTileWidth: number;

      if (choice === "pass") {
        candidateTileWidth = await dock
          .getByTestId("action-candidates")
          .locator("[data-tile-id]")
          .first()
          .evaluate((element) => element.getBoundingClientRect().width);
        await passAction.focus();
        await passAction.press("Enter");
      } else {
        await chiAction.hover();
        await expect(dock.getByTestId("action-candidates")).toBeVisible();
        const firstCandidate = dock.getByRole("button", { name: "选择 吃：2, 9" });
        await expect(firstCandidate).toHaveAttribute("data-selected", "true");
        await expect(firstCandidate.getByTestId("action-target-tile")).toHaveAttribute(
          "data-tile-id",
          "4",
        );
        candidateTileWidth = await firstCandidate
          .getByTestId("action-target-tile")
          .evaluate((element) => element.getBoundingClientRect().width);
        // Leaving the Dock must not collapse the option chosen by hover.
        await claimant.mouse.move(1, 1);
        await expect(firstCandidate).toBeVisible();
        const candidate = dock.getByRole("button", { name: "选择 吃：9, 12" });
        await candidate.hover();
        await expect(dock.getByTestId("action-candidates")).toBeVisible();
        await expect(candidate).toHaveAttribute("data-selected", "true");
        await candidate.focus();
        await candidate.press("Space");
      }
      await expect(dock).toBeHidden({ timeout: 10_000 });
      return { actionFontSize, candidateTileWidth };
    } finally {
      for (const page of players) await page.context().close();
    }
  };

  const largeViewport = await runClaim("pass");
  const compactViewport = await runClaim("chi");
  expect(largeViewport.actionFontSize).toBeGreaterThan(compactViewport.actionFontSize);
  expect(largeViewport.candidateTileWidth).toBeGreaterThan(compactViewport.candidateTileWidth);
});

// 触屏设备没有 hover 状态，onMouseEnter 永远不触发——多候选组的"预选高亮"
// 反馈会跳过，但 onClick 提交路径本身不依赖 selected 状态，理论上应该照样
// 能提交。这里用 hasTouch context 强制走 Playwright 的 tap()（触摸事件，非
// 鼠标事件的合成），覆盖单候选直提（分组按钮本身即目标）和多候选（tap 分组
// 展开候选 → 不经 hover/focus，直接 tap 候选）两条路径。
test("junk claim dock submits via touch tap without any hover state", async ({ browser }) => {
  const runClaim = async (choice: "pass" | "chi") => {
    const { players } = await createAndStartRoom(browser, "junk", `junk-touch-${choice}`, {
      hasTouch: true,
    });
    const [host, claimant] = players;
    try {
      // TEST_GAME_SEED=121 gives the dealer TileId 4 and seat 1 exactly
      // chi [2,9], chi [9,12], plus pass after that discard (verified in core).
      await host.getByTestId("player-track-bottom").locator('[data-tile-id="4"]').click();
      const dock = claimant.getByTestId("action-dock");
      await expect(dock).toBeVisible({ timeout: 10_000 });

      if (choice === "pass") {
        const passAction = dock.getByRole("button", { name: /^过/ });
        await expect(passAction).toBeVisible();
        await passAction.tap();
      } else {
        const chiAction = dock.getByRole("button", { name: /^吃/ });
        await expect(chiAction).toBeVisible();
        // Multi-option group: a tap only expands the candidates, mirroring
        // the click branch in ActionDock's onClick handler — it must not
        // submit group[0] outright the way the single-candidate pass button
        // above does.
        await chiAction.tap();
        const candidates = dock.getByTestId("action-candidates");
        await expect(candidates).toBeVisible();
        await expect(dock).not.toBeHidden();
        const candidate = dock.getByRole("button", { name: "选择 吃：9, 12" });
        await expect(candidate).toBeVisible();
        // No hover/focus preceding this — the touch-only path never sets
        // data-selected, submission must still work from onClick alone.
        await candidate.tap();
      }
      await expect(dock).toBeHidden({ timeout: 10_000 });
    } finally {
      for (const page of players) await page.context().close();
    }
  };

  await runClaim("pass");
  await runClaim("chi");
});

// 冒烟：血战刚进桌是"换三张/定缺"阶段（BloodbattlePhase 的 exchanging/
// choosing-lack），这两步的专属 UI 明确留到下一轮（phase-3-web-slice.md），
// 这里只验证公共骨架本身（手牌渲染、座位信息）在血战下也能正常工作，不要求
// 发出动作。
test("bloodbattle table renders the common skeleton", async ({ browser }) => {
  const { players } = await createAndStartRoom(browser, "bloodbattle");
  const [host] = players;

  await expect(host.getByTestId("table-hud")).toBeVisible({ timeout: 10_000 });
  await expect(host.getByTestId("hand-tile").first()).toBeVisible({ timeout: 10_000 });

  for (const page of players) {
    await page.context().close();
  }
});
