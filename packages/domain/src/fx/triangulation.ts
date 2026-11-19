import { Decimal } from "decimal.js";
import { z } from "zod";
import { normalizeCurrencyCode } from "../money/currencies.js";
import { FinanceDecimal, parseDecimal } from "../money/money.js";
import {
  currencyCodeSchema,
  positiveDecimalStringSchema,
} from "../money/schemas.js";
import { localDateSchema } from "../time/schemas.js";

export const fxRateSnapshotSchema = z.object({
  pivotCurrency: currencyCodeSchema,
  rateDate: localDateSchema,
  provider: z.string().min(1),
  fetchedAt: z.string().min(1),
  rates: z.record(currencyCodeSchema, positiveDecimalStringSchema),
});

export type FxRateSnapshot = z.infer<typeof fxRateSnapshotSchema>;

export class MissingFxRateError extends Error {
  readonly fromCurrency: string;
  readonly toCurrency: string;

  constructor(fromCurrency: string, toCurrency: string) {
    super(`FX rate not available for pair ${fromCurrency}/${toCurrency}`);
    this.name = "MissingFxRateError";
    this.fromCurrency = fromCurrency;
    this.toCurrency = toCurrency;
  }
}

function getRateFromPivot(
  snapshot: FxRateSnapshot,
  currency: string,
): Decimal | null {
  const pivot = normalizeCurrencyCode(snapshot.pivotCurrency);
  if (currency === pivot) {
    return new FinanceDecimal(1);
  }
  const rawRate = snapshot.rates[currency];
  if (!rawRate) {
    return null;
  }
  return parseDecimal(rawRate);
}

function formatCanonicalRate(value: Decimal): string {
  const rounded = value.toDecimalPlaces(8, Decimal.ROUND_HALF_UP);
  return rounded.toFixed().replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
}

export function resolveCrossRate(
  snapshot: FxRateSnapshot,
  fromCurrency: string,
  toCurrency: string,
): string {
  const from = normalizeCurrencyCode(fromCurrency);
  const to = normalizeCurrencyCode(toCurrency);

  if (from === to) {
    return "1";
  }

  const fromPivotRate = getRateFromPivot(snapshot, from);
  const toPivotRate = getRateFromPivot(snapshot, to);

  if (!fromPivotRate || !toPivotRate) {
    throw new MissingFxRateError(from, to);
  }

  const crossRate = toPivotRate.dividedBy(fromPivotRate);
  return formatCanonicalRate(crossRate);
}
