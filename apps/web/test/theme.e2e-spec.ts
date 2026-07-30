import { test, expect } from "@playwright/test";

// getInitialTheme() (shared/lib/theme.ts) reads *only*
// `window.matchMedia("(prefers-color-scheme: dark)")` — there's no
// localStorage override or manual toggle wired into the app today (see the
// `ThemeToggle` component's own note below); pinning `colorScheme` per test
// is what actually determines the outcome here, not any stored preference.

test.describe("theme follows the system preference — light", () => {
  test.use({ colorScheme: "light" });

  test("does not apply the dark class", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });
});

test.describe("theme follows the system preference — dark", () => {
  test.use({ colorScheme: "dark" });

  test("applies the dark class", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("html")).toHaveClass(/dark/);
  });
});

// `ThemeToggle` (shared/components/ThemeToggle.tsx) exists in the codebase
// but isn't imported/rendered anywhere in the app — so this isn't asserting
// a theme-preference fallback rule, just that the app currently has no
// manual toggle UI at all. If `ThemeToggle` ever gets mounted somewhere,
// this assertion needs to move to wherever it's rendered (and gains a real
// click-to-toggle test alongside it) rather than staying here unexamined.
test("no manual dark-mode toggle is rendered anywhere in the app today", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Toggle dark mode" })).toHaveCount(0);
});
