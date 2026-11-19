export type CurrencyKind = "fiat" | "crypto";

export interface CurrencyInfo {
  readonly code: string;
  readonly symbol: string;
  readonly decimals: number;
  readonly minDecimals: number;
  readonly maxDecimals: number;
  readonly kind: CurrencyKind;
}

export class InvalidCurrencyError extends Error {
  readonly code: string;

  constructor(rawCurrency: string) {
    super(`Invalid currency code: "${rawCurrency}"`);
    this.name = "InvalidCurrencyError";
    this.code = rawCurrency;
  }
}

export const CURRENCY_CODE_PATTERN = /^[A-Z]{3,6}$/;

const KNOWN_CURRENCIES: Readonly<Record<string, CurrencyInfo>> = {
  EUR: {
    code: "EUR",
    symbol: "€",
    decimals: 2,
    minDecimals: 2,
    maxDecimals: 2,
    kind: "fiat",
  },
  USD: {
    code: "USD",
    symbol: "$",
    decimals: 2,
    minDecimals: 2,
    maxDecimals: 2,
    kind: "fiat",
  },
  GBP: {
    code: "GBP",
    symbol: "£",
    decimals: 2,
    minDecimals: 2,
    maxDecimals: 2,
    kind: "fiat",
  },
  JPY: {
    code: "JPY",
    symbol: "¥",
    decimals: 0,
    minDecimals: 0,
    maxDecimals: 0,
    kind: "fiat",
  },
  CHF: {
    code: "CHF",
    symbol: "CHF",
    decimals: 2,
    minDecimals: 2,
    maxDecimals: 2,
    kind: "fiat",
  },
  CAD: {
    code: "CAD",
    symbol: "CA$",
    decimals: 2,
    minDecimals: 2,
    maxDecimals: 2,
    kind: "fiat",
  },
  AUD: {
    code: "AUD",
    symbol: "A$",
    decimals: 2,
    minDecimals: 2,
    maxDecimals: 2,
    kind: "fiat",
  },
  MXN: {
    code: "MXN",
    symbol: "MX$",
    decimals: 2,
    minDecimals: 2,
    maxDecimals: 2,
    kind: "fiat",
  },
  BTC: {
    code: "BTC",
    symbol: "BTC",
    decimals: 8,
    minDecimals: 0,
    maxDecimals: 8,
    kind: "crypto",
  },
  ETH: {
    code: "ETH",
    symbol: "ETH",
    decimals: 8,
    minDecimals: 0,
    maxDecimals: 8,
    kind: "crypto",
  },
  SOL: {
    code: "SOL",
    symbol: "SOL",
    decimals: 8,
    minDecimals: 0,
    maxDecimals: 8,
    kind: "crypto",
  },
  USDC: {
    code: "USDC",
    symbol: "USDC",
    decimals: 6,
    minDecimals: 2,
    maxDecimals: 6,
    kind: "crypto",
  },
  USDT: {
    code: "USDT",
    symbol: "USDT",
    decimals: 6,
    minDecimals: 2,
    maxDecimals: 6,
    kind: "crypto",
  },
};

export function normalizeCurrencyCode(rawCurrency: string): string {
  const normalized = rawCurrency.trim().toUpperCase();
  if (!CURRENCY_CODE_PATTERN.test(normalized)) {
    throw new InvalidCurrencyError(rawCurrency);
  }
  return normalized;
}

export function getCurrencyInfo(rawCurrency: string): CurrencyInfo {
  const code = normalizeCurrencyCode(rawCurrency);
  const known = KNOWN_CURRENCIES[code];
  if (known) {
    return known;
  }

  return {
    code,
    symbol: code,
    decimals: 2,
    minDecimals: 2,
    maxDecimals: 2,
    kind: "fiat",
  };
}
