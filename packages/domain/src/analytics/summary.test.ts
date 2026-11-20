import { describe, expect, it } from "vitest";
import type { FxRateSnapshot } from "../fx/triangulation.js";
import { DEFAULT_USER_PREFERENCES } from "../user/preferences.js";
import {
  type AnalyticsCategoryRef,
  type AnalyticsTransactionInput,
  computePeriodAnalytics,
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

const CATEGORIES: readonly AnalyticsCategoryRef[] = [
  { id: "cat-salary", name: "Nómina" },
  { id: "cat-food", name: "Comida" },
  { id: "cat-rent", name: "Vivienda" },
];

describe("computePeriodAnalytics (MultiHora periods, decimal.js FX & savings rate)", () => {
  it("computes monthly income, expense, net savings, savings rate, excludes transfers, and converts foreign currencies", () => {
    const txs: readonly AnalyticsTransactionInput[] = [
      {
        id: "tx-1",
        kind: "income",
        amount: "3000",
        currency: "EUR",
        fxRateToBase: "1",
        localDate: "2026-11-01",
        categoryId: "cat-salary",
      },
      {
        id: "tx-2",
        kind: "expense",
        amount: "1000",
        currency: "EUR",
        fxRateToBase: "1",
        localDate: "2026-11-05",
        categoryId: "cat-rent",
      },
      {
        // 220 USD -> 200 EUR using FX_SNAPSHOT (1 EUR = 1.1 USD)
        id: "tx-3",
        kind: "expense",
        amount: "220",
        currency: "USD",
        fxRateToBase: null,
        localDate: "2026-11-12",
        categoryId: "cat-food",
      },
      {
        // Internal transfer MUST NOT count as income or expense
        id: "tx-transfer",
        kind: "transfer",
        amount: "500",
        currency: "EUR",
        fxRateToBase: "1",
        localDate: "2026-11-15",
        categoryId: null,
      },
      {
        // Out of monthly window (October) -> MUST be excluded from November
        id: "tx-oct",
        kind: "expense",
        amount: "999",
        currency: "EUR",
        fxRateToBase: "1",
        localDate: "2026-10-31",
        categoryId: "cat-food",
      },
    ];

    const report = computePeriodAnalytics(txs, CATEGORIES, {
      period: "monthly",
      referenceDateUtc: new Date("2026-11-20T10:00:00.000Z"),
      preferences: DEFAULT_USER_PREFERENCES,
      fxSnapshot: FX_SNAPSHOT,
    });

    expect(report.period).toBe("monthly");
    expect(report.startLocalDate).toBe("2026-11-01");
    expect(report.endLocalDate).toBe("2026-12-01");
    expect(report.baseCurrency).toBe("EUR");

    // Income: 3000, Expense: 1000 + 200 = 1200, Net Savings: 1800, Rate: 60%
    expect(report.totalIncome).toBe("3000");
    expect(report.formattedTotalIncome).toBe("3.000,00 €");
    expect(report.totalExpense).toBe("1200");
    expect(report.formattedTotalExpense).toBe("1.200,00 €");
    expect(report.netSavings).toBe("1800");
    expect(report.formattedNetSavings).toBe("1.800,00 €");
    expect(report.savingsRatePercent).toBe("60");
    expect(report.transactionCount).toBe(3);

    // Expense breakdown sorted descending by amount
    expect(report.expenseByCategory).toHaveLength(2);
    expect(report.expenseByCategory[0]?.categoryName).toBe("Vivienda");
    expect(report.expenseByCategory[0]?.amount).toBe("1000");
    expect(report.expenseByCategory[0]?.sharePercent).toBe("83.33");
    expect(report.expenseByCategory[1]?.categoryName).toBe("Comida");
    expect(report.expenseByCategory[1]?.amount).toBe("200");
    expect(report.expenseByCategory[1]?.sharePercent).toBe("16.67");

    // Series should include daily buckets with non-zero entries
    expect(report.series.length).toBeGreaterThan(0);
    const nov1 = report.series.find((p) => p.bucketKey === "2026-11-01");
    expect(nov1?.income).toBe("3000");
    expect(nov1?.expense).toBe("0");
  });

  it("handles daily, weekly, quarterly, yearly bounds and edge cases (zero income / negative savings)", () => {
    const txs: readonly AnalyticsTransactionInput[] = [
      {
        id: "tx-q1",
        kind: "income",
        amount: "500",
        currency: "EUR",
        fxRateToBase: "1",
        localDate: "2026-10-10",
        categoryId: null,
      },
      {
        id: "tx-q2",
        kind: "expense",
        amount: "750",
        currency: "EUR",
        fxRateToBase: "1",
        localDate: "2026-11-20",
        categoryId: null,
      },
    ];

    // Daily (2026-11-20): 0 income, 750 expense -> netSavings = -750, savingsRatePercent = "0" (no NaN/Infinity)
    const daily = computePeriodAnalytics(txs, CATEGORIES, {
      period: "daily",
      referenceDateUtc: new Date("2026-11-20T12:00:00.000Z"),
      preferences: DEFAULT_USER_PREFERENCES,
    });
    expect(daily.totalIncome).toBe("0");
    expect(daily.totalExpense).toBe("750");
    expect(daily.netSavings).toBe("-750");
    expect(daily.savingsRatePercent).toBe("0");

    // Quarterly (Q4: 2026-10-01 .. 2027-01-01): 500 income, 750 expense -> -250 savings (-50%)
    const quarterly = computePeriodAnalytics(txs, CATEGORIES, {
      period: "quarterly",
      referenceDateUtc: new Date("2026-11-20T12:00:00.000Z"),
      preferences: DEFAULT_USER_PREFERENCES,
    });
    expect(quarterly.startLocalDate).toBe("2026-10-01");
    expect(quarterly.endLocalDate).toBe("2027-01-01");
    expect(quarterly.totalIncome).toBe("500");
    expect(quarterly.totalExpense).toBe("750");
    expect(quarterly.netSavings).toBe("-250");
    expect(quarterly.savingsRatePercent).toBe("-50");
    // Quarterly groups series by month (YYYY-MM)
    expect(quarterly.series.map((s) => s.bucketKey)).toEqual([
      "2026-10",
      "2026-11",
      "2026-12",
    ]);

    // Weekly & Yearly smoke checks
    const weekly = computePeriodAnalytics(txs, CATEGORIES, {
      period: "weekly",
      referenceDateUtc: new Date("2026-11-20T12:00:00.000Z"),
      preferences: DEFAULT_USER_PREFERENCES,
    });
    expect(weekly.startLocalDate).toBe("2026-11-16");
    expect(weekly.endLocalDate).toBe("2026-11-23");
    expect(weekly.series).toHaveLength(7);

    const yearly = computePeriodAnalytics(txs, CATEGORIES, {
      period: "yearly",
      referenceDateUtc: new Date("2026-11-20T12:00:00.000Z"),
      preferences: DEFAULT_USER_PREFERENCES,
    });
    expect(yearly.startLocalDate).toBe("2026-01-01");
    expect(yearly.endLocalDate).toBe("2027-01-01");
    expect(yearly.series).toHaveLength(12);
  });
});
