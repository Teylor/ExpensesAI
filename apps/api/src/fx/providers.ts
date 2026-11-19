import {
  CURRENCY_CODE_PATTERN,
  FinanceDecimal,
  type FxRateSnapshot,
  fxRateSnapshotSchema,
  normalizeCurrencyCode,
} from "@agenticf/domain";

export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface FxProvider {
  readonly name: string;
  fetchLatest(pivotCurrency: string): Promise<FxRateSnapshot>;
}

export interface HttpFxProviderOptions {
  fetchFn?: FetchLike;
  timeoutMs?: number;
  now?: () => Date;
}

export class AllFxProvidersFailedError extends Error {
  readonly causes: readonly unknown[];

  constructor(causes: readonly unknown[]) {
    super(`All FX providers failed (${causes.length} attempted)`);
    this.name = "AllFxProvidersFailedError";
    this.causes = causes;
  }
}

function sanitizeRateMap(
  rawRates: Record<string, unknown>,
  pivotCurrency: string,
): Record<string, string> {
  const sanitized: Record<string, string> = {};

  for (const [rawCode, rawValue] of Object.entries(rawRates)) {
    const code = rawCode.trim().toUpperCase();
    if (!CURRENCY_CODE_PATTERN.test(code) || code === pivotCurrency) {
      continue;
    }

    if (typeof rawValue !== "number" && typeof rawValue !== "string") {
      continue;
    }

    if (
      typeof rawValue === "number" &&
      (!Number.isFinite(rawValue) || rawValue <= 0)
    ) {
      continue;
    }

    try {
      const dec = new FinanceDecimal(
        typeof rawValue === "number"
          ? rawValue.toPrecision(12)
          : rawValue.trim(),
      );
      if (!dec.isFinite() || dec.lessThanOrEqualTo(0)) {
        continue;
      }
      const canonical = dec
        .toDecimalPlaces(8)
        .toFixed()
        .replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
      if (canonical !== "0") {
        sanitized[code] = canonical;
      }
    } catch {
      // Skip malformed external ticker value
    }
  }

  return sanitized;
}

export class FrankfurterFxProvider implements FxProvider {
  readonly name = "frankfurter";
  private readonly fetchFn: FetchLike;
  private readonly timeoutMs: number;
  private readonly now: () => Date;

  constructor(options?: HttpFxProviderOptions) {
    this.fetchFn = options?.fetchFn ?? fetch;
    this.timeoutMs = options?.timeoutMs ?? 8_000;
    this.now = options?.now ?? (() => new Date());
  }

  async fetchLatest(pivotCurrency: string): Promise<FxRateSnapshot> {
    const pivot = normalizeCurrencyCode(pivotCurrency);
    const url = `https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(pivot)}`;

    const response = await this.fetchFn(url, {
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: { accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Frankfurter API responded with HTTP ${response.status}`);
    }

    const payload = (await response.json()) as {
      date?: unknown;
      rates?: unknown;
    };

    if (
      typeof payload.date !== "string" ||
      !payload.rates ||
      typeof payload.rates !== "object"
    ) {
      throw new Error("Invalid Frankfurter API payload structure");
    }

    const rates = sanitizeRateMap(
      payload.rates as Record<string, unknown>,
      pivot,
    );

    if (Object.keys(rates).length === 0) {
      throw new Error("Frankfurter API returned no valid FX rates");
    }

    return fxRateSnapshotSchema.parse({
      pivotCurrency: pivot,
      rateDate: payload.date,
      provider: this.name,
      fetchedAt: this.now().toISOString(),
      rates,
    });
  }
}

export class FawazExchangeApiFxProvider implements FxProvider {
  readonly name = "fawaz-exchange-api";
  private readonly fetchFn: FetchLike;
  private readonly timeoutMs: number;
  private readonly now: () => Date;

  constructor(options?: HttpFxProviderOptions) {
    this.fetchFn = options?.fetchFn ?? fetch;
    this.timeoutMs = options?.timeoutMs ?? 8_000;
    this.now = options?.now ?? (() => new Date());
  }

  async fetchLatest(pivotCurrency: string): Promise<FxRateSnapshot> {
    const pivot = normalizeCurrencyCode(pivotCurrency);
    const lowerPivot = pivot.toLowerCase();
    const url = `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${encodeURIComponent(lowerPivot)}.json`;

    const response = await this.fetchFn(url, {
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: { accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(
        `Fawaz Exchange API responded with HTTP ${response.status}`,
      );
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const rawDate = payload.date;
    const rawRates = payload[lowerPivot];

    if (
      typeof rawDate !== "string" ||
      !rawRates ||
      typeof rawRates !== "object"
    ) {
      throw new Error("Invalid Fawaz Exchange API payload structure");
    }

    const rates = sanitizeRateMap(rawRates as Record<string, unknown>, pivot);

    if (Object.keys(rates).length === 0) {
      throw new Error("Fawaz Exchange API returned no valid FX rates");
    }

    return fxRateSnapshotSchema.parse({
      pivotCurrency: pivot,
      rateDate: rawDate,
      provider: this.name,
      fetchedAt: this.now().toISOString(),
      rates,
    });
  }
}

export class CompositeFxProvider implements FxProvider {
  readonly name = "composite";
  private readonly providers: readonly FxProvider[];

  constructor(providers: readonly FxProvider[]) {
    if (providers.length === 0) {
      throw new Error("CompositeFxProvider requires at least one provider");
    }
    this.providers = providers;
  }

  async fetchLatest(pivotCurrency: string): Promise<FxRateSnapshot> {
    const errors: unknown[] = [];

    for (const provider of this.providers) {
      try {
        return await provider.fetchLatest(pivotCurrency);
      } catch (error) {
        errors.push(error);
      }
    }

    throw new AllFxProvidersFailedError(errors);
  }
}

export function createDefaultFxProvider(
  options?: HttpFxProviderOptions,
): CompositeFxProvider {
  return new CompositeFxProvider([
    new FrankfurterFxProvider(options),
    new FawazExchangeApiFxProvider(options),
  ]);
}
