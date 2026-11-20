import { Decimal } from "decimal.js";
import type { FxRateSnapshot } from "../fx/triangulation.js";
import { getCurrencyInfo, normalizeCurrencyCode } from "../money/currencies.js";
import { formatMoney, type NumberFormatPreferences } from "../money/format.js";
import {
  addMoney,
  createMoney,
  FinanceDecimal,
  parseDecimal,
  subtractMoney,
} from "../money/money.js";
import { type FinancialPeriod, getPeriodBoundsUtc } from "../time/periods.js";
import type { UserPreferences } from "../user/preferences.js";

export interface AnalyticsTransactionInput {
  readonly id: string;
  readonly kind: "income" | "expense" | "transfer";
  readonly amount: string;
  readonly currency: string;
  readonly fxRateToBase: string | null;
  readonly localDate: string;
  readonly categoryId: string | null;
}

export interface AnalyticsCategoryRef {
  readonly id: string;
  readonly name: string;
}

export interface PeriodAnalyticsOptions {
  readonly period: FinancialPeriod;
  readonly referenceDateUtc: Date;
  readonly preferences: UserPreferences;
  readonly fxSnapshot?: FxRateSnapshot;
}

export interface CategoryBreakdownItem {
  readonly categoryId: string | null;
  readonly categoryName: string;
  readonly amount: string;
  readonly formattedAmount: string;
  readonly sharePercent: string;
  readonly count: number;
}

export interface AnalyticsSeriesPoint {
  readonly bucketKey: string;
  readonly label: string;
  readonly income: string;
  readonly expense: string;
  readonly netSavings: string;
}

export interface PeriodAnalyticsReport {
  readonly period: FinancialPeriod;
  readonly timeZone: string;
  readonly startLocalDate: string;
  readonly endLocalDate: string;
  readonly baseCurrency: string;
  readonly totalIncome: string;
  readonly formattedTotalIncome: string;
  readonly totalExpense: string;
  readonly formattedTotalExpense: string;
  readonly netSavings: string;
  readonly formattedNetSavings: string;
  readonly savingsRatePercent: string;
  readonly transactionCount: number;
  readonly unconvertibleCount: number;
  readonly incomeByCategory: readonly CategoryBreakdownItem[];
  readonly expenseByCategory: readonly CategoryBreakdownItem[];
  readonly series: readonly AnalyticsSeriesPoint[];
}

function normalizeDecimalString(d: Decimal): string {
  const fixed = d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
  const trimmed = fixed.replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
  return trimmed === "-0" ? "0" : trimmed;
}

function addOneCalendarDay(ymd: string): string {
  const [y = "2026", m = "01", d = "01"] = ymd.split("-");
  const next = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d) + 1));
  const ny = String(next.getUTCFullYear()).padStart(4, "0");
  const nm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const nd = String(next.getUTCDate()).padStart(2, "0");
  return `${ny}-${nm}-${nd}`;
}

function addOneCalendarMonth(ym: string): string {
  const [y = "2026", m = "01"] = ym.split("-");
  const monthNum = Number(m);
  const nextYear = monthNum === 12 ? Number(y) + 1 : Number(y);
  const nextMonth = monthNum === 12 ? 1 : monthNum + 1;
  return `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}`;
}

function buildInitialBuckets(
  period: FinancialPeriod,
  startLocalDate: string,
  endLocalDate: string,
): Array<{ bucketKey: string; label: string }> {
  if (period === "quarterly" || period === "yearly") {
    const startYm = startLocalDate.slice(0, 7);
    const endYm = endLocalDate.slice(0, 7);
    const buckets: Array<{ bucketKey: string; label: string }> = [];
    let cursor = startYm;
    let guard = 0;
    while (cursor < endYm && guard < 24) {
      buckets.push({ bucketKey: cursor, label: cursor });
      cursor = addOneCalendarMonth(cursor);
      guard += 1;
    }
    return buckets;
  }

  const buckets: Array<{ bucketKey: string; label: string }> = [];
  let cursor = startLocalDate;
  let guard = 0;
  while (cursor < endLocalDate && guard < 40) {
    buckets.push({
      bucketKey: cursor,
      label: period === "monthly" ? cursor.slice(8, 10) : cursor,
    });
    cursor = addOneCalendarDay(cursor);
    guard += 1;
  }
  return buckets;
}

function toCanonicalAmount(value: Decimal, maxDecimals: number): string {
  const fixed = value
    .toDecimalPlaces(maxDecimals, Decimal.ROUND_HALF_UP)
    .toFixed(maxDecimals);
  const trimmed = fixed.replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
  return trimmed === "-0" ? "0" : trimmed;
}

function getPivotRate(
  snapshot: FxRateSnapshot,
  currency: string,
): Decimal | null {
  const pivot = normalizeCurrencyCode(snapshot.pivotCurrency);
  if (currency === pivot) {
    return new FinanceDecimal(1);
  }
  const rate = snapshot.rates[currency];
  return rate ? parseDecimal(rate) : null;
}

function resolveAmountInBaseCurrency(
  tx: AnalyticsTransactionInput,
  baseCurrency: string,
  fxSnapshot?: FxRateSnapshot,
): string | null {
  const txCurrency = normalizeCurrencyCode(tx.currency);
  const targetCurrency = normalizeCurrencyCode(baseCurrency);
  const sourceMoney = createMoney(tx.amount, txCurrency);

  if (txCurrency === targetCurrency) {
    return sourceMoney.amount;
  }

  const maxDecimals = getCurrencyInfo(targetCurrency).maxDecimals;

  if (tx.fxRateToBase) {
    return toCanonicalAmount(
      parseDecimal(sourceMoney.amount).times(parseDecimal(tx.fxRateToBase)),
      maxDecimals,
    );
  }

  if (fxSnapshot) {
    const fromPivot = getPivotRate(fxSnapshot, txCurrency);
    const toPivot = getPivotRate(fxSnapshot, targetCurrency);
    if (!fromPivot || !toPivot) {
      return null;
    }
    return toCanonicalAmount(
      parseDecimal(sourceMoney.amount).times(toPivot).dividedBy(fromPivot),
      maxDecimals,
    );
  }

  return null;
}

function buildCategoryBreakdown(
  totals: Map<
    string,
    { categoryId: string | null; amount: string; count: number }
  >,
  grandTotal: string,
  baseCurrency: string,
  categoryNames: Map<string, string>,
  uncategorizedLabel: string,
  numberFormat: NumberFormatPreferences,
): CategoryBreakdownItem[] {
  const grandDecimal = parseDecimal(grandTotal);
  const items: CategoryBreakdownItem[] = [];

  for (const entry of totals.values()) {
    const entryDecimal = parseDecimal(entry.amount);
    const sharePercent = grandDecimal.gt(0)
      ? normalizeDecimalString(entryDecimal.div(grandDecimal).times(100))
      : "0";

    items.push({
      categoryId: entry.categoryId,
      categoryName: entry.categoryId
        ? (categoryNames.get(entry.categoryId) ?? uncategorizedLabel)
        : uncategorizedLabel,
      amount: entry.amount,
      formattedAmount: formatMoney(
        createMoney(entry.amount, baseCurrency),
        numberFormat,
      ),
      sharePercent,
      count: entry.count,
    });
  }

  items.sort((a, b) =>
    parseDecimal(b.amount).comparedTo(parseDecimal(a.amount)),
  );
  return items;
}

export function computePeriodAnalytics(
  transactions: readonly AnalyticsTransactionInput[],
  categories: readonly AnalyticsCategoryRef[],
  options: PeriodAnalyticsOptions,
): PeriodAnalyticsReport {
  const { period, referenceDateUtc, preferences, fxSnapshot } = options;
  const baseCurrency = normalizeCurrencyCode(preferences.baseCurrency);
  const bounds = getPeriodBoundsUtc(
    period,
    referenceDateUtc,
    preferences.timezone,
  );
  const numberFormat: NumberFormatPreferences = {
    thousandsSeparator: preferences.thousandsSeparator,
    decimalSeparator: preferences.decimalSeparator,
    symbolPosition: preferences.symbolPosition,
  };
  const uncategorizedLabel =
    preferences.locale === "en" ? "Uncategorized" : "Sin categoría";

  const categoryNames = new Map<string, string>();
  for (const cat of categories) {
    categoryNames.set(cat.id, cat.name);
  }

  const initialBuckets = buildInitialBuckets(
    period,
    bounds.startLocalDate,
    bounds.endLocalDate,
  );
  const bucketMap = new Map<
    string,
    { bucketKey: string; label: string; income: string; expense: string }
  >();
  for (const b of initialBuckets) {
    bucketMap.set(b.bucketKey, {
      bucketKey: b.bucketKey,
      label: b.label,
      income: "0",
      expense: "0",
    });
  }

  let totalIncomeMoney = createMoney("0", baseCurrency);
  let totalExpenseMoney = createMoney("0", baseCurrency);
  let transactionCount = 0;
  let unconvertibleCount = 0;

  const incomeTotals = new Map<
    string,
    { categoryId: string | null; amount: string; count: number }
  >();
  const expenseTotals = new Map<
    string,
    { categoryId: string | null; amount: string; count: number }
  >();

  for (const tx of transactions) {
    if (tx.kind === "transfer") {
      continue;
    }
    if (
      tx.localDate < bounds.startLocalDate ||
      tx.localDate >= bounds.endLocalDate
    ) {
      continue;
    }

    const baseAmount = resolveAmountInBaseCurrency(
      tx,
      baseCurrency,
      fxSnapshot,
    );
    if (baseAmount === null) {
      unconvertibleCount += 1;
      continue;
    }

    transactionCount += 1;
    const baseMoney = createMoney(baseAmount, baseCurrency);
    const catKey = tx.categoryId ?? "__uncategorized__";
    const bucketKey =
      period === "quarterly" || period === "yearly"
        ? tx.localDate.slice(0, 7)
        : tx.localDate;

    const bucket = bucketMap.get(bucketKey);

    if (tx.kind === "income") {
      totalIncomeMoney = addMoney(totalIncomeMoney, baseMoney);
      const prev = incomeTotals.get(catKey);
      incomeTotals.set(catKey, {
        categoryId: tx.categoryId,
        amount: prev
          ? addMoney(createMoney(prev.amount, baseCurrency), baseMoney).amount
          : baseMoney.amount,
        count: (prev?.count ?? 0) + 1,
      });
      if (bucket) {
        bucket.income = addMoney(
          createMoney(bucket.income, baseCurrency),
          baseMoney,
        ).amount;
      }
    } else {
      totalExpenseMoney = addMoney(totalExpenseMoney, baseMoney);
      const prev = expenseTotals.get(catKey);
      expenseTotals.set(catKey, {
        categoryId: tx.categoryId,
        amount: prev
          ? addMoney(createMoney(prev.amount, baseCurrency), baseMoney).amount
          : baseMoney.amount,
        count: (prev?.count ?? 0) + 1,
      });
      if (bucket) {
        bucket.expense = addMoney(
          createMoney(bucket.expense, baseCurrency),
          baseMoney,
        ).amount;
      }
    }
  }

  const netSavingsMoney = subtractMoney(totalIncomeMoney, totalExpenseMoney);
  const incomeDec = parseDecimal(totalIncomeMoney.amount);
  const netDec = parseDecimal(netSavingsMoney.amount);

  const savingsRatePercent = incomeDec.gt(0)
    ? normalizeDecimalString(netDec.div(incomeDec).times(100))
    : "0";

  const series: AnalyticsSeriesPoint[] = [...bucketMap.values()].map((b) => {
    const net = subtractMoney(
      createMoney(b.income, baseCurrency),
      createMoney(b.expense, baseCurrency),
    ).amount;
    return {
      bucketKey: b.bucketKey,
      label: b.label,
      income: b.income,
      expense: b.expense,
      netSavings: net,
    };
  });

  return {
    period,
    timeZone: bounds.timeZone,
    startLocalDate: bounds.startLocalDate,
    endLocalDate: bounds.endLocalDate,
    baseCurrency,
    totalIncome: totalIncomeMoney.amount,
    formattedTotalIncome: formatMoney(totalIncomeMoney, numberFormat),
    totalExpense: totalExpenseMoney.amount,
    formattedTotalExpense: formatMoney(totalExpenseMoney, numberFormat),
    netSavings: netSavingsMoney.amount,
    formattedNetSavings: formatMoney(netSavingsMoney, numberFormat),
    savingsRatePercent,
    transactionCount,
    unconvertibleCount,
    incomeByCategory: buildCategoryBreakdown(
      incomeTotals,
      totalIncomeMoney.amount,
      baseCurrency,
      categoryNames,
      uncategorizedLabel,
      numberFormat,
    ),
    expenseByCategory: buildCategoryBreakdown(
      expenseTotals,
      totalExpenseMoney.amount,
      baseCurrency,
      categoryNames,
      uncategorizedLabel,
      numberFormat,
    ),
    series,
  };
}
