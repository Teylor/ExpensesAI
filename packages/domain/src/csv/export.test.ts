import { describe, expect, it } from "vitest";
import {
  DEFAULT_USER_PREFERENCES,
  type UserPreferences,
} from "../user/preferences.js";
import {
  exportAccountsToCsv,
  exportInvestmentsToCsv,
  exportNetWorthToCsv,
  exportTransactionsToCsv,
} from "./export.js";

const EN_PREFS: UserPreferences = {
  ...DEFAULT_USER_PREFERENCES,
  locale: "en",
  thousandsSeparator: ",",
  decimalSeparator: ".",
  symbolPosition: "before",
  baseCurrency: "USD",
};

describe("CSV Exporter (RFC 4180, ES/EN locale, separator adaptation & CSV Injection protection)", () => {
  it("uses semicolon delimiter for ES comma-decimal locale and neutralizes CSV formula injection", () => {
    const csv = exportTransactionsToCsv(
      [
        {
          localDate: "2026-11-20",
          kind: "expense",
          amount: "1234.56",
          currency: "EUR",
          description: '=HYPERLINK("http://evil.example","Click")',
          clientOrPayee: "+SUM(A1:A5)",
          source: "manual",
        },
      ],
      DEFAULT_USER_PREFERENCES,
    );

    const lines = csv.replace(/^\uFEFF/, "").split("\r\n");
    expect(lines[0]).toBe(
      "Fecha;Tipo;Importe;Divisa;Descripción;Cliente/Comercio;Origen",
    );
    expect(lines[1]).toContain("1234,56");
    // Formula prefixes (= and +) MUST be neutralized with leading single quote
    expect(lines[1]).toContain("\"'=HYPERLINK(");
    expect(lines[1]).toContain("'+SUM(A1:A5)");
  });

  it("uses comma delimiter for EN dot-decimal locale across accounts, investments, and net worth", () => {
    const accCsv = exportAccountsToCsv(
      [
        {
          name: "Main Bank",
          accountType: "bank",
          currency: "USD",
          balance: "3500.75",
          isArchived: false,
        },
      ],
      EN_PREFS,
    );
    expect(accCsv).toContain("Name,Type,Currency,Balance,Archived");
    expect(accCsv).toContain("Main Bank,bank,USD,3500.75,No");

    const invCsv = exportInvestmentsToCsv(
      [
        {
          assetType: "ETF",
          name: "Vanguard S&P 500",
          symbol: "VOO",
          quantity: "5",
          investedAmount: "2000",
          currentValue: "2450.5",
          currency: "USD",
        },
      ],
      EN_PREFS,
    );
    expect(invCsv).toContain(
      "Asset Type,Name,Symbol,Quantity,Invested,Current Value,Currency",
    );
    expect(invCsv).toContain("ETF,Vanguard S&P 500,VOO,5,2000,2450.5,USD");

    const nwCsv = exportNetWorthToCsv(
      [
        {
          kind: "liability",
          category: "Mortgage",
          name: "Home Loan",
          estimatedValue: "120000",
          currency: "USD",
        },
      ],
      EN_PREFS,
    );
    expect(nwCsv).toContain("Kind,Category,Name,Estimated Value,Currency");
    expect(nwCsv).toContain("liability,Mortgage,Home Loan,120000,USD");
  });
});
