import type { FxRateSnapshot } from "@agenticf/domain";
import { describe, expect, it } from "vitest";
import { buildApp } from "../app.js";

const SAMPLE_SNAPSHOT: FxRateSnapshot = {
  pivotCurrency: "EUR",
  rateDate: "2026-11-19",
  provider: "frankfurter",
  fetchedAt: "2026-11-19T16:30:00.000Z",
  rates: {
    USD: "1.1",
    JPY: "165",
  },
};

describe("FX REST routes (/api/v1/fx/latest, /api/v1/fx/convert)", () => {
  it("returns latest cached FX snapshot with Cache-Control header for PWA offline sync", async () => {
    const app = await buildApp({
      corsOrigin: "http://localhost:5173",
      logLevel: "silent",
      checkDatabase: async () => true,
      fxRateReader: { getLatestSnapshot: async () => SAMPLE_SNAPSHOT },
    });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/fx/latest",
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("public, max-age=3600");
      expect(response.json()).toEqual(SAMPLE_SNAPSHOT);
    } finally {
      await app.close();
    }
  });

  it("returns 503 when FX rates are unavailable", async () => {
    const app = await buildApp({
      corsOrigin: "http://localhost:5173",
      logLevel: "silent",
      checkDatabase: async () => true,
      fxRateReader: { getLatestSnapshot: async () => null },
    });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/fx/latest",
      });

      expect(response.statusCode).toBe(503);
      expect(response.json().error).toBe("FX_UNAVAILABLE");
    } finally {
      await app.close();
    }
  });

  it("converts currency pairs accurately using domain triangulation", async () => {
    const app = await buildApp({
      corsOrigin: "http://localhost:5173",
      logLevel: "silent",
      checkDatabase: async () => true,
      fxRateReader: { getLatestSnapshot: async () => SAMPLE_SNAPSHOT },
    });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/fx/convert?from=usd&to=jpy&amount=10",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        from: "USD",
        to: "JPY",
        amount: "10",
        rate: "150",
        convertedAmount: "1500",
        rateDate: "2026-11-19",
        provider: "frankfurter",
      });
    } finally {
      await app.close();
    }
  });

  it("returns 404 for unknown currency in snapshot and 400 for invalid query params", async () => {
    const app = await buildApp({
      corsOrigin: "http://localhost:5173",
      logLevel: "silent",
      checkDatabase: async () => true,
      fxRateReader: { getLatestSnapshot: async () => SAMPLE_SNAPSHOT },
    });

    try {
      const missing = await app.inject({
        method: "GET",
        url: "/api/v1/fx/convert?from=BRL&to=EUR&amount=100",
      });
      expect(missing.statusCode).toBe(404);
      expect(missing.json().error).toBe("FX_RATE_NOT_FOUND");

      const invalid = await app.inject({
        method: "GET",
        url: "/api/v1/fx/convert?from=12&to=EUR&amount=not-a-number",
      });
      expect(invalid.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});
