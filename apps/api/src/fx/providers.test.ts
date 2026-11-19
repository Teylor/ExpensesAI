import { describe, expect, it, vi } from "vitest";
import {
  AllFxProvidersFailedError,
  CompositeFxProvider,
  FawazExchangeApiFxProvider,
  FrankfurterFxProvider,
} from "./providers.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Free FX providers (Frankfurter + Fawaz Exchange API + Composite)", () => {
  it("parses Frankfurter ECB payload into a validated FxRateSnapshot", async () => {
    const mockFetch = vi.fn(async () =>
      jsonResponse({
        amount: 1,
        base: "EUR",
        date: "2026-11-19",
        rates: {
          USD: 1.0993,
          JPY: 163.93,
          INVALID_ZERO: 0,
        },
      }),
    );

    const provider = new FrankfurterFxProvider({ fetchFn: mockFetch });
    const snapshot = await provider.fetchLatest("EUR");

    expect(snapshot.pivotCurrency).toBe("EUR");
    expect(snapshot.rateDate).toBe("2026-11-19");
    expect(snapshot.provider).toBe("frankfurter");
    expect(snapshot.rates).toEqual({
      USD: "1.0993",
      JPY: "163.93",
    });
  });

  it("parses Fawaz Exchange API payload normalizing valid currency codes and skipping invalid tickers", async () => {
    const mockFetch = vi.fn(async () =>
      jsonResponse({
        date: "2026-11-19",
        eur: {
          usd: 1.1,
          ars: 1090.5,
          btc: 0.00001234,
          "1inch": 2.5,
          toolongcode: 5,
          zero: 0,
        },
      }),
    );

    const provider = new FawazExchangeApiFxProvider({ fetchFn: mockFetch });
    const snapshot = await provider.fetchLatest("EUR");

    expect(snapshot.provider).toBe("fawaz-exchange-api");
    expect(snapshot.rates).toEqual({
      USD: "1.1",
      ARS: "1090.5",
      BTC: "0.00001234",
    });
  });

  it("falls back to secondary provider when primary provider fails", async () => {
    const failingPrimary = new FrankfurterFxProvider({
      fetchFn: vi.fn(
        async () => new Response("upstream down", { status: 503 }),
      ),
    });
    const healthyFallback = new FawazExchangeApiFxProvider({
      fetchFn: vi.fn(async () =>
        jsonResponse({
          date: "2026-11-19",
          eur: { usd: 1.095, gbp: 0.84 },
        }),
      ),
    });

    const composite = new CompositeFxProvider([
      failingPrimary,
      healthyFallback,
    ]);
    const snapshot = await composite.fetchLatest("EUR");

    expect(snapshot.provider).toBe("fawaz-exchange-api");
    expect(snapshot.rates.USD).toBe("1.095");
    expect(snapshot.rates.GBP).toBe("0.84");
  });

  it("throws AllFxProvidersFailedError when every provider fails", async () => {
    const failing1 = new FrankfurterFxProvider({
      fetchFn: vi.fn(async () => {
        throw new Error("network timeout");
      }),
    });
    const failing2 = new FawazExchangeApiFxProvider({
      fetchFn: vi.fn(async () => new Response("error", { status: 500 })),
    });

    const composite = new CompositeFxProvider([failing1, failing2]);
    await expect(composite.fetchLatest("EUR")).rejects.toThrow(
      AllFxProvidersFailedError,
    );
  });
});
