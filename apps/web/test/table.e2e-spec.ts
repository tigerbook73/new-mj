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
  rulesetId: "junk" | "bloodbattle" | "hangzhou",
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

  const variant =
    rulesetId === "junk" ? "垃圾胡" : rulesetId === "bloodbattle" ? "血战到底" : "杭州麻将";
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
  await expect(host.getByRole("img", { name: "Ready" })).toHaveCount(4, { timeout: 10_000 });
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
  // `hand-tile`'s testid sits on TileMotion (Tile.tsx's middle layer — see its
  // own docs for why); `cursor-pointer`/`hover:scale-*` are TileFace's own
  // plain CSS, one layer further in, so these read the first child instead of
  // the located node itself.
  await handTiles.first().hover();
  await expect
    .poll(() =>
      handTiles.first().evaluate((tile) => getComputedStyle(tile.firstElementChild!).cursor),
    )
    .toBe("pointer");
  // Regression: `hover:scale-*` is plain CSS on TileFace (not motion) — see
  // its own docs for why splitting Tile.tsx into layers let this move back
  // off motion's `whileHover` without the old inline-style-vs-CSS-class
  // conflict. Tailwind's `scale` utility writes the modern standalone CSS
  // `scale` property (not the legacy `transform` property they visually
  // compose with) — `getComputedStyle(...).transform` would read "none"
  // even while genuinely scaled, so this checks `scale` instead.
  await expect
    .poll(() =>
      handTiles.first().evaluate((tile) => getComputedStyle(tile.firstElementChild!).scale),
    )
    .not.toBe("1");
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

// Regression: the store's `room` (what TableView reads player nicknames
// from) used to only ever get written once, back when LobbyView first
// entered/created the room — seats filled afterward (bots added, other
// players sitting down) only updated LobbyView's own local `preview`
// state, never the store. So by the time game:snapshot navigated into
// /room/:id, TableView still saw those seats as null and InfoSlot fell
// back to "Seat N" instead of the real nickname (LobbyView.tsx's onSnapshot
// now re-syncs the store from `preview` right before navigating).
test("opponent seats show their real nickname on the table, not the Seat N fallback", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const host = await context.newPage();
  await host.goto("/login");
  await host.getByPlaceholder("Enter nickname").fill("infoslot-nick-host");
  await host.getByRole("button", { name: "Enter game" }).click();
  await expect(host).toHaveURL(/\/games$/, { timeout: 10_000 });
  await host.getByRole("tab", { name: "垃圾胡" }).click();
  await host.getByRole("button", { name: "Create room" }).last().click();
  await host.getByLabel("Room name").fill("infoslot nickname room");
  await host.getByRole("button", { name: "Create room" }).click();
  await expect(host).toHaveURL(/\/lobby\//, { timeout: 10_000 });
  // Readying solo auto-fills the other three seats with bots (see lobby.e2e-
  // spec.ts's "host ready fills empty waiting seats with bots and starts").
  await host.getByRole("checkbox", { name: "Ready" }).check();
  await expect(host.getByText("BOT")).toHaveCount(3);
  await host.getByRole("button", { name: "Start game" }).click();
  await expect(host).toHaveURL(/\/room\//, { timeout: 10_000 });

  for (const direction of ["top", "left", "right"]) {
    const info = host.getByTestId(`player-info-${direction}`);
    await expect(info).toContainText("AI-", { timeout: 10_000 });
    await expect(info).not.toContainText(/^Seat \d$/);
  }
  await host.context().close();
});

// Phase 5 follow-up: discarding a hand tile unmounts exactly that instance
// (HandRow.tsx keys revealed hand tiles by their own TileId, not position —
// see the comment there) so the tiles after it glide into the closed-up gap
// via motion's `layout` (Tile.tsx's `reflow` prop) instead of silently
// swapping to the next tile's face. Verified by hand first via a raw
// transform trace on the tile that shifts into the vacated first slot,
// showing a smooth non-identity `transform` (translateX) decaying to `none`
// over ~300ms rather than an instant snap.
test("discarding a hand tile makes the rest glide into the closed-up gap", async ({ browser }) => {
  const { players } = await createAndStartRoom(browser, "junk", "junk-reflow");
  const [host] = players;
  try {
    const handTiles = host.getByTestId("hand-tile");
    await expect(handTiles.first()).toBeVisible({ timeout: 10_000 });
    // handTiles is sorted (see the existing "discard succeeds" test above),
    // so the second tile is guaranteed to shift left into the first tile's
    // slot once the first is discarded.
    const shiftingTileId = await handTiles.nth(1).getAttribute("data-tile-id");

    // expect.poll's interval isn't tight enough to reliably catch a ~300ms
    // transition window (the reflow can start and finish between two of its
    // polls) — start a tight rAF-driven trace on the page itself, right
    // before triggering the discard, same technique used to verify this by
    // hand first.
    const tracePromise = host.evaluate((tileId) => {
      return new Promise<string[]>((resolve) => {
        const values: string[] = [];
        const start = performance.now();
        function tick() {
          const el = document.querySelector(`[data-hand-token="tile:${tileId}"]`);
          if (el) values.push(getComputedStyle(el).transform);
          // Generous window: under heavy parallel test load the click→server
          // roundtrip→re-render latency before the transition even starts
          // can eat well into a tighter budget, leaving too little of it for
          // the actual ~300ms transition to finish and settle within.
          if (performance.now() - start < 1500) requestAnimationFrame(tick);
          else resolve(values);
        }
        requestAnimationFrame(tick);
      });
    }, shiftingTileId);
    await handTiles.first().click();
    const trace = await tracePromise;

    expect(trace.some((value) => value !== "none")).toBe(true);
    expect(trace.at(-1)).toBe("none");
  } finally {
    for (const page of players) await page.context().close();
  }
});

// Regression: an opponent's hand row must never visibly slide as a block.
// HandRow's `reflow` (motion's `layout`) used to be unconditional, including
// on opponents' anonymous position-keyed filler tiles — when a claim (chi/
// peng) pulls tiles out of their concealed hand, handCount shrinks, the
// surviving filler slots keep the same `slot-${index}` key (so they're the
// same persistent element, not a fresh mount) and just land at a new
// right-anchored position, and with `layout` on that reads as their entire
// hand sliding as one block. There's nothing meaningful to animate there
// (none of those tiles represent an identifiable gap closing, unlike a
// tileId-keyed real hand tile) — fixed by scoping `reflow` to `revealed`
// (my own row) only.
test(
  "an opponent's hand does not visibly slide when a claim shrinks it",
  { tag: "@slow" },
  async ({ browser }) => {
    const { players } = await createAndStartRoom(browser, "junk", "junk-noslide");
    const [host, claimant, secondClaimant] = players;
    try {
      // host observes claimant (seat 1) at direction "right" — see seatLayout.ts's directionOf.
      const tracePromise = host.evaluate(() => {
        return new Promise<string[]>((resolve) => {
          const values: string[] = [];
          const start = performance.now();
          function tick() {
            // Tile.tsx is now three nested layers (TileSlot > TileMotion >
            // TileFace) — `layout` (and thus any transform this test watches
            // for) lives on the middle one, so this needs one more hop in than
            // before the split. Opponent filler tiles carry neither
            // `data-testid` nor `data-tile-id` (architecture iron rule 2 — no
            // concealed-hand identity may leak), so this stays a purely
            // structural selector rather than an attribute one.
            const firstFiller = document.querySelector(
              '[data-testid="player-track-right"] > div > div:first-child > div:first-child',
            );
            if (firstFiller) values.push(getComputedStyle(firstFiller).transform);
            if (performance.now() - start < 2000) requestAnimationFrame(tick);
            else resolve(values);
          }
          requestAnimationFrame(tick);
        });
      });

      await host.getByTestId("player-track-bottom").locator('[data-tile-id="4"]').click();

      const claimantDock = claimant.getByTestId("action-dock");
      await expect(claimantDock).toBeVisible({ timeout: 10_000 });
      await claimantDock.getByRole("button", { name: /^吃/ }).hover();
      await claimantDock.getByTestId("action-candidates").locator("button").first().click();

      const secondDock = secondClaimant.getByTestId("action-dock");
      await expect(secondDock).toBeVisible({ timeout: 10_000 });
      await secondDock.getByRole("button", { name: /^过/ }).click();

      await expect(claimantDock).toBeHidden({ timeout: 10_000 });
      await expect(secondDock).toBeHidden({ timeout: 10_000 });

      const trace = await tracePromise;
      expect(trace.every((value) => value === "none")).toBe(true);
    } finally {
      for (const page of players) await page.context().close();
    }
  },
);

// The discard that just landed plays a one-shot motion entry
// animation (Tile.tsx's `entering` prop, motion's initial/animate) only for
// a live, in-place update — not for the first snapshot after a reload, which
// resumes mid-game exactly like a reconnect and must never replay animations
// for events the viewer didn't watch happen (session-mechanics.md § "评审点
// I"). `data-entering` is a stable marker captured once at mount (Tile.tsx's
// `wasEntering` state) — motion's own inline style converges to the same
// settled opacity/transform either way, so it's the only thing left to
// assert on after the animation finishes.
test(
  "discard entry animation plays live but not after a reload mid-game",
  { tag: "@slow" },
  async ({ browser }) => {
    const { players } = await createAndStartRoom(browser, "junk", "junk-discard-anim");
    const [host] = players;
    try {
      const handTiles = host.getByTestId("hand-tile");
      await expect(handTiles.first()).toBeVisible({ timeout: 10_000 });
      const displayedTileIds = (await handTiles.evaluateAll((tiles) =>
        tiles.map((tile) => Number(tile.getAttribute("data-tile-id"))),
      )) as number[];
      const discardedTileId = displayedTileIds[0]!;
      await handTiles.first().click();

      const discardedTile = host
        .getByTestId("table-area-bottom")
        .locator(`[data-tile-id="${discardedTileId}"]`);
      await expect(discardedTile).toBeVisible({ timeout: 10_000 });
      await expect(discardedTile).toHaveAttribute("data-entering", "true");

      await host.reload();
      const discardedTileAfterReload = host
        .getByTestId("table-area-bottom")
        .locator(`[data-tile-id="${discardedTileId}"]`);
      await expect(discardedTileAfterReload).toBeVisible({ timeout: 10_000 });
      await expect(discardedTileAfterReload).not.toHaveAttribute("data-entering");
    } finally {
      for (const page of players) await page.context().close();
    }
  },
);

// 2B: a discarded tile flies from its hand position out to the discard pile,
// via a ghost clone measured at click time (HandRow.tsx's captureTileRect) —
// the source tile genuinely leaves the hand array, unlike a claim's permanent
// tombstone, so there's no live "from" element left by the time this mounts.
test(
  "a discarded tile flies out from hand via a ghost clone",
  { tag: "@slow" },
  async ({ browser }) => {
    // "junk-toss"/"junk-nomo" on purpose — see the deriveUserId truncation and
    // room-name substring-match notes above passAllClaims: neither may be a
    // literal prefix of the other, or of any other identityPrefix in this file.
    const { players } = await createAndStartRoom(browser, "junk", "junk-toss");
    const [host] = players;
    try {
      const handTiles = host.getByTestId("hand-tile");
      await expect(handTiles.first()).toBeVisible({ timeout: 10_000 });
      const discardedTileId = await handTiles.first().getAttribute("data-tile-id");
      await handTiles.first().click();

      const ghost = host.getByTestId("discard-flip-ghost");
      await expect(ghost).toBeVisible({ timeout: 10_000 });
      // Self-removes once its transition completes (onAnimationComplete).
      await expect(ghost).toBeHidden({ timeout: 10_000 });

      // The real discard-pile tile must have settled correctly — the whole
      // point of the ghost is that it never touched the real tile's own state.
      const landedTile = host
        .getByTestId("table-area-bottom")
        .locator(`[data-tile-id="${discardedTileId}"]`);
      await expect(landedTile).toBeVisible();
      await expect(landedTile).toHaveAttribute("data-entering", "true");
    } finally {
      for (const page of players) await page.context().close();
    }
  },
);

// Phase 5b: the pinned drawn-tile slot (HandRow's last slot) plays the same
// one-shot entry animation as a fresh discard, but needs a content-based key
// instead of array-growth to trigger a remount — see SeatContent.drawnSlotKey.
// TEST_GAME_SEED=121 gives the dealer TileId 4, seat 1 a legal chi/pass, AND
// seat 2 a legal pon/pass on it — the claim window only closes once every
// seat with a legal claim has responded, so both seat 1 and seat 2 must pass
// (not just the one this test cares about) before seat 1's turn actually
// advances into a draw.
async function passAllClaims(claimants: import("@playwright/test").Page[]) {
  for (const page of claimants) {
    const dock = page.getByTestId("action-dock");
    await expect(dock).toBeVisible({ timeout: 10_000 });
    await dock.getByRole("button", { name: /^过/ }).click();
    await expect(dock).toBeHidden({ timeout: 10_000 });
  }
}

test(
  "draw entry animation plays live but not after a reload mid-game",
  { tag: "@slow" },
  async ({ browser }) => {
    const { players } = await createAndStartRoom(browser, "junk", "junk-draw-anim");
    const [host, claimant, secondClaimant] = players;
    try {
      await host.getByTestId("player-track-bottom").locator('[data-tile-id="4"]').click();
      await passAllClaims([claimant, secondClaimant]);

      // The drawn slot's DrawnSlotTile always passes entering as "opacityOnly"
      // (never plain `true`) — DrawFlipGhost already sells the arrival's
      // physical motion, so the real tile skips scale/rise (see Tile.tsx's
      // `entering` docs and HandRow.tsx's DrawnSlotTile).
      const ownDrawnTile = claimant.getByTestId("hand-track-drawn-bottom");
      await expect(ownDrawnTile).toHaveAttribute("data-entering", "opacityOnly", {
        timeout: 10_000,
      });
      // Host sees the same draw from the opponent side — SeatContent's
      // "opp-{seat}-{handCount}" keying branch, distinct from the own-seat
      // "own-{tileId}" branch the assertion above exercises.
      const opponentDrawnTile = host.getByTestId("hand-track-drawn-right");
      await expect(opponentDrawnTile).toHaveAttribute("data-entering", "opacityOnly", {
        timeout: 10_000,
      });

      await claimant.reload();
      const ownDrawnTileAfterReload = claimant.getByTestId("hand-track-drawn-bottom");
      await expect(ownDrawnTileAfterReload).toBeVisible({ timeout: 10_000 });
      await expect(ownDrawnTileAfterReload).not.toHaveAttribute("data-entering");
    } finally {
      for (const page of players) await page.context().close();
    }
  },
);

// Merged with the discard case (was two separate tests, each paying a full
// 4-player room setup for what's really the same reduced-motion behavior
// exercised at two different points of the same turn): the discard lands
// first, then passing both claim windows advances into the next seat's draw.
test(
  "discard and draw entry animations are both suppressed under prefers-reduced-motion",
  { tag: "@slow" },
  async ({ browser }) => {
    const { players } = await createAndStartRoom(browser, "junk", "junk-drawrm", {
      reducedMotion: "reduce",
    });
    const [host, claimant, secondClaimant] = players;
    try {
      await host.getByTestId("player-track-bottom").locator('[data-tile-id="4"]').click();
      const discardedTile = host.getByTestId("table-area-bottom").locator('[data-tile-id="4"]');
      await expect(discardedTile).toBeVisible({ timeout: 10_000 });
      await expect(discardedTile).not.toHaveAttribute("data-entering");

      await passAllClaims([claimant, secondClaimant]);

      const ownDrawnTile = claimant.getByTestId("hand-track-drawn-bottom");
      await expect(ownDrawnTile).toBeVisible({ timeout: 10_000 });
      await expect(ownDrawnTile).not.toHaveAttribute("data-entering");
    } finally {
      for (const page of players) await page.context().close();
    }
  },
);

// Post-Phase-6 follow-up: a freshly drawn tile flies in from the table's
// center via a temporary clone (DrawFlipGhost.tsx, `data-testid="draw-flip-
// ghost"`) — same isolation principle as ClaimFlipGhost.tsx (measures once,
// portals a clone, self-removes; never touches the real pinned-slot tile's
// own animation state). Verified by hand first via a raw transform trace on
// the ghost element showing its scale rise past 1 to an overshoot peak
// (~1.4) before settling back to 1 while position converges to the hand
// slot, then the element disappearing.
test(
  "a drawn tile flies in from the center via a ghost clone",
  { tag: "@slow" },
  async ({ browser }) => {
    // Short, non-overlapping prefix on purpose — see the deriveUserId
    // 20-char-truncation note above passAllClaims, plus createAndStartRoom's
    // room-name lookup does a substring match, so this must not be a prefix of
    // "junk-dghorm" below (or vice versa) either.
    const { players } = await createAndStartRoom(browser, "junk", "junk-dwgho");
    const [host, claimant, secondClaimant] = players;
    try {
      await host.getByTestId("player-track-bottom").locator('[data-tile-id="4"]').click();
      await passAllClaims([claimant, secondClaimant]);

      const ghost = claimant.getByTestId("draw-flip-ghost");
      await expect(ghost).toBeVisible({ timeout: 10_000 });
      // Self-removes once its transition completes (onAnimationComplete).
      await expect(ghost).toBeHidden({ timeout: 10_000 });

      // The real pinned-slot tile must have settled correctly — the whole
      // point of the ghost is that it never touched the real tile's own state.
      // "opacityOnly" (not plain `true`) — see the draw-entry-animation test's
      // own note on why the drawn slot always uses it.
      const ownDrawnTile = claimant.getByTestId("hand-track-drawn-bottom");
      await expect(ownDrawnTile).toHaveAttribute("data-entering", "opacityOnly");
    } finally {
      for (const page of players) await page.context().close();
    }
  },
);

// Merged with the discard flip ghost case for the same reason as the entry-
// animation pair above — same reduced-motion context, same turn, two points
// in the same sequence.
test(
  "the discard and draw flip ghosts are both suppressed under prefers-reduced-motion",
  { tag: "@slow" },
  async ({ browser }) => {
    const { players } = await createAndStartRoom(browser, "junk", "junk-dghorm", {
      reducedMotion: "reduce",
    });
    const [host, claimant, secondClaimant] = players;
    try {
      await host.getByTestId("player-track-bottom").locator('[data-tile-id="4"]').click();
      const landedTile = host.getByTestId("table-area-bottom").locator('[data-tile-id="4"]');
      await expect(landedTile).toBeVisible({ timeout: 10_000 });
      await expect(host.getByTestId("discard-flip-ghost")).toHaveCount(0);

      await passAllClaims([claimant, secondClaimant]);

      const ownDrawnTile = claimant.getByTestId("hand-track-drawn-bottom");
      await expect(ownDrawnTile).toBeVisible({ timeout: 10_000 });
      await expect(claimant.getByTestId("draw-flip-ghost")).toHaveCount(0);
    } finally {
      for (const page of players) await page.context().close();
    }
  },
);

// Regression: a claimed discard's tombstone must visibly dim (architecture
// iron rule 4 — the claimed tile moves into a meld but leaves a dimmed
// tombstone in the river, it isn't removed). `dimmed` is plain CSS
// (`style.opacity`) on TileFace — the innermost of Tile.tsx's three layers —
// so it composes freely with the middle TileMotion layer's own motion
// `animate` without either fighting the other for the last write (see
// TileFace.tsx's docs). `[data-tile-id]` sits on TileMotion, one layer out
// from where `dimmed` actually applies, hence reading its first child below.
test("a claimed discard's tombstone visibly dims", { tag: "@slow" }, async ({ browser }) => {
  // Short prefix on purpose — see the deriveUserId 20-char-truncation note above passAllClaims.
  const { players } = await createAndStartRoom(browser, "junk", "junk-dim");
  const [host, claimant, secondClaimant] = players;
  try {
    await host.getByTestId("player-track-bottom").locator('[data-tile-id="4"]').click();

    const claimantDock = claimant.getByTestId("action-dock");
    await expect(claimantDock).toBeVisible({ timeout: 10_000 });
    await claimantDock.getByRole("button", { name: /^吃/ }).hover();
    await claimantDock.getByTestId("action-candidates").locator("button").first().click();

    // seat 2 also has a legal claim (pon) on this same discard — the window
    // only resolves once every eligible seat responds (see passAllClaims above).
    const secondDock = secondClaimant.getByTestId("action-dock");
    await expect(secondDock).toBeVisible({ timeout: 10_000 });
    await secondDock.getByRole("button", { name: /^过/ }).click();

    await expect(claimantDock).toBeHidden({ timeout: 10_000 });
    await expect(secondDock).toBeHidden({ timeout: 10_000 });

    const tombstone = host.getByTestId("table-area-bottom").locator('[data-tile-id="4"]');
    await expect(tombstone).toBeVisible({ timeout: 10_000 });
    await expect
      .poll(() => tombstone.evaluate((tile) => getComputedStyle(tile.firstElementChild!).opacity))
      .toBe("0.4");
    await expect(host.getByTestId("discard-claim-icon")).toHaveCount(1);
  } finally {
    for (const page of players) await page.context().close();
  }
});

// A newly formed meld's tiles play the same one-shot entry animation as a
// discard/draw — no per-tile targeting needed, since a brand new meld is a
// genuinely new `melds` array entry (see MeldGroup.tsx's `meldLedgerKey`).
test(
  "meld entry animation plays live but not after a reload mid-game",
  { tag: "@slow" },
  async ({ browser }) => {
    const { players } = await createAndStartRoom(browser, "junk", "junk-meld-anim");
    const [host, claimant, secondClaimant] = players;
    try {
      await host.getByTestId("player-track-bottom").locator('[data-tile-id="4"]').click();

      const claimantDock = claimant.getByTestId("action-dock");
      await expect(claimantDock).toBeVisible({ timeout: 10_000 });
      await claimantDock.getByRole("button", { name: /^吃/ }).hover();
      await claimantDock.getByTestId("action-candidates").locator("button").first().click();

      const secondDock = secondClaimant.getByTestId("action-dock");
      await expect(secondDock).toBeVisible({ timeout: 10_000 });
      await secondDock.getByRole("button", { name: /^过/ }).click();

      await expect(claimantDock).toBeHidden({ timeout: 10_000 });
      await expect(secondDock).toBeHidden({ timeout: 10_000 });

      const ownMeldTile = claimant.getByTestId("meld-track-bottom").locator('[data-tile-id="4"]');
      await expect(ownMeldTile).toHaveAttribute("data-entering", "true", { timeout: 10_000 });
      // Host sees the same new meld from the opponent side.
      const opponentMeldTile = host.getByTestId("meld-track-right").locator('[data-tile-id="4"]');
      await expect(opponentMeldTile).toHaveAttribute("data-entering", "true", { timeout: 10_000 });

      await claimant.reload();
      const ownMeldTileAfterReload = claimant
        .getByTestId("meld-track-bottom")
        .locator('[data-tile-id="4"]');
      await expect(ownMeldTileAfterReload).toBeVisible({ timeout: 10_000 });
      await expect(ownMeldTileAfterReload).not.toHaveAttribute("data-entering");
    } finally {
      for (const page of players) await page.context().close();
    }
  },
);

test(
  "meld entry animation is suppressed under prefers-reduced-motion",
  { tag: "@slow" },
  async ({ browser }) => {
    const { players } = await createAndStartRoom(browser, "junk", "junk-meldrm", {
      reducedMotion: "reduce",
    });
    const [host, claimant, secondClaimant] = players;
    try {
      await host.getByTestId("player-track-bottom").locator('[data-tile-id="4"]').click();

      const claimantDock = claimant.getByTestId("action-dock");
      await expect(claimantDock).toBeVisible({ timeout: 10_000 });
      await claimantDock.getByRole("button", { name: /^吃/ }).hover();
      await claimantDock.getByTestId("action-candidates").locator("button").first().click();

      const secondDock = secondClaimant.getByTestId("action-dock");
      await expect(secondDock).toBeVisible({ timeout: 10_000 });
      await secondDock.getByRole("button", { name: /^过/ }).click();

      await expect(claimantDock).toBeHidden({ timeout: 10_000 });
      await expect(secondDock).toBeHidden({ timeout: 10_000 });

      const ownMeldTile = claimant.getByTestId("meld-track-bottom").locator('[data-tile-id="4"]');
      await expect(ownMeldTile).toBeVisible({ timeout: 10_000 });
      await expect(ownMeldTile).not.toHaveAttribute("data-entering");
    } finally {
      for (const page of players) await page.context().close();
    }
  },
);

// The claimed tile flies from the discard pile into the meld via a
// temporary clone (ClaimFlipGhost.tsx, `data-testid="claim-flip-ghost"`),
// not motion's `layoutId` shared-layout system — see ClaimFlipGhost.tsx's
// own docs for why that was tried first and reverted. The ghost is fully
// decoupled — it measures both rects once, animates a portal clone between
// them, then removes itself; neither the tombstone nor the real meld tile's
// own animation state is ever touched. Verified by hand first (a raw
// transform trace on the ghost element showing it appear with a
// non-identity transform, decay to `none` over ~300ms, then disappear)
// before encoding the same signal as an automated check.
test("a claimed tile FLIPs from the discard pile into the meld via a ghost clone", async ({
  browser,
}) => {
  // "junk-flipgo" on purpose, not "junk-flip": the room-name button lookup in
  // createAndStartRoom uses a substring match, and "junk-flip" is itself a
  // prefix of "junk-fliprm" (the reduced-motion test below), which made
  // `getByRole("button", { name: roomName })` match both rooms' buttons at
  // once and fail with a strict-mode violation.
  const { players } = await createAndStartRoom(browser, "junk", "junk-flipgo");
  const [host, claimant, secondClaimant] = players;
  try {
    await host.getByTestId("player-track-bottom").locator('[data-tile-id="4"]').click();

    const claimantDock = claimant.getByTestId("action-dock");
    await expect(claimantDock).toBeVisible({ timeout: 10_000 });
    await claimantDock.getByRole("button", { name: /^吃/ }).hover();
    await claimantDock.getByTestId("action-candidates").locator("button").first().click();

    const secondDock = secondClaimant.getByTestId("action-dock");
    await expect(secondDock).toBeVisible({ timeout: 10_000 });
    await secondDock.getByRole("button", { name: /^过/ }).click();

    const ghost = claimant.getByTestId("claim-flip-ghost");
    // Mounting the ghost depends on a claim round-trip through the shared
    // e2e server (peng/chi resolution + broadcast), which under full-suite/
    // multi-worker contention can lag well past a plain 10s — see
    // docs/process/plan.md's former note on this test flaking there.
    await expect(ghost).toBeVisible({ timeout: 20_000 });
    // Self-removes once its transition completes (onAnimationComplete) — the
    // transition itself is only ~300ms, but under the same contention the
    // main thread/rAF can lag, so keep some headroom here too.
    await expect(ghost).toBeHidden({ timeout: 15_000 });

    // The real meld tile and the discard tombstone must both have settled
    // correctly — the whole point of the ghost is that neither one's own
    // animation state was ever touched by the flight.
    const meldTile = claimant.getByTestId("meld-track-bottom").locator('[data-tile-id="4"]');
    await expect(meldTile).toHaveAttribute("data-entering", "true");
    // `dimmed` lives on TileFace, one layer in from `[data-tile-id]`'s
    // TileMotion — see "a claimed discard's tombstone visibly dims"' own note.
    await expect
      .poll(() =>
        host
          .getByTestId("table-area-bottom")
          .locator('[data-tile-id="4"]')
          .evaluate((tile) => getComputedStyle(tile.firstElementChild!).opacity),
      )
      .toBe("0.4");
  } finally {
    for (const page of players) await page.context().close();
  }
});

test(
  "the claim FLIP ghost is suppressed under prefers-reduced-motion",
  { tag: "@slow" },
  async ({ browser }) => {
    const { players } = await createAndStartRoom(browser, "junk", "junk-fliprm", {
      reducedMotion: "reduce",
    });
    const [host, claimant, secondClaimant] = players;
    try {
      await host.getByTestId("player-track-bottom").locator('[data-tile-id="4"]').click();

      const claimantDock = claimant.getByTestId("action-dock");
      await expect(claimantDock).toBeVisible({ timeout: 10_000 });
      await claimantDock.getByRole("button", { name: /^吃/ }).hover();
      await claimantDock.getByTestId("action-candidates").locator("button").first().click();

      const secondDock = secondClaimant.getByTestId("action-dock");
      await expect(secondDock).toBeVisible({ timeout: 10_000 });
      await secondDock.getByRole("button", { name: /^过/ }).click();

      const meldTile = claimant.getByTestId("meld-track-bottom").locator('[data-tile-id="4"]');
      await expect(meldTile).toBeVisible({ timeout: 10_000 });
      await expect(claimant.getByTestId("claim-flip-ghost")).toHaveCount(0);
    } finally {
      for (const page of players) await page.context().close();
    }
  },
);

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
      // Action labels render as SVG viewBox text (scales with the button's own
      // box, not CSS font-size), so the responsive signal to check is the
      // button's own rendered height instead of a computed font-size.
      const actionButtonHeight = await passAction.evaluate(
        (element) => element.getBoundingClientRect().height,
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
      return { actionButtonHeight, candidateTileWidth };
    } finally {
      for (const page of players) await page.context().close();
    }
  };

  const largeViewport = await runClaim("pass");
  const compactViewport = await runClaim("chi");
  expect(largeViewport.actionButtonHeight).toBeGreaterThan(compactViewport.actionButtonHeight);
  expect(largeViewport.candidateTileWidth).toBeGreaterThan(compactViewport.candidateTileWidth);
});

// 触屏设备没有 hover 状态，onMouseEnter 永远不触发——多候选组的"预选高亮"
// 反馈会跳过，但 onClick 提交路径本身不依赖 selected 状态，理论上应该照样
// 能提交。这里用 hasTouch context 强制走 Playwright 的 tap()（触摸事件，非
// 鼠标事件的合成），覆盖单候选直提（分组按钮本身即目标）和多候选（tap 分组
// 展开候选 → 不经 hover/focus，直接 tap 候选）两条路径。
test(
  "junk claim dock submits via touch tap without any hover state",
  { tag: "@slow" },
  async ({ browser }) => {
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
  },
);

// 冒烟：血战刚进桌是"换三张/定缺"阶段（BloodbattlePhase 的 exchanging/
// choosing-lack），这两步的专属 UI 明确留到下一轮（phase-3-web-slice.md），
// 这里只验证公共骨架本身（手牌渲染、座位信息）在血战下也能正常工作，不要求
// 发出动作。
test("bloodbattle table renders the common skeleton", async ({ browser }) => {
  // Distinct identityPrefix from lobby.e2e-spec.ts's own "bloodbattle-host"
  // smoke test — both files' bloodbattle tests otherwise share the literal
  // nickname "bloodbattle-host", and the account-level concurrent-connection
  // guard (D27) kicks whichever logs in second when they land in the same
  // parallel batch.
  const { players } = await createAndStartRoom(browser, "bloodbattle", "bb-skeleton");
  const [host] = players;

  await expect(host.getByTestId("table-hud")).toBeVisible({ timeout: 10_000 });
  await expect(host.getByTestId("hand-tile").first()).toBeVisible({ timeout: 10_000 });

  for (const page of players) {
    await page.context().close();
  }
});

test("hangzhou table renders the common skeleton with the dealer streak chip", async ({
  browser,
}) => {
  const { players } = await createAndStartRoom(browser, "hangzhou", "hz-skeleton");
  const [host] = players;

  await expect(host.getByTestId("table-hud")).toBeVisible({ timeout: 10_000 });
  await expect(host.getByTestId("hand-tile").first()).toBeVisible({ timeout: 10_000 });
  // dealerStreak is hangzhou-only and always public once present — see
  // docs/variants/hangzhou.md §5; junk/bloodbattle never render this chip.
  await expect(host.getByTestId("dealer-streak-chip")).toBeVisible({ timeout: 10_000 });

  for (const page of players) {
    await page.context().close();
  }
});
