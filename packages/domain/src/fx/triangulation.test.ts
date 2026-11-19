import { describe, expect, it } from "vitest";
import {
  type FxRateSnapshot,
  fxRateSnapshotSchema,
  MissingFxRateError,
  resolveCrossRate,
} from "./triangulation.js";

const SAMPLE_SNAPSHOT: FxRateSnapshot = {
  pivotCurrency: "EUR",
  rateDate: "2026-11-19",
  provider: "frankfurter",
  fetchedAt: "2026-11-19T16:30:00.000Z",
  rates: {
    USD: "1.1",
    JPY: "165",
    GBP: "0.85",
  },
};

describe("FX triangulation and snapshot contract", () => {
  it("validates FxRateSnapshot payloads with Zod", () => {
    const parsed = fxRateSnapshotSchema.parse(SAMPLE_SNAPSHOT);
    expect(parsed.pivotCurrency).toBe("EUR");
    expect(parsed.rates.USD).toBe("1.1");

    expect(() =>
      fxRateSnapshotSchema.parse({
        ...SAMPLE_SNAPSHOT,
        rates: { USD: "-1.1" },
      }),
    ).toThrow();
  });

  it("returns '1' for identical source and target currencies", () => {
    expect(resolveCrossRate(SAMPLE_SNAPSHOT, "EUR", "eur")).toBe("1");
    expect(resolveCrossRate(SAMPLE_SNAPSHOT, "USD", "USD")).toBe("1");
  });

  it("resolves direct rates from pivot currency and inverse rates to pivot currency", () => {
    expect(resolveCrossRate(SAMPLE_SNAPSHOT, "EUR", "USD")).toBe("1.1");
    // 1 / 1.1 = 0.909090909... -> rounded HALF_UP to 8 decimals = 0.90909091
    expect(resolveCrossRate(SAMPLE_SNAPSHOT, "USD", "EUR")).toBe("0.90909091");
  });

  it("triangulates cross rates between two non-pivot currencies accurately", () => {
    // 1 JPY -> USD = (1.1 / 165) = 0.0066666666... -> 0.00666667
    expect(resolveCrossRate(SAMPLE_SNAPSHOT, "JPY", "USD")).toBe("0.00666667");
    // 1 USD -> JPY = (165 / 1.1) = 150
    expect(resolveCrossRate(SAMPLE_SNAPSHOT, "usd", "jpy")).toBe("150");
  });

  it("throws MissingFxRateError when either currency is unavailable in snapshot", () => {
    expect(() => resolveCrossRate(SAMPLE_SNAPSHOT, "BRL", "EUR")).toThrow(
      MissingFxRateError,
    );
    expect(() => resolveCrossRate(SAMPLE_SNAPSHOT, "EUR", "BRL")).toThrow(
      MissingFxRateError,
    );
  });
});
