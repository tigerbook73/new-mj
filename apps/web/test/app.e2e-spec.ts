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
