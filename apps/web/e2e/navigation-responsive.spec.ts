import { expect, test } from "@playwright/test";

test.describe("5-Tab responsive shell, URL persistence & zero-overlap overlays", () => {
  test("Desktop (1280x720): sidebar visible, URL tab persistence, tab isolation & fallback", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/?tab=invalid-tab");
    await page
      .getByRole("button", { name: /Usar modo Offline Local/i })
      .click();

    // Invalid ?tab falls back to Overview
    await expect(page.getByTestId("desktop-sidebar")).toBeVisible();
    await expect(page.getByTestId("mobile-bottom-nav")).toBeHidden();
    await expect(page.getByTestId("desktop-nav-tab-overview")).toHaveAttribute(
      "aria-current",
      "page",
    );

    // Navigate to Wealth: CSV export card must NOT be here
    await page.getByTestId("desktop-nav-tab-wealth").click();
    await expect(page).toHaveURL(/\?tab=wealth/);
    await expect(page.getByTestId("csv-export-card")).toHaveCount(0);

    // Navigate to Manage: CSV export card & Categories must be visible here
    await page.getByTestId("desktop-nav-tab-manage").click();
    await expect(page).toHaveURL(/\?tab=manage/);
    await expect(page.getByTestId("csv-export-card")).toBeVisible();
    await expect(page.getByTestId("manage-categories-card")).toBeVisible();

    // Browser Back returns to Wealth
    await page.goBack();
    await expect(page).toHaveURL(/\?tab=wealth/);
    await expect(page.getByTestId("desktop-nav-tab-wealth")).toHaveAttribute(
      "aria-current",
      "page",
    );

    // Reload preserves ?tab=wealth
    await page.reload();
    await page
      .getByRole("button", { name: /Usar modo Offline Local/i })
      .click();
    await expect(page.getByTestId("desktop-nav-tab-wealth")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("Mobile (390x844): bottom nav visible, zero FAB overlap, bottom-sheet Escape & recurring account select", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page
      .getByRole("button", { name: /Usar modo Offline Local/i })
      .click();

    await expect(page.getByTestId("desktop-sidebar")).toBeHidden();
    const bottomNav = page.getByTestId("mobile-bottom-nav");
    await expect(bottomNav).toBeVisible();
    await expect(bottomNav.getByRole("button")).toHaveCount(5);

    const agentFab = page.getByTestId("agent-floating-trigger");
    await expect(agentFab).toBeVisible();

    // Strict zero-overlap assertion: Agent FAB sits strictly ABOVE the Bottom Tab Bar
    const fabBox = await agentFab.boundingBox();
    const navBox = await bottomNav.boundingBox();
    expect(fabBox).not.toBeNull();
    expect(navBox).not.toBeNull();
    if (fabBox && navBox) {
      expect(fabBox.y + fabBox.height).toBeLessThanOrEqual(navBox.y);
      expect(fabBox.height).toBeGreaterThanOrEqual(44);
      expect(fabBox.width).toBeGreaterThanOrEqual(44);
    }

    // Open mobile Agent bottom sheet -> fits viewport, FAB hides, Escape closes
    await agentFab.click();
    const drawer = page.getByTestId("agent-drawer");
    await expect(drawer).toBeVisible();
    await expect(agentFab).toBeHidden();

    const drawerBox = await drawer.boundingBox();
    expect(drawerBox).not.toBeNull();
    if (drawerBox) {
      expect(drawerBox.x).toBeGreaterThanOrEqual(0);
      expect(drawerBox.x + drawerBox.width).toBeLessThanOrEqual(390.5);
      expect(drawerBox.y).toBeGreaterThanOrEqual(0);
      expect(drawerBox.y + drawerBox.height).toBeLessThanOrEqual(844.5);
    }

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(agentFab).toBeVisible();

    // Switch to Activity -> Recurring sub-tab shows explicit visible Account select
    await page.getByTestId("mobile-nav-tab-activity").click();
    await expect(page).toHaveURL(/\?tab=activity/);
    await page.getByRole("tab", { name: /Recurrentes/i }).click();
    await expect(page.getByLabel("Cuenta recurrente")).toBeVisible();
  });
});
