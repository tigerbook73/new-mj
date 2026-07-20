import { test, expect } from "@playwright/test";

test("root redirects to /login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

// Phase 5 smoke test: only checks the OAuth entry points render — actually
// clicking through needs a real Supabase project + Google/GitHub OAuth
// client secrets this sandbox doesn't have (see decisions.md phase 5 entry).
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
