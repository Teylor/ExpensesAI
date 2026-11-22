import {
  computePeriodAnalytics,
  FINANCIAL_PERIODS,
  type FinancialPeriod,
  type FxRateSnapshot,
  type MessageKey,
  t,
  type UserPreferences,
} from "@agenticf/domain";
import { BarChart3, PiggyBank } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { LocalCategory, LocalTransaction } from "../offline/db.js";

export interface AnalyticsPanelProps {
  readonly transactions: readonly LocalTransaction[];
  readonly categories: readonly LocalCategory[];
  readonly preferences: UserPreferences;
  readonly fxSnapshot?: FxRateSnapshot;
}

export function AnalyticsPanel({
  transactions,
  categories,
  preferences,
  fxSnapshot,
}: AnalyticsPanelProps) {
  const [period, setPeriod] = useState<FinancialPeriod>("monthly");
  const locale = preferences.locale;

  const report = useMemo(
    () =>
      computePeriodAnalytics(
        transactions.map((tx) => ({
          id: tx.id,
          kind: tx.kind,
          amount: tx.amount,
          currency: tx.currency,
          fxRateToBase: tx.fxRateToBase,
          localDate: tx.localDate,
          categoryId: tx.categoryId,
        })),
        categories.map((c) => ({ id: c.id, name: c.name })),
        {
          period,
          referenceDateUtc: new Date(),
          preferences,
          ...(fxSnapshot ? { fxSnapshot } : {}),
        },
      ),
    [transactions, categories, period, preferences, fxSnapshot],
  );

  const chartData = useMemo(
    () =>
      report.series.map((point) => ({
        label: point.label,
        income: Number(point.income),
        expense: Number(point.expense),
      })),
    [report.series],
  );

  const hasPeriodActivity =
    Number(report.totalIncome) > 0 || Number(report.totalExpense) > 0;
  const savingsRateNum = Number(report.savingsRatePercent);

  return (
    <section className="rounded-2xl border border-(--border-subtle) bg-(--bg-surface) p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-(--text-primary)">
            <BarChart3
              className="h-4 w-4 text-emerald-400"
              aria-hidden={true}
            />
            <span>
              {locale === "en" ? "Analytics & Savings" : "Analítica y Ahorro"}
            </span>
          </h2>
          <p className="mt-0.5 text-xs text-(--text-secondary)">
            {report.startLocalDate} → {report.endLocalDate} ({report.timeZone})
          </p>
        </div>

        <div
          role="tablist"
          aria-label={locale === "en" ? "Analytics period" : "Periodo"}
          className="flex overflow-x-auto rounded-xl bg-(--bg-input) p-1 ring-1 ring-(--border-subtle)"
        >
          {FINANCIAL_PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={period === p}
              onClick={() => setPeriod(p)}
              className={`min-h-10 shrink-0 rounded-lg px-3 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:min-h-8 ${
                period === p
                  ? "bg-emerald-500 text-zinc-950"
                  : "text-(--text-secondary) hover:text-(--text-primary)"
              }`}
            >
              {t(locale, `period.${p}` as MessageKey)}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Row: 2x2 on mobile/tablet, 4-col on lg+ */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-(--border-subtle) bg-(--bg-input) p-3.5">
          <span className="text-[11px] uppercase tracking-wider text-(--text-secondary)">
            {locale === "en" ? "Income" : "Ingresos"}
          </span>
          <p className="mt-1 text-base font-bold tabular-nums text-emerald-400 sm:text-lg">
            {report.formattedTotalIncome}
          </p>
        </div>

        <div className="rounded-xl border border-(--border-subtle) bg-(--bg-input) p-3.5">
          <span className="text-[11px] uppercase tracking-wider text-(--text-secondary)">
            {locale === "en" ? "Expenses" : "Gastos"}
          </span>
          <p className="mt-1 text-base font-bold tabular-nums text-rose-400 sm:text-lg">
            {report.formattedTotalExpense}
          </p>
        </div>

        <div className="rounded-xl border border-(--border-subtle) bg-(--bg-input) p-3.5">
          <span className="text-[11px] uppercase tracking-wider text-(--text-secondary)">
            {locale === "en" ? "Net Savings" : "Ahorro Neto"}
          </span>
          <p
            className={`mt-1 text-base font-bold tabular-nums sm:text-lg ${
              Number(report.netSavings) >= 0
                ? "text-emerald-300"
                : "text-rose-400"
            }`}
          >
            {report.formattedNetSavings}
          </p>
        </div>

        <div className="rounded-xl border border-(--border-subtle) bg-(--bg-input) p-3.5">
          <span className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-(--text-secondary)">
            <PiggyBank
              className="h-3.5 w-3.5 text-emerald-400"
              aria-hidden={true}
            />
            <span>{locale === "en" ? "Savings Rate" : "Tasa de Ahorro"}</span>
          </span>
          <p
            className={`mt-1 text-base font-bold tabular-nums sm:text-lg ${
              savingsRateNum >= 20
                ? "text-emerald-400"
                : savingsRateNum >= 0
                  ? "text-amber-300"
                  : "text-rose-400"
            }`}
          >
            {report.savingsRatePercent}%
          </p>
        </div>
      </div>

      {/* Chart & Category Breakdown */}
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div
          role="img"
          aria-label={t(locale, "overview.chartAria", {
            income: report.formattedTotalIncome,
            expense: report.formattedTotalExpense,
          })}
          className="relative h-56 rounded-xl border border-(--border-subtle) bg-(--bg-input) p-3 lg:col-span-2"
        >
          {hasPeriodActivity ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="label" stroke="#a1a1aa" fontSize={11} />
                <YAxis stroke="#a1a1aa" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#09090b",
                    borderColor: "#27272a",
                    borderRadius: "0.75rem",
                    fontSize: "12px",
                  }}
                />
                <Bar
                  dataKey="income"
                  name={locale === "en" ? "Income" : "Ingresos"}
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="expense"
                  name={locale === "en" ? "Expenses" : "Gastos"}
                  fill="#f43f5e"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <BarChart3
                className="h-6 w-6 text-(--text-secondary)"
                aria-hidden={true}
              />
              <p className="text-xs text-(--text-secondary)">
                {t(locale, "overview.chartEmpty")}
              </p>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-(--border-subtle) bg-(--bg-input) p-3.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-(--text-secondary)">
            {locale === "en" ? "Expenses by Category" : "Gastos por Categoría"}
          </h3>
          <div className="mt-3 space-y-2.5">
            {report.expenseByCategory.length === 0 ? (
              <p className="text-xs text-(--text-secondary)">
                {locale === "en"
                  ? "No expenses in this period."
                  : "Sin gastos en este periodo."}
              </p>
            ) : (
              report.expenseByCategory.slice(0, 6).map((item) => (
                <div key={item.categoryId ?? "uncat"} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-zinc-200">
                      {item.categoryName}
                    </span>
                    <span className="shrink-0 font-medium tabular-nums text-zinc-300">
                      {item.formattedAmount} ({item.sharePercent}%)
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-rose-500"
                      style={{
                        width: `${Math.min(100, Math.max(2, Number(item.sharePercent)))}%`,
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
