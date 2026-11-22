import {
  exportAccountsToCsv,
  exportInvestmentsToCsv,
  exportNetWorthToCsv,
  exportTransactionsToCsv,
  t,
  type UserPreferences,
} from "@agenticf/domain";
import { CheckCircle2, Download } from "lucide-react";
import { useState } from "react";
import type {
  LocalAccount,
  LocalInvestment,
  LocalNetWorthItem,
  LocalTransaction,
} from "../offline/db.js";

export interface CsvExportCardProps {
  readonly accounts: readonly LocalAccount[];
  readonly transactions: readonly LocalTransaction[];
  readonly investments: readonly LocalInvestment[];
  readonly netWorthItems: readonly LocalNetWorthItem[];
  readonly preferences: UserPreferences;
}

function triggerCsvDownload(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function CsvExportCard({
  accounts,
  transactions,
  investments,
  netWorthItems,
  preferences,
}: CsvExportCardProps) {
  const locale = preferences.locale;
  const [downloadedFile, setDownloadedFile] = useState<string | null>(null);

  const exportItems = [
    {
      id: "accounts",
      filename: "agenticf-accounts.csv",
      label: locale === "en" ? "CSV Accounts" : "CSV Cuentas",
      count: accounts.length,
      build: () => exportAccountsToCsv(accounts, preferences),
    },
    {
      id: "transactions",
      filename: "agenticf-transactions.csv",
      label: locale === "en" ? "CSV Transactions" : "CSV Movimientos",
      count: transactions.length,
      build: () => exportTransactionsToCsv(transactions, preferences),
    },
    {
      id: "investments",
      filename: "agenticf-investments.csv",
      label: locale === "en" ? "CSV Investments" : "CSV Inversiones",
      count: investments.length,
      build: () => exportInvestmentsToCsv(investments, preferences),
    },
    {
      id: "networth",
      filename: "agenticf-networth.csv",
      label: locale === "en" ? "CSV Net Worth" : "CSV Patrimonio",
      count: netWorthItems.length,
      build: () => exportNetWorthToCsv(netWorthItems, preferences),
    },
  ] as const;

  return (
    <section
      data-testid="csv-export-card"
      className="rounded-2xl border border-(--border-subtle) bg-(--bg-surface) p-5"
    >
      <h2 className="flex items-center gap-2 text-base font-semibold text-(--text-primary)">
        <Download className="h-4 w-4 text-emerald-400" aria-hidden={true} />
        <span>{t(locale, "manage.exportsTitle")}</span>
      </h2>
      <p className="mt-1 text-xs text-(--text-secondary)">
        {t(locale, "manage.exportsDesc")}
      </p>

      <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {exportItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              triggerCsvDownload(item.filename, item.build());
              setDownloadedFile(item.filename);
            }}
            className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-(--border-subtle) bg-(--bg-input) px-3.5 py-2.5 text-left transition hover:border-emerald-500/40 hover:bg-(--bg-surface-strong) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-(--text-primary)">
                {item.label}
              </p>
              <p className="text-xs tabular-nums text-(--text-secondary)">
                {t(locale, "manage.exportsCount", { count: item.count })}
              </p>
            </div>
            <Download
              className="h-4 w-4 shrink-0 text-emerald-400"
              aria-hidden={true}
            />
          </button>
        ))}
      </div>

      {downloadedFile && (
        <p
          role="status"
          aria-live="polite"
          className="mt-3 flex items-center gap-1.5 text-xs text-emerald-300"
        >
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden={true} />
          <span>
            {t(locale, "manage.exportsDownloaded", {
              filename: downloadedFile,
            })}
          </span>
        </p>
      )}
    </section>
  );
}
