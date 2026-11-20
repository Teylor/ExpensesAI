import type { UserPreferences } from "../user/preferences.js";

const CSV_FORMULA_PREFIX = /^[=+\-@\t\r]/;
const UTF8_BOM = "\uFEFF";

export interface CsvAccountRow {
  readonly name: string;
  readonly accountType: string;
  readonly currency: string;
  readonly balance: string;
  readonly isArchived: boolean;
}

export interface CsvTransactionRow {
  readonly localDate: string;
  readonly kind: string;
  readonly amount: string;
  readonly currency: string;
  readonly description: string;
  readonly clientOrPayee: string | null;
  readonly source: string;
}

export interface CsvInvestmentRow {
  readonly assetType: string;
  readonly name: string;
  readonly symbol: string | null;
  readonly quantity: string | null;
  readonly investedAmount: string;
  readonly currentValue: string;
  readonly currency: string;
}

export interface CsvNetWorthRow {
  readonly kind: string;
  readonly category: string;
  readonly name: string;
  readonly estimatedValue: string;
  readonly currency: string;
}

function getCsvDelimiter(preferences: UserPreferences): string {
  return preferences.decimalSeparator === "," ? ";" : ",";
}

function formatNumericCell(
  rawDecimal: string | null | undefined,
  preferences: UserPreferences,
): string {
  if (!rawDecimal) return "";
  return preferences.decimalSeparator === ","
    ? rawDecimal.replace(".", ",")
    : rawDecimal;
}

function escapeCsvCell(
  rawValue: string | null | undefined,
  delimiter: string,
  isNumeric = false,
): string {
  let value = rawValue ?? "";
  if (!isNumeric && CSV_FORMULA_PREFIX.test(value)) {
    value = `'${value}`;
  }
  const needsQuoting =
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r");
  if (!needsQuoting) {
    return value;
  }
  return `"${value.replace(/"/g, '""')}"`;
}

function buildCsvDocument(
  headers: readonly string[],
  rows: readonly (readonly { value: string; numeric?: boolean }[])[],
  preferences: UserPreferences,
): string {
  const delimiter = getCsvDelimiter(preferences);
  const lines: string[] = [
    headers.map((h) => escapeCsvCell(h, delimiter, false)).join(delimiter),
  ];

  for (const row of rows) {
    lines.push(
      row
        .map((cell) => escapeCsvCell(cell.value, delimiter, cell.numeric))
        .join(delimiter),
    );
  }

  return `${UTF8_BOM}${lines.join("\r\n")}`;
}

export function exportAccountsToCsv(
  accounts: readonly CsvAccountRow[],
  preferences: UserPreferences,
): string {
  const isEn = preferences.locale === "en";
  const headers = isEn
    ? ["Name", "Type", "Currency", "Balance", "Archived"]
    : ["Nombre", "Tipo", "Divisa", "Saldo", "Archivada"];

  const rows = accounts.map((a) => [
    { value: a.name },
    { value: a.accountType },
    { value: a.currency },
    { value: formatNumericCell(a.balance, preferences), numeric: true },
    { value: a.isArchived ? (isEn ? "Yes" : "Sí") : "No" },
  ]);

  return buildCsvDocument(headers, rows, preferences);
}

export function exportTransactionsToCsv(
  transactions: readonly CsvTransactionRow[],
  preferences: UserPreferences,
): string {
  const isEn = preferences.locale === "en";
  const headers = isEn
    ? ["Date", "Kind", "Amount", "Currency", "Description", "Payee", "Source"]
    : [
        "Fecha",
        "Tipo",
        "Importe",
        "Divisa",
        "Descripción",
        "Cliente/Comercio",
        "Origen",
      ];

  const rows = transactions.map((tx) => [
    { value: tx.localDate },
    { value: tx.kind },
    { value: formatNumericCell(tx.amount, preferences), numeric: true },
    { value: tx.currency },
    { value: tx.description },
    { value: tx.clientOrPayee ?? "" },
    { value: tx.source },
  ]);

  return buildCsvDocument(headers, rows, preferences);
}

export function exportInvestmentsToCsv(
  investments: readonly CsvInvestmentRow[],
  preferences: UserPreferences,
): string {
  const isEn = preferences.locale === "en";
  const headers = isEn
    ? [
        "Asset Type",
        "Name",
        "Symbol",
        "Quantity",
        "Invested",
        "Current Value",
        "Currency",
      ]
    : [
        "Tipo",
        "Nombre",
        "Símbolo",
        "Cantidad",
        "Invertido",
        "Valor Actual",
        "Divisa",
      ];

  const rows = investments.map((inv) => [
    { value: inv.assetType },
    { value: inv.name },
    { value: inv.symbol ?? "" },
    { value: formatNumericCell(inv.quantity, preferences), numeric: true },
    {
      value: formatNumericCell(inv.investedAmount, preferences),
      numeric: true,
    },
    { value: formatNumericCell(inv.currentValue, preferences), numeric: true },
    { value: inv.currency },
  ]);

  return buildCsvDocument(headers, rows, preferences);
}

export function exportNetWorthToCsv(
  items: readonly CsvNetWorthRow[],
  preferences: UserPreferences,
): string {
  const isEn = preferences.locale === "en";
  const headers = isEn
    ? ["Kind", "Category", "Name", "Estimated Value", "Currency"]
    : ["Tipo", "Categoría", "Nombre", "Valor Estimado", "Divisa"];

  const rows = items.map((item) => [
    { value: item.kind },
    { value: item.category },
    { value: item.name },
    {
      value: formatNumericCell(item.estimatedValue, preferences),
      numeric: true,
    },
    { value: item.currency },
  ]);

  return buildCsvDocument(headers, rows, preferences);
}
