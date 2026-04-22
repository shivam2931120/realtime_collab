import { test, expect } from "@playwright/test";

test("login route loads", async ({ page }) => {
  await page.goto("/login");
  await expect(page).toHaveURL(/\/login/);
});
