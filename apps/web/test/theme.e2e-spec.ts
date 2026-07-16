import { test, expect } from "@playwright/test";

// Pins the OS-level preference so the test doesn't depend on the runner's
// environment default — getInitialTheme() falls back to prefers-color-scheme
// only when localStorage has no explicit choice yet.
test.use({ colorScheme: "light" });

test("theme follows the system preference", async ({ page }) => {
  await page.goto("/login");
  const html = page.locator("html");
  await expect(html).not.toHaveClass(/dark/);
  await expect(page.getByRole("button", { name: "Toggle dark mode" })).toHaveCount(0);
});
