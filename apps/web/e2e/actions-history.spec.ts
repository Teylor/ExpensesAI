import { expect, type Page, test } from "@playwright/test";

const MOBILE = { width: 390, height: 844 } as const;
const DESKTOP = { width: 1280, height: 720 } as const;
const EPS = 0.5;

async function enterOfflineAccountsTab(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /Usar modo Offline Local/i }).click();
  await page.getByRole("button", { name: /^Cuentas$/i }).click();
  await expect(page).toHaveURL(/\?tab=accounts/);
}

async function createAccount(page: Page, name: string, initial: string) {
  await page.getByLabel("Nombre cuenta").fill(name);
  await page.getByLabel("Saldo inicial").fill(initial);
  await page.getByLabel("Añadir cuenta").click();
  // The action toast confirms the command was dispatched (local outbox row created)
  await expect(page.getByTestId("action-toast")).toBeVisible();
}

test.describe("ActionToast & Actions History Drawer", () => {
  test("Mobile: ActionToast auto-dismisses in 3s and pauses on hover", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE);
    await enterOfflineAccountsTab(page);
    await createAccount(page, "Banco Toast", "3000");

    // The old sticky global undo banner is gone
    await expect(page.getByTestId("global-undo-banner")).toHaveCount(0);

    const toast = page.getByTestId("action-toast");
    await expect(toast).toBeVisible();

    // Hover pauses the countdown: 3.5s of hover never dismisses the toast
    await toast.hover();
    await page.waitForTimeout(3500);
    await expect(toast).toBeVisible();

    // Unhover resumes the countdown and the toast dismisses within 3s
    await page.mouse.move(10, 10);
    await expect(toast).toBeHidden({ timeout: 6000 });
  });

  test("Mobile: single-row header, 44px history trigger & 5-button bottom nav", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE);
    await enterOfflineAccountsTab(page);

    const header = page.locator("header");
    const headerBox = await header.boundingBox();
    expect(headerBox).not.toBeNull();
    if (headerBox) {
      // h-14 (56px) + 1px border: the header must not wrap at 390px
      expect(headerBox.height).toBeGreaterThanOrEqual(55);
      expect(headerBox.height).toBeLessThanOrEqual(58);
    }

    const bottomNav = page.getByTestId("mobile-bottom-nav");
    await expect(bottomNav).toBeVisible();
    await expect(bottomNav.getByRole("button")).toHaveCount(5);

    const trigger = page.getByTestId("history-trigger-button");
    await expect(trigger).toBeVisible();
    const triggerBox = await trigger.boundingBox();
    expect(triggerBox).not.toBeNull();
    if (triggerBox && headerBox) {
      expect(triggerBox.width).toBeGreaterThanOrEqual(44);
      expect(triggerBox.height).toBeGreaterThanOrEqual(44);
      // The trigger sits inside the single-row header
      expect(triggerBox.y).toBeGreaterThanOrEqual(headerBox.y - EPS);
      expect(triggerBox.y + triggerBox.height).toBeLessThanOrEqual(
        headerBox.y + headerBox.height + EPS,
      );
    }
  });

  test("Mobile: toast zero overlap with bottom nav & agent FAB", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE);
    await enterOfflineAccountsTab(page);
    await createAccount(page, "Banco Overlap", "3000");

    const toastBox = await page.getByTestId("action-toast").boundingBox();
    const navBox = await page.getByTestId("mobile-bottom-nav").boundingBox();
    const fabBox = await page
      .getByTestId("agent-floating-trigger")
      .boundingBox();
    expect(toastBox).not.toBeNull();
    expect(navBox).not.toBeNull();
    expect(fabBox).not.toBeNull();
    if (!toastBox || !navBox || !fabBox) {
      return;
    }

    // Strictly inside the viewport
    expect(toastBox.x).toBeGreaterThanOrEqual(0);
    expect(toastBox.x + toastBox.width).toBeLessThanOrEqual(390 + EPS);
    // Strictly ABOVE the bottom nav and the agent FAB
    expect(toastBox.y + toastBox.height).toBeLessThanOrEqual(navBox.y + EPS);
    expect(toastBox.y + toastBox.height).toBeLessThanOrEqual(fabBox.y + EPS);
  });

  test("Desktop: toast zero overlap with sidebar & agent FAB, bottom-5 placement", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await enterOfflineAccountsTab(page);
    await createAccount(page, "Banco Desktop", "3000");

    const toastBox = await page.getByTestId("action-toast").boundingBox();
    const sidebarBox = await page.getByTestId("desktop-sidebar").boundingBox();
    const fabBox = await page
      .getByTestId("agent-floating-trigger")
      .boundingBox();
    expect(toastBox).not.toBeNull();
    expect(sidebarBox).not.toBeNull();
    expect(fabBox).not.toBeNull();
    if (!toastBox || !sidebarBox || !fabBox) {
      return;
    }

    // lg:bottom-5 -> bottom edge 20px above the viewport bottom
    expect(toastBox.y + toastBox.height).toBeGreaterThanOrEqual(720 - 20 - EPS);
    expect(toastBox.y + toastBox.height).toBeLessThanOrEqual(720 - 20 + EPS);
    // lg:left-[16.25rem] (260px) -> strictly right of the 240px sidebar
    expect(toastBox.x).toBeGreaterThanOrEqual(
      sidebarBox.x + sidebarBox.width - EPS,
    );
    // No rectangle intersection with the agent FAB
    const overlapsFab =
      toastBox.x < fabBox.x + fabBox.width &&
      toastBox.x + toastBox.width > fabBox.x &&
      toastBox.y < fabBox.y + fabBox.height &&
      toastBox.y + toastBox.height > fabBox.y;
    expect(overlapsFab).toBe(false);
  });

  test("Mobile: history drawer opens with tab counts, Escape closes & restores focus", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE);
    await enterOfflineAccountsTab(page);
    await createAccount(page, "Banco Drawer", "3000");

    const trigger = page.getByTestId("history-trigger-button");
    await trigger.click();

    const drawer = page.getByTestId("actions-history-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveAttribute("aria-modal", "true");
    await expect(page.getByTestId("actions-history-backdrop")).toBeVisible();

    const drawerBox = await drawer.boundingBox();
    expect(drawerBox).not.toBeNull();
    if (drawerBox) {
      expect(drawerBox.x).toBeGreaterThanOrEqual(0);
      expect(drawerBox.x + drawerBox.width).toBeLessThanOrEqual(390 + EPS);
      expect(drawerBox.y).toBeGreaterThanOrEqual(0);
      expect(drawerBox.y + drawerBox.height).toBeLessThanOrEqual(844 + EPS);
    }

    // Filter tabs with live counts (1 pending local row)
    await expect(page.getByTestId("actions-history-tab-all")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByTestId("actions-history-tab-all")).toContainText(
      "Todas",
    );
    await expect(page.getByTestId("actions-history-tab-all")).toContainText(
      "1",
    );
    await expect(page.getByTestId("actions-history-tab-active")).toContainText(
      "Activas",
    );
    await expect(page.getByTestId("actions-history-tab-active")).toContainText(
      "1",
    );
    await expect(page.getByTestId("actions-history-tab-undone")).toContainText(
      "Deshechas",
    );
    await expect(page.getByTestId("actions-history-tab-undone")).toContainText(
      "0",
    );

    // Row: Manual actor, pending status, undo enabled
    await expect(page.getByTestId(/^history-row-/)).toHaveCount(1);
    await expect(page.locator('p[id^="history-row-summary-"]')).toHaveText(
      "Cuenta Banco Drawer (Banco) creada",
    );
    await expect(page.getByText("Manual", { exact: true })).toBeVisible();
    await expect(page.getByText("Pendiente", { exact: true })).toBeVisible();
    await expect(page.getByTestId(/^history-undo-/)).toBeEnabled();

    // Escape closes the drawer and restores focus to the header trigger
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(trigger).toBeFocused();

    // The close-button path restores focus too
    await trigger.click();
    await expect(drawer).toBeVisible();
    await page.getByTestId("actions-history-close").click();
    await expect(drawer).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("Mobile: one-click undo from drawer reverts action & flips row to undone", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE);
    await enterOfflineAccountsTab(page);
    await createAccount(page, "Banco Undo", "3000");

    await page.getByTestId("history-trigger-button").click();
    await expect(page.getByTestId("actions-history-drawer")).toBeVisible();

    await page.getByTestId(/^history-undo-/).click();

    // "undone" toast: no undo button, dismiss still available
    await expect(
      page.getByText("Acción deshecha.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("action-toast-undo")).toHaveCount(0);
    await expect(page.getByTestId("action-toast-dismiss")).toBeVisible();

    // Row is RETAINED with line-through summary, undone pill, no undo button
    await expect(page.locator('p[id^="history-row-summary-"]')).toHaveClass(
      /line-through/,
    );
    await expect(page.getByText("Deshecha", { exact: true })).toBeVisible();
    await expect(page.getByTestId(/^history-undo-/)).toHaveCount(0);

    // The account was actually deleted (snapshot delete_account applied)
    await expect(
      page.locator("#main-content").getByText("Banco Undo"),
    ).toHaveCount(0);

    // Counts move to the undone filter
    await expect(page.getByTestId("actions-history-tab-active")).toContainText(
      "0",
    );
    await expect(page.getByTestId("actions-history-tab-undone")).toContainText(
      "1",
    );

    await page.getByTestId("actions-history-close").click();
    await expect(page.getByTestId("actions-history-drawer")).toBeHidden();
  });

  test("Desktop: agent drawer & history drawer are mutually exclusive", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    await page
      .getByRole("button", { name: /Usar modo Offline Local/i })
      .click();

    // No scrim at lg: the agent drawer is a side panel
    await expect(page.getByTestId("agent-backdrop")).toBeHidden();

    // Open agent, then history -> the agent drawer closes
    await page.getByTestId("agent-floating-trigger").click();
    await expect(page.getByTestId("agent-drawer")).toBeVisible();

    await page.getByTestId("history-trigger-button").click();
    await expect(page.getByTestId("actions-history-drawer")).toBeVisible();
    await expect(page.getByTestId("actions-history-backdrop")).toBeVisible();
    await expect(page.getByTestId("agent-drawer")).toBeHidden();

    // Escape closes the history drawer and restores focus to the trigger
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("actions-history-drawer")).toBeHidden();
    await expect(page.getByTestId("history-trigger-button")).toBeFocused();

    // The agent drawer can be reopened afterwards
    await page.getByTestId("agent-floating-trigger").click();
    await expect(page.getByTestId("agent-drawer")).toBeVisible();
  });
});
