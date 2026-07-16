import { test, expect } from "@playwright/test";

// Pins the OS-level preference so the test doesn't depend on the runner's
// environment default — getInitialTheme() falls back to prefers-color-scheme
// only when localStorage has no explicit choice yet.
test.use({ colorScheme: "light" });

test("theme toggle switches to dark mode and persists across reload", async ({ page }) => {
  await page.goto("/login");
  const html = page.locator("html");
  await expect(html).not.toHaveClass(/dark/);

  await page.getByRole("button", { name: "切换黑暗模式" }).click();
  await expect(html).toHaveClass(/dark/);

  await page.reload();
  await expect(html).toHaveClass(/dark/);
});
