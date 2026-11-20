import { describe, expect, it } from "vitest";
import { commandEnvelopeSchema } from "../commands/catalog.js";
import type { FxRateSnapshot } from "../fx/triangulation.js";
import { DEFAULT_USER_PREFERENCES } from "../user/preferences.js";
import {
  computeInvestmentsSummary,
  computeNetWorthSummary,
  type InvestmentSummaryInput,
  type NetWorthSummaryInput,
} from "./summary.js";

const FX_SNAPSHOT: FxRateSnapshot = {
  pivotCurrency: "EUR",
  rateDate: "2026-11-20",
  provider: "frankfurter",
  fetchedAt: "2026-11-20T05:00:00.000Z",
  rates: {
    USD: "1.1",
  },
};

describe("Wealth engines (Investments V1 & Net Worth: Assets - Liabilities)", () => {
  it("computes consolidated multicurrency investments summary with PnL and parenthesized values", () => {
    const items: readonly InvestmentSummaryInput[] = [
      {
        id: "inv-1",
        assetType: "Crypto",
        name: "Bitcoin",
        symbol: "BTC",
        quantity: "0.25",
        investedAmount: "10000",
        currentValue: "15000",
        currency: "EUR",
      },
      {
        // USD investment: invested 1100 USD (1000 EUR), current 2200 USD (2000 EUR)
        id: "inv-2",
        assetType: "Acciones",
        name: "Apple",
        symbol: "AAPL",
        quantity: "10",
        investedAmount: "1100",
        currentValue: "2200",
        currency: "USD",
      },
    ];

    const summary = computeInvestmentsSummary(
      items,
      DEFAULT_USER_PREFERENCES,
      FX_SNAPSHOT,
    );

    // Invested: 10000 + 1000 = 11000 EUR; Current: 15000 + 2000 = 17000 EUR; PnL: +6000 EUR (+54.55%)
    expect(summary.totalInvested).toBe("11000");
    expect(summary.totalCurrentValue).toBe("17000");
    expect(summary.formattedTotalCurrentValue).toBe("17.000,00 €");
    expect(summary.unrealizedPnl).toBe("6000");
    expect(summary.unrealizedPnlPercent).toBe("54.55");

    const apple = summary.items.find((i) => i.id === "inv-2");
    expect(apple?.formattedCurrentValue).toBe("2.200,00 $ (2.000,00 €)");
  });

  it("computes consolidated Net Worth (accounts + investments + illiquid assets - liabilities) with decimal.js", () => {
    const netWorthItems: readonly NetWorthSummaryInput[] = [
      {
        id: "nw-home",
        kind: "asset",
        category: "Inmuebles",
        name: "Piso Madrid",
        estimatedValue: "250000",
        currency: "EUR",
      },
      {
        id: "nw-cards",
        kind: "asset",
        category: "Cartas y Coleccionables",
        name: "Charizard Base Set",
        estimatedValue: "1100",
        currency: "USD", // 1000 EUR
      },
      {
        id: "nw-mortgage",
        kind: "liability",
        category: "Hipoteca",
        name: "Hipoteca Banco",
        estimatedValue: "150000",
        currency: "EUR",
      },
    ];

    const nw = computeNetWorthSummary(
      "25000", // liquid accounts total in EUR
      "17000", // investments total in EUR
      netWorthItems,
      DEFAULT_USER_PREFERENCES,
      FX_SNAPSHOT,
    );

    // Assets = 25000 (accounts) + 17000 (investments) + 250000 + 1000 = 293000 EUR
    // Liabilities = 150000 EUR
    // Net Worth = 143000 EUR
    expect(nw.totalLiquidAccounts).toBe("25000");
    expect(nw.totalInvestments).toBe("17000");
    expect(nw.totalIlliquidAssets).toBe("251000");
    expect(nw.totalAssets).toBe("293000");
    expect(nw.totalLiabilities).toBe("150000");
    expect(nw.netWorth).toBe("143000");
    expect(nw.formattedNetWorth).toBe("143.000,00 €");

    const cards = nw.items.find((i) => i.id === "nw-cards");
    expect(cards?.formattedValue).toBe("1.100,00 $ (1.000,00 €)");
  });

  it("validates investment.delete and networth.delete in CommandBus catalog", () => {
    expect(
      commandEnvelopeSchema.parse({
        commandId: "81000000-0000-4000-8000-000000000001",
        actor: "manual",
        issuedAtUtc: "2026-11-20T06:00:00.000Z",
        type: "investment.delete",
        payload: { investmentId: "81000000-0000-4000-8000-000000000002" },
      }).type,
    ).toBe("investment.delete");

    expect(
      commandEnvelopeSchema.parse({
        commandId: "81000000-0000-4000-8000-000000000003",
        actor: "agent",
        issuedAtUtc: "2026-11-20T06:00:00.000Z",
        type: "networth.delete",
        payload: { itemId: "81000000-0000-4000-8000-000000000004" },
      }).type,
    ).toBe("networth.delete");
  });
});
