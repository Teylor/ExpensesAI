import { describe, expect, it } from "vitest";
import type { FxRateSnapshot } from "../fx/triangulation.js";
import { DEFAULT_USER_PREFERENCES } from "../user/preferences.js";
import {
  type AccountSummaryInput,
  computeBalancesSummary,
} from "./balances.js";

const FX_SNAPSHOT: FxRateSnapshot = {
  pivotCurrency: "EUR",
  rateDate: "2026-11-19",
  provider: "frankfurter",
  fetchedAt: "2026-11-19T16:30:00.000Z",
  rates: {
    USD: "1.1",
    JPY: "165",
  },
};

describe("computeBalancesSummary (consolidated multicurrency balances)", () => {
  it("computes totalBalance, cashBalance, byType, and parenthesized foreign balances accurately", () => {
    const accounts: AccountSummaryInput[] = [
      {
        id: "1",
        name: "Banco Principal",
        accountType: "bank",
        currency: "EUR",
        balance: "3000",
        isArchived: false,
      },
      {
        id: "2",
        name: "Cartera EUR",
        accountType: "cash",
        currency: "EUR",
        balance: "250",
        isArchived: false,
      },
      {
        id: "3",
        name: "Efectivo Viaje",
        accountType: "cash",
        currency: "USD",
        balance: "110",
        isArchived: false,
      },
      {
        id: "4",
        name: "American Express",
        accountType: "credit",
        currency: "USD",
        balance: "2200",
        isArchived: false,
      },
      {
        id: "5",
        name: "Ahorro Japón",
        accountType: "savings",
        currency: "JPY",
        balance: "165000",
        isArchived: false,
      },
      {
        id: "6",
        name: "Cuenta Cerrada",
        accountType: "bank",
        currency: "EUR",
        balance: "9999",
        isArchived: true,
      },
    ];

    const summary = computeBalancesSummary(
      accounts,
      DEFAULT_USER_PREFERENCES,
      FX_SNAPSHOT,
    );

    expect(summary.baseCurrency).toBe("EUR");
    expect(summary.totalBalance).toBe("6350");
    expect(summary.formattedTotalBalance).toBe("6.350,00 €");
    expect(summary.cashBalance).toBe("350");
    expect(summary.formattedCashBalance).toBe("350,00 €");
    expect(summary.byType).toEqual({
      bank: "3000",
      cash: "350",
      savings: "1000",
      credit: "2000",
    });
    expect(summary.missingFxCurrencies).toEqual([]);

    const amex = summary.accounts.find((a) => a.id === "4");
    expect(amex?.balanceInBase).toBe("2000");
    expect(amex?.formattedBalance).toBe("2.200,00 $ (2.000,00 €)");

    const jpy = summary.accounts.find((a) => a.id === "5");
    expect(jpy?.formattedBalance).toBe("165.000 ¥ (1.000,00 €)");
  });

  it("reports missing FX currencies cleanly without NaN and still totals convertible accounts", () => {
    const accounts: AccountSummaryInput[] = [
      {
        id: "1",
        name: "Banco EUR",
        accountType: "bank",
        currency: "EUR",
        balance: "1000",
        isArchived: false,
      },
      {
        id: "2",
        name: "Cuenta Brasil",
        accountType: "bank",
        currency: "BRL",
        balance: "500",
        isArchived: false,
      },
    ];

    const summary = computeBalancesSummary(
      accounts,
      DEFAULT_USER_PREFERENCES,
      FX_SNAPSHOT,
    );

    expect(summary.totalBalance).toBe("1000");
    expect(summary.missingFxCurrencies).toEqual(["BRL"]);
    const brl = summary.accounts.find((a) => a.id === "2");
    expect(brl?.balanceInBase).toBeNull();
    expect(brl?.formattedBalance).toBe("500,00 BRL");
  });

  it("returns clean zero summary for empty accounts", () => {
    const summary = computeBalancesSummary(
      [],
      DEFAULT_USER_PREFERENCES,
      FX_SNAPSHOT,
    );

    expect(summary.totalBalance).toBe("0");
    expect(summary.formattedTotalBalance).toBe("0,00 €");
    expect(summary.cashBalance).toBe("0");
    expect(summary.formattedCashBalance).toBe("0,00 €");
  });
});
