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

  const savingsRateNum = Number(report.savingsRatePercent);

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <BarChart3 className="h-4 w-4 text-emerald-400" />
            <span>
              {locale === "en" ? "Analytics & Savings" : "Analítica y Ahorro"}
            </span>
          </h2>
          <p className="mt-0.5 text-xs text-zinc-400">
            {report.startLocalDate} → {report.endLocalDate} ({report.timeZone})
          </p>
        </div>

        <div className="flex flex-wrap rounded-lg bg-zinc-950 p-0.5 ring-1 ring-zinc-800">
          {FINANCIAL_PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                period === p
                  ? "bg-emerald-500 text-zinc-950"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {t(locale, `period.${p}` as MessageKey)}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Row */}
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3.5">
          <span className="text-[11px] uppercase tracking-wider text-zinc-400">
            {locale === "en" ? "Income" : "Ingresos"}
          </span>
          <p className="mt-1 text-lg font-bold text-emerald-400">
            {report.formattedTotalIncome}
          </p>
        </div>

        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3.5">
          <span className="text-[11px] uppercase tracking-wider text-zinc-400">
            {locale === "en" ? "Expenses" : "Gastos"}
          </span>
          <p className="mt-1 text-lg font-bold text-rose-400">
            {report.formattedTotalExpense}
          </p>
        </div>

        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3.5">
          <span className="text-[11px] uppercase tracking-wider text-zinc-400">
            {locale === "en" ? "Net Savings" : "Ahorro Neto"}
          </span>
          <p
            className={`mt-1 text-lg font-bold ${
              Number(report.netSavings) >= 0
                ? "text-emerald-300"
                : "text-rose-400"
            }`}
          >
            {report.formattedNetSavings}
          </p>
        </div>

        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3.5">
          <span className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-zinc-400">
            <PiggyBank className="h-3.5 w-3.5 text-emerald-400" />
            <span>{locale === "en" ? "Savings Rate" : "Tasa de Ahorro"}</span>
          </span>
          <p
            className={`mt-1 text-lg font-bold ${
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
        <div className="h-56 rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3 lg:col-span-2">
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
        </div>

        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            {locale === "en" ? "Expenses by Category" : "Gastos por Categoría"}
          </h3>
          <div className="mt-3 space-y-2.5">
            {report.expenseByCategory.length === 0 ? (
              <p className="text-xs text-zinc-500">
                {locale === "en"
                  ? "No expenses in this period."
                  : "Sin gastos en este periodo."}
              </p>
            ) : (
              report.expenseByCategory.slice(0, 6).map((item) => (
                <div key={item.categoryId ?? "uncat"} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-200">{item.categoryName}</span>
                    <span className="font-medium text-zinc-300">
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
