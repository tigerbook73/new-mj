import { test, expect } from "@playwright/test";

test("root redirects to /login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

// router.tsx's protectedLoader(kind) is the single gate behind /games,
// /lobby/:roomId, /room/:roomId (and /replay) — ensureConnected() throws
// redirect("/login") the same way regardless of kind when there's no token
// at all, so a bogus room id here never gets far enough to matter.
test("unauthenticated deep links to protected routes redirect to /login", async ({ page }) => {
  await page.goto("/games");
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/lobby/00000000-0000-0000-0000-000000000000");
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/room/00000000-0000-0000-0000-000000000000");
  await expect(page).toHaveURL(/\/login$/);
});

// Phase 5 smoke test: only checks the OAuth entry points render — actually
// clicking through needs a real Supabase project + Google/GitHub OAuth
// client secrets this sandbox doesn't have.
test("the Google and GitHub sign-in buttons render on /login", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in with GitHub" })).toBeVisible();
});

// 3c 的核心验证：web 端 jose 签的开发态假 token 真的能被 server 的
// auth.middleware（@nestjs/jwt）校验通过——这是全计划里"最大的不确定性"，
// 这条用例连的是真实起的 apps/server（playwright.config.ts 的 webServer）。
test("logging in with a nickname connects and lands on /games", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("Enter nickname").fill("Test Player");
  await page.getByRole("button", { name: "Enter game" }).click();
  await expect(page).toHaveURL(/\/games$/, { timeout: 10_000 });
});

test("submitting an empty nickname shows an inline error and does not navigate", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Enter game" }).click();
  await expect(page.getByText("Please enter a nickname")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("signing out clears the session and returns to login", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("Enter nickname").fill("Signout Player");
  await page.getByRole("button", { name: "Enter game" }).click();
  await expect(page).toHaveURL(/\/games$/, { timeout: 10_000 });
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "Enter game" })).toBeVisible();
});

// D27 (session-mechanics.md "账号级并发连接约束") — three-way arbitration by
// tabId/browserId, no more client-side "probably my own stale connection" guess.

test("refreshing the same tab reconnects silently, no session-blocked / no prompt", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByPlaceholder("Enter nickname").fill("Refresh Player");
  await page.getByRole("button", { name: "Enter game" }).click();
  await expect(page).toHaveURL(/\/games$/, { timeout: 10_000 });

  await page.reload();

  await expect(page).toHaveURL(/\/games$/, { timeout: 10_000 });
});

test("opening /login with a saved dev session restores directly to /games", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("Enter nickname").fill("Saved Session Player");
  await page.getByRole("button", { name: "Enter game" }).click();
  await expect(page).toHaveURL(/\/games$/, { timeout: 10_000 });

  // A full navigation recreates the app while preserving this tab's
  // localStorage identity. Once bootstrap restores the socket, LoginView
  // must not leave a live authenticated session sitting on the login form.
  await page.goto("/login");

  await expect(page).toHaveURL(/\/games$/, { timeout: 10_000 });
});

// devAuth.ts's readDevSession() only returns a session when the stored value
// is valid JSON with a `token` field — a garbage string, or a syntactically-
// fine JWT that server-side verification rejects, both end up going through
// doConnect()'s `if (!result.ok) throw redirect("/login")` fallback. Neither
// path clears the bad value from localStorage (that only happens on a
// *successful* connect or an explicit sign-out) — the point of this test is
// that landing on /login afterward still renders a normal, usable form
// rather than a stuck loader or a blank page, even with that stale value
// still sitting there.
test("a corrupted session token in localStorage falls back to the login form, not a stuck or blank page", async ({
  page,
}) => {
  await page.goto("/login");
  await page.evaluate(() => {
    localStorage.setItem(
      "new-mj:dev-session",
      JSON.stringify({ token: "not-a-real-jwt", nickname: "Ghost Player" }),
    );
  });

  await page.goto("/games");

  await expect(page).toHaveURL(/\/login$/, { timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Enter game" })).toBeVisible();
  await expect(page.getByPlaceholder("Enter nickname")).toBeEditable();
});

// server-truth restore (session:identity's activeRoom + the /games loader,
// router.tsx): a cold reload must land back on the actual room/table, not
// strand on /games or hang on TableView's "Waiting for game data…".

test("refreshing while in an in-game room lands back on the table with data already populated", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByPlaceholder("Enter nickname").fill("Restore Table Host");
  await page.getByRole("button", { name: "Enter game" }).click();
  await expect(page).toHaveURL(/\/games$/, { timeout: 10_000 });

  await page.getByRole("button", { name: "Create room" }).last().click();
  await page.getByLabel("Room name").fill("Restore table room");
  await page.getByRole("button", { name: "Create room" }).click();
  await expect(page).toHaveURL(/\/lobby\/[0-9a-f-]{36}$/);

  await page.locator('[data-seat="2"]').getByRole("button", { name: "Bot" }).click();
  await page.locator('[data-seat="3"]').getByRole("button", { name: "Bot" }).click();
  await page.locator('[data-seat="4"]').getByRole("button", { name: "Bot" }).click();
  await page.getByRole("checkbox", { name: "Ready" }).check();
  await page.getByRole("button", { name: "Start game" }).click();
  await expect(page).toHaveURL(/\/room\/[0-9a-f-]{36}$/, { timeout: 10_000 });
  const roomUrl = page.url();

  await page.reload();

  await expect(page).toHaveURL(roomUrl, { timeout: 10_000 });
  await expect(page.getByTestId("table-hud")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Waiting for game data…")).not.toBeVisible();
});

test("refreshing while in a waiting-phase room lands back on that room's lobby", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByPlaceholder("Enter nickname").fill("Restore Lobby Host");
  await page.getByRole("button", { name: "Enter game" }).click();
  await expect(page).toHaveURL(/\/games$/, { timeout: 10_000 });

  await page.getByRole("button", { name: "Create room" }).last().click();
  await page.getByLabel("Room name").fill("Restore lobby room");
  await page.getByRole("button", { name: "Create room" }).click();
  await expect(page).toHaveURL(/\/lobby\/[0-9a-f-]{36}$/);
  const lobbyUrl = page.url();

  await page.reload();

  await expect(page).toHaveURL(lobbyUrl, { timeout: 10_000 });
  await expect(page.getByText("Restore lobby room")).toBeVisible({ timeout: 10_000 });
});

test("a second tab in the same browser is hard-blocked into /session-blocked on load alone, no confirm prompt, no form needed", async ({
  page,
  context,
}) => {
  await page.goto("/login");
  await page.getByPlaceholder("Enter nickname").fill("Same Browser Player");
  await page.getByRole("button", { name: "Enter game" }).click();
  await expect(page).toHaveURL(/\/games$/, { timeout: 10_000 });

  // A fresh tab in the same browser context shares localStorage (the
  // dev-session token), so App.tsx's own session-restore effect picks it up
  // and hits the same-browser conflict on page load — no explicit re-login
  // needed to reproduce it.
  const second = await context.newPage();
  await second.goto("/login");

  await expect(second).toHaveURL(/\/session-blocked$/, { timeout: 10_000 });
  await expect(second.getByText(/already signed in on another tab/i)).toBeVisible();
  // The first tab's session is untouched — same-browser conflicts never kick it.
  await expect(page).toHaveURL(/\/games$/);
  await second.close();
});

test("a different browser is prompted; declining keeps the form usable with a cross-account hint", async ({
  page,
  browser,
}) => {
  await page.goto("/login");
  await page.getByPlaceholder("Enter nickname").fill("Cross Browser Player");
  await page.getByRole("button", { name: "Enter game" }).click();
  await expect(page).toHaveURL(/\/games$/, { timeout: 10_000 });

  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  other.on("dialog", (dialog) => void dialog.dismiss());
  await other.goto("/login");
  await other.getByPlaceholder("Enter nickname").fill("Cross Browser Player");
  await other.getByRole("button", { name: "Enter game" }).click();

  await expect(other).toHaveURL(/\/login$/);
  await expect(other.getByText(/signed in on a different browser/i)).toBeVisible();
  await expect(other.getByRole("button", { name: "Enter game" })).toBeVisible();
  await otherContext.close();
});

// Accepting the takeover prompt is the other half of connectWithTakeoverPrompt
// (shared/lib/socket.ts): the second connect attempt sets `takeover: true`,
// which auth.middleware.ts's registerSession() honors by emitting
// `session:kicked` to the *original* socket and force-disconnecting it, then
// registering the new one. The original tab doesn't navigate itself on
// `session:kicked` (sessionBootstrap.ts deliberately just resets store state
// and sets `kicked: true`, see its own docs) — RevalidateOnSessionLoss.tsx
// picks up the socket going from present to absent and revalidates the
// current route's loader, whose ensureConnected() then throws
// `redirect("/login")` because `kicked` is set. That's why this needs a
// generous timeout on the original tab: it's a real round trip (disconnect →
// revalidate → loader rerun), not an instant client-side redirect.
test("accepting the takeover prompt logs the new browser in and kicks the original to /login with a takeover notice", async ({
  page,
  browser,
}) => {
  await page.goto("/login");
  await page.getByPlaceholder("Enter nickname").fill("Takeover Player");
  await page.getByRole("button", { name: "Enter game" }).click();
  await expect(page).toHaveURL(/\/games$/, { timeout: 10_000 });

  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  other.on("dialog", (dialog) => void dialog.accept());
  await other.goto("/login");
  await other.getByPlaceholder("Enter nickname").fill("Takeover Player");
  await other.getByRole("button", { name: "Enter game" }).click();

  await expect(other).toHaveURL(/\/games$/, { timeout: 10_000 });
  await expect(page).toHaveURL(/\/login$/, { timeout: 10_000 });
  await expect(page.getByText(/taken over by another connection/i)).toBeVisible();
  await otherContext.close();
});
