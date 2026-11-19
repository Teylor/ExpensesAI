import { describe, expect, it } from "vitest";
import {
  DEFAULT_USER_PREFERENCES,
  type UserPreferences,
} from "../user/preferences.js";
import type { CommandEnvelope } from "./catalog.js";
import { type ImpactSimulationState, simulateCommandImpact } from "./impact.js";

const BANK_ID = "22222222-2222-4222-8222-222222222222";
const CASH_ID = "33333333-3333-4333-8333-333333333333";
const AMEX_ID = "44444444-4444-4444-8444-444444444444";

const BASE_META = {
  commandId: "11111111-1111-4111-8111-111111111111",
  actor: "agent" as const,
  issuedAtUtc: "2026-11-19T20:00:00.000Z",
};

const SAMPLE_STATE: ImpactSimulationState = {
  accounts: {
    [BANK_ID]: {
      id: BANK_ID,
      name: "Banco Principal",
      currency: "EUR",
      balance: "3000",
    },
    [CASH_ID]: {
      id: CASH_ID,
      name: "Efectivo",
      currency: "EUR",
      balance: "200",
    },
    [AMEX_ID]: {
      id: AMEX_ID,
      name: "American Express",
      currency: "USD",
      balance: "1000",
    },
  },
};

const US_PREFS: UserPreferences = {
  baseCurrency: "USD",
  timezone: "America/New_York",
  locale: "en",
  thousandsSeparator: ",",
  decimalSeparator: ".",
  symbolPosition: "before",
  agentConfirmEnabled: true,
};

describe("simulateCommandImpact (deterministic agent confirmation preview)", () => {
  it("generates exact Spanish before/after preview for an income", () => {
    const command: CommandEnvelope = {
      ...BASE_META,
      type: "transaction.record",
      payload: {
        kind: "income",
        accountId: BANK_ID,
        amount: "2000",
        currency: "EUR",
        description: "Pago de Y por trabajo X",
        source: "agent",
      },
    };

    const impact = simulateCommandImpact(
      SAMPLE_STATE,
      command,
      DEFAULT_USER_PREFERENCES,
    );

    expect(impact.summary).toBe(
      "Nuevo ingreso de 2.000,00 €: tu saldo pasará de 3.000,00 € a 5.000,00 € (Pago de Y por trabajo X).",
    );
    expect(impact.accountImpacts).toEqual([
      {
        accountId: BANK_ID,
        accountName: "Banco Principal",
        currency: "EUR",
        balanceBefore: "3000",
        balanceAfter: "5000",
        delta: "2000",
      },
    ]);
  });

  it("generates exact English before/after preview for an expense", () => {
    const command: CommandEnvelope = {
      ...BASE_META,
      type: "transaction.record",
      payload: {
        kind: "expense",
        accountId: AMEX_ID,
        amount: "45.5",
        currency: "USD",
        description: "Supermarket",
        source: "agent",
      },
    };

    const impact = simulateCommandImpact(SAMPLE_STATE, command, US_PREFS);

    expect(impact.summary).toBe(
      "New expense of $45.50: your balance will change from $1,000.00 to $954.50 (Supermarket).",
    );
    expect(impact.accountImpacts[0]?.balanceAfter).toBe("954.5");
    expect(impact.accountImpacts[0]?.delta).toBe("-45.5");
  });

  it("includes parenthesized base-currency equivalent when operating in a foreign currency", () => {
    const command: CommandEnvelope = {
      ...BASE_META,
      type: "transaction.record",
      payload: {
        kind: "income",
        accountId: AMEX_ID,
        amount: "1000",
        currency: "USD",
        description: "US client bonus",
        fxRateToBaseOverride: "0.90966",
        source: "agent",
      },
    };

    const impact = simulateCommandImpact(
      SAMPLE_STATE,
      command,
      DEFAULT_USER_PREFERENCES,
    );

    expect(impact.summary).toBe(
      "Nuevo ingreso de 1.000,00 $ (909,66 €): tu saldo pasará de 1.000,00 $ (909,66 €) a 2.000,00 $ (1.819,32 €) (US client bonus).",
    );
  });

  it("simulates both source and destination account changes for internal transfers", () => {
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

    const impact = simulateCommandImpact(
      SAMPLE_STATE,
      command,
      DEFAULT_USER_PREFERENCES,
    );

    expect(impact.summary).toBe(
      "Transferencia de 500,00 € desde Banco Principal hacia Efectivo.",
    );
    expect(impact.accountImpacts).toHaveLength(2);
    expect(impact.accountImpacts[0]?.balanceAfter).toBe("2500");
    expect(impact.accountImpacts[1]?.balanceAfter).toBe("700");
  });

  it("simulates recurring schedule creation without mutating current balances", () => {
    const command: CommandEnvelope = {
      ...BASE_META,
      type: "recurring.upsert",
      payload: {
        kind: "income",
        accountId: BANK_ID,
        amount: "2400",
        currency: "EUR",
        frequency: "monthly",
        dayOfMonth: 28,
        description: "Nómina",
        isActive: true,
      },
    };

    const impact = simulateCommandImpact(
      SAMPLE_STATE,
      command,
      DEFAULT_USER_PREFERENCES,
    );

    expect(impact.summary).toBe(
      "Regla recurrente configurada: Nómina (2.400,00 €) con frecuencia Mensual.",
    );
    expect(impact.accountImpacts).toEqual([]);
  });
});
