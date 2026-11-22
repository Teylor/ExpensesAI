import {
  type BalancesSummary,
  type FxRateSnapshot,
  t,
  type UserPreferences,
} from "@agenticf/domain";
import { ArrowRight, PlusCircle, RefreshCw, Wallet } from "lucide-react";
import type { AppTab } from "../../navigation/tabs.js";
import type {
  LocalAccount,
  LocalCategory,
  LocalTransaction,
} from "../../offline/db.js";
import { AnalyticsPanel } from "../AnalyticsPanel.js";

export interface OverviewTabProps {
  readonly balancesSummary: BalancesSummary;
  readonly accounts: readonly LocalAccount[];
  readonly transactions: readonly LocalTransaction[];
  readonly categories: readonly LocalCategory[];
  readonly preferences: UserPreferences;
  readonly fxSnapshot?: FxRateSnapshot;
  readonly pendingCount: number;
  readonly isSyncing: boolean;
  readonly onSyncNow: () => void;
  readonly onSelectTab: (tab: AppTab) => void;
}

export function OverviewTab({
  balancesSummary,
  accounts,
  transactions,
  categories,
  preferences,
  fxSnapshot,
  pendingCount,
  isSyncing,
  onSyncNow,
  onSelectTab,
}: OverviewTabProps) {
  const locale = preferences.locale;

  return (
    <div className="space-y-6">
      {/* Hero Balance KPI Strip */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <div className="rounded-2xl border border-emerald-500/30 bg-(--bg-surface) p-5">
          <span className="text-xs uppercase tracking-wider text-(--text-secondary)">
            {t(locale, "overview.totalBalance")}
          </span>
          <p className="mt-2 text-2xl font-bold tabular-nums text-emerald-400 sm:text-3xl">
            {balancesSummary.formattedTotalBalance}
          </p>
        </div>

        <div className="rounded-2xl border border-(--border-subtle) bg-(--bg-surface) p-5">
          <span className="text-xs uppercase tracking-wider text-(--text-secondary)">
            {t(locale, "account.type.cash")}
          </span>
          <p className="mt-2 text-xl font-bold tabular-nums text-(--text-primary) sm:text-2xl">
            {balancesSummary.formattedCashBalance}
          </p>
        </div>

        <div className="rounded-2xl border border-(--border-subtle) bg-(--bg-surface) p-5">
          <span className="text-xs uppercase tracking-wider text-(--text-secondary)">
            {t(locale, "overview.statusTitle")}
          </span>
          {pendingCount > 0 ? (
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-xl font-bold tabular-nums text-amber-300">
                {t(locale, "shell.pendingCount", { count: pendingCount })}
              </p>
              <button
                type="button"
                onClick={onSyncNow}
                disabled={isSyncing}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-200 ring-1 ring-amber-500/40 hover:bg-amber-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`}
                  aria-hidden={true}
                />
                <span>{t(locale, "shell.sync")}</span>
              </button>
            </div>
          ) : (
            <p className="mt-2 text-base font-semibold text-(--text-primary) sm:text-lg">
              {t(locale, "overview.accountsSynced", { count: accounts.length })}
            </p>
          )}
        </div>
      </section>

      {/* Onboarding CTA or Quick Actions */}
      {accounts.length === 0 ? (
        <section className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-emerald-500/25 bg-emerald-950/20 p-5 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
              <Wallet className="h-5 w-5" aria-hidden={true} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-(--text-primary)">
                {t(locale, "overview.onboardingTitle")}
              </h2>
              <p className="mt-0.5 text-xs text-(--text-secondary)">
                {t(locale, "overview.onboardingDesc")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onSelectTab("accounts")}
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
          >
            <span>{t(locale, "overview.createFirstAccount")}</span>
            <ArrowRight className="h-4 w-4" aria-hidden={true} />
          </button>
        </section>
      ) : (
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => onSelectTab("activity")}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 sm:min-h-10"
          >
            <PlusCircle className="h-4 w-4" aria-hidden={true} />
            <span>{t(locale, "overview.quickRecord")}</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectTab("accounts")}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-(--border-subtle) bg-(--bg-surface) px-4 py-2 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-strong) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:min-h-10"
          >
            <Wallet className="h-4 w-4 text-emerald-400" aria-hidden={true} />
            <span>{t(locale, "overview.viewAccounts")}</span>
          </button>
        </div>
      )}

      {/* Analytics & Savings */}
      <AnalyticsPanel
        transactions={transactions}
        categories={categories}
        preferences={preferences}
        {...(fxSnapshot ? { fxSnapshot } : {})}
      />
    </div>
  );
}
