import { describe, expect, it } from "vitest";
import type { UserPreferences } from "../user/preferences.js";
import type { CommandEnvelope } from "./catalog.js";
import {
  type CommandSummaryContext,
  formatCommandActionSummary,
} from "./summary.js";

const BANK_ID = "22222222-2222-4222-8222-222222222222";
const CASH_ID = "33333333-3333-4333-8333-333333333333";

const BASE_META = {
  commandId: "11111111-1111-4111-8111-111111111111",
  actor: "agent" as const,
  issuedAtUtc: "2026-11-19T20:00:00.000Z",
};

const ES_PREFS: UserPreferences = {
  baseCurrency: "EUR",
  timezone: "Europe/Madrid",
  locale: "es",
  thousandsSeparator: ".",
  decimalSeparator: ",",
  symbolPosition: "after",
  agentConfirmEnabled: true,
};

const EN_PREFS: UserPreferences = {
  baseCurrency: "EUR",
  timezone: "Europe/Madrid",
  locale: "en",
  thousandsSeparator: ",",
  decimalSeparator: ".",
  symbolPosition: "before",
  agentConfirmEnabled: true,
};

const CONTEXT: CommandSummaryContext = {
  accountNames: {
    [BANK_ID]: "Banco Principal",
    [CASH_ID]: "Efectivo",
  },
};

describe("formatCommandActionSummary (localized one-line summaries for every command type)", () => {
  it("formats account.create in ES and EN", () => {
    const command: CommandEnvelope = {
      ...BASE_META,
      type: "account.create",
      payload: {
        name: "Banco Principal",
        accountType: "bank",
        currency: "EUR",
        initialBalance: "0",
      },
    };

    expect(formatCommandActionSummary(command, ES_PREFS)).toBe(
      "Cuenta Banco Principal (Banco) creada",
    );
    expect(formatCommandActionSummary(command, EN_PREFS)).toBe(
      "Account Banco Principal (Bank) created",
    );
  });

  it("formats account.update with explicit name and with context-resolved fallback", () => {
    const renamed: CommandEnvelope = {
      ...BASE_META,
      type: "account.update",
      payload: { accountId: BANK_ID, name: "Banco Principal II" },
    };

    expect(formatCommandActionSummary(renamed, ES_PREFS)).toBe(
      "Cuenta Banco Principal II actualizada",
    );
    expect(formatCommandActionSummary(renamed, EN_PREFS)).toBe(
      "Account Banco Principal II updated",
    );

    const nameless: CommandEnvelope = {
      ...BASE_META,
      type: "account.update",
      payload: { accountId: BANK_ID },
    };

    expect(formatCommandActionSummary(nameless, ES_PREFS, CONTEXT)).toBe(
      "Cuenta Banco Principal actualizada",
    );
  });

  it("formats account.archive resolving display names from context, falling back to raw id", () => {
    const command: CommandEnvelope = {
      ...BASE_META,
      type: "account.archive",
      payload: { accountId: BANK_ID },
    };

    expect(formatCommandActionSummary(command, ES_PREFS, CONTEXT)).toBe(
      "Cuenta Banco Principal archivada",
    );
    expect(formatCommandActionSummary(command, EN_PREFS, CONTEXT)).toBe(
      "Account Banco Principal archived",
    );
    expect(formatCommandActionSummary(command, ES_PREFS)).toBe(
      `Cuenta ${BANK_ID} archivada`,
    );
  });

  it("formats transaction.record income and expense with formatted amounts", () => {
    const income: CommandEnvelope = {
      ...BASE_META,
      type: "transaction.record",
      payload: {
        kind: "income",
        accountId: BANK_ID,
        amount: "2000",
        currency: "EUR",
        description: "Pago por trabajo X",
        source: "manual",
      },
    };

    expect(formatCommandActionSummary(income, ES_PREFS)).toBe(
      "Nuevo ingreso de 2.000,00 € (Pago por trabajo X)",
    );
    expect(formatCommandActionSummary(income, EN_PREFS)).toBe(
      "New income of €2,000.00 (Pago por trabajo X)",
    );

    const expense: CommandEnvelope = {
      ...BASE_META,
      type: "transaction.record",
      payload: {
        kind: "expense",
        accountId: BANK_ID,
        amount: "45.5",
        currency: "EUR",
        description: "Supermarket",
        source: "manual",
      },
    };

    expect(formatCommandActionSummary(expense, ES_PREFS)).toBe(
      "Nuevo gasto de 45,50 € (Supermarket)",
    );
    expect(formatCommandActionSummary(expense, EN_PREFS)).toBe(
      "New expense of €45.50 (Supermarket)",
    );
  });

  it("formats transaction.transfer using context-resolved account names", () => {
    const command: CommandEnvelope = {
      ...BASE_META,
      type: "transaction.transfer",
      payload: {
        fromAccountId: BANK_ID,
        toAccountId: CASH_ID,
        amount: "500",
        currency: "EUR",
      },
    };

    expect(formatCommandActionSummary(command, ES_PREFS, CONTEXT)).toBe(
      "Transferencia de 500,00 € desde Banco Principal hacia Efectivo",
    );
    expect(formatCommandActionSummary(command, EN_PREFS, CONTEXT)).toBe(
      "Transfer of €500.00 from Banco Principal to Efectivo",
    );
  });

  it("formats transaction.delete without payload context", () => {
    const command: CommandEnvelope = {
      ...BASE_META,
      type: "transaction.delete",
      payload: {
        transactionId: "55555555-5555-4555-8555-555555555555",
      },
    };

    expect(formatCommandActionSummary(command, ES_PREFS)).toBe(
      "Movimiento eliminado",
    );
    expect(formatCommandActionSummary(command, EN_PREFS)).toBe(
      "Transaction deleted",
    );
  });

  it("formats recurring.upsert with localized period label", () => {
    const command: CommandEnvelope = {
      ...BASE_META,
      type: "recurring.upsert",
      payload: {
        kind: "expense",
        accountId: BANK_ID,
        amount: "120.5",
        currency: "EUR",
        frequency: "monthly",
        description: "Alquiler",
        isActive: true,
      },
    };

    expect(formatCommandActionSummary(command, ES_PREFS)).toBe(
      "Regla recurrente guardada: Alquiler (120,50 €, Mensual)",
    );
    expect(formatCommandActionSummary(command, EN_PREFS)).toBe(
      "Recurring rule saved: Alquiler (€120.50, Monthly)",
    );
  });

  it("formats recurring.delete without payload context", () => {
    const command: CommandEnvelope = {
      ...BASE_META,
      type: "recurring.delete",
      payload: { ruleId: "66666666-6666-4666-8666-666666666666" },
    };

    expect(formatCommandActionSummary(command, ES_PREFS)).toBe(
      "Regla recurrente eliminada",
    );
    expect(formatCommandActionSummary(command, EN_PREFS)).toBe(
      "Recurring rule deleted",
    );
  });

  it("formats investment.upsert with formatted amount", () => {
    const command: CommandEnvelope = {
      ...BASE_META,
      type: "investment.upsert",
      payload: {
        assetType: "crypto",
        name: "Bitcoin",
        investedAmount: "1500",
        currentValue: "1600",
        currency: "EUR",
      },
    };

    expect(formatCommandActionSummary(command, ES_PREFS)).toBe(
      "Inversión Bitcoin (1.500,00 €) guardada",
    );
    expect(formatCommandActionSummary(command, EN_PREFS)).toBe(
      "Investment Bitcoin (€1,500.00) saved",
    );
  });

  it("formats investment.delete without payload context", () => {
    const command: CommandEnvelope = {
      ...BASE_META,
      type: "investment.delete",
      payload: { investmentId: "77777777-7777-4777-8777-777777777777" },
    };

    expect(formatCommandActionSummary(command, ES_PREFS)).toBe(
      "Inversión eliminada",
    );
    expect(formatCommandActionSummary(command, EN_PREFS)).toBe(
      "Investment deleted",
    );
  });

  it("formats networth.upsert with formatted amount", () => {
    const command: CommandEnvelope = {
      ...BASE_META,
      type: "networth.upsert",
      payload: {
        kind: "asset",
        category: "real_estate",
        name: "Piso propio",
        estimatedValue: "200000",
        currency: "EUR",
      },
    };

    expect(formatCommandActionSummary(command, ES_PREFS)).toBe(
      "Elemento de patrimonio Piso propio (200.000,00 €) guardado",
    );
    expect(formatCommandActionSummary(command, EN_PREFS)).toBe(
      "Net worth item Piso propio (€200,000.00) saved",
    );
  });

  it("formats networth.delete without payload context", () => {
    const command: CommandEnvelope = {
      ...BASE_META,
      type: "networth.delete",
      payload: { itemId: "88888888-8888-4888-8888-888888888888" },
    };

    expect(formatCommandActionSummary(command, ES_PREFS)).toBe(
      "Elemento de patrimonio eliminado",
    );
    expect(formatCommandActionSummary(command, EN_PREFS)).toBe(
      "Net worth item deleted",
    );
  });

  it("formats category.upsert and category.delete", () => {
    const upsert: CommandEnvelope = {
      ...BASE_META,
      type: "category.upsert",
      payload: { scope: "expense", name: "Comida" },
    };

    expect(formatCommandActionSummary(upsert, ES_PREFS)).toBe(
      "Categoría Comida guardada",
    );
    expect(formatCommandActionSummary(upsert, EN_PREFS)).toBe(
      "Category Comida saved",
    );

    const del: CommandEnvelope = {
      ...BASE_META,
      type: "category.delete",
      payload: { categoryId: "99999999-9999-4999-8999-999999999999" },
    };

    expect(formatCommandActionSummary(del, ES_PREFS)).toBe(
      "Categoría eliminada",
    );
    expect(formatCommandActionSummary(del, EN_PREFS)).toBe("Category deleted");
  });

  it("formats command.undo", () => {
    const command: CommandEnvelope = {
      ...BASE_META,
      type: "command.undo",
      payload: { targetCommandId: BASE_META.commandId },
    };

    expect(formatCommandActionSummary(command, ES_PREFS)).toBe(
      "Acción deshecha",
    );
    expect(formatCommandActionSummary(command, EN_PREFS)).toBe("Action undone");
  });

  it("keeps a safe localized fallback for unknown future command types", () => {
    const future = {
      ...BASE_META,
      type: "future.command",
      payload: {},
    } as unknown as CommandEnvelope;

    expect(formatCommandActionSummary(future, ES_PREFS)).toBe(
      "Operación future.command",
    );
    expect(formatCommandActionSummary(future, EN_PREFS)).toBe(
      "Operation future.command",
    );
  });
});
