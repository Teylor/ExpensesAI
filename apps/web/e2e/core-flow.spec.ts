import { expect, test } from "@playwright/test";

test("Offline-first core finance flow: navigate to Accounts, create account, agent guardrail, impact confirmation card & global Undo", async ({
  page,
}) => {
  await page.goto("/");

  // Enter Offline Local Mode (works deterministically without backend)
  await page.getByRole("button", { name: /Usar modo Offline Local/i }).click();

  // Navigate to Accounts tab (default tab is Overview)
  await page.getByRole("button", { name: /^Cuentas$/i }).click();
  await expect(page).toHaveURL(/\?tab=accounts/);

  // Create EUR bank account with initial balance 3000
  await page.getByLabel("Nombre cuenta").fill("Banco Principal");
  await page.getByLabel("Saldo inicial").fill("3000");
  await page.getByLabel("Añadir cuenta").click();

  await expect(page.getByText("3.000,00 €").first()).toBeVisible();

  // Open Always-Visible Floating Agent Button
  await page.getByTestId("agent-floating-trigger").click();
  await expect(page.getByTestId("agent-drawer")).toBeVisible();

  // Guardrail MUST block generic non-financial prompt
  const agentInput = page.getByLabel("Mensaje para el agente");
  await agentInput.fill("Escribe un poema sobre la luna");
  await page.getByLabel("Enviar mensaje").click();
  await expect(page.getByText("Guardrail de Dominio")).toBeVisible();

  // Propose income via agent -> exact impact confirmation card ("3.000,00 € a 5.000,00 €")
  await agentInput.fill("Nuevo ingreso de 2000 EUR por Trabajo X");
  await page.getByLabel("Enviar mensaje").click();
  await expect(page.getByText(/3\.000,00 € a 5\.000,00 €/)).toBeVisible();

  // Confirm proposal -> Total balance updates to 5.000,00 €
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByText("5.000,00 €").first()).toBeVisible();

  // Global Undo (sticky top banner, zero drawer overlap) reverts balance back to 3.000,00 €
  await page.getByRole("button", { name: "Deshacer" }).click();
  await expect(page.getByText("3.000,00 €").first()).toBeVisible();
});
