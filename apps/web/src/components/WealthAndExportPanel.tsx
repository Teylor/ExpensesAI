import {
  type CommandEnvelope,
  computeInvestmentsSummary,
  computeNetWorthSummary,
  exportAccountsToCsv,
  exportInvestmentsToCsv,
  exportNetWorthToCsv,
  exportTransactionsToCsv,
  type FxRateSnapshot,
  type NetWorthKind,
  type UserPreferences,
} from "@agenticf/domain";
import { Download, Landmark, LineChart, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import type {
  LocalAccount,
  LocalCategory,
  LocalInvestment,
  LocalNetWorthItem,
  LocalTransaction,
} from "../offline/db.js";

export interface WealthAndExportPanelProps {
  readonly accounts: readonly LocalAccount[];
  readonly totalLiquidBalanceBase: string;
  readonly transactions: readonly LocalTransaction[];
  readonly categories: readonly LocalCategory[];
  readonly investments: readonly LocalInvestment[];
  readonly netWorthItems: readonly LocalNetWorthItem[];
  readonly preferences: UserPreferences;
  readonly fxSnapshot?: FxRateSnapshot;
  readonly onDispatchCommand: (envelope: CommandEnvelope) => Promise<void>;
}

function generateUuid(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }
  return "20000000-0000-4000-8000-000000000000";
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

export function WealthAndExportPanel({
  accounts,
  totalLiquidBalanceBase,
  transactions,
  categories,
  investments,
  netWorthItems,
  preferences,
  fxSnapshot,
  onDispatchCommand,
}: WealthAndExportPanelProps) {
  const locale = preferences.locale;

  const investmentCategories = useMemo(
    () => categories.filter((c) => c.scope === "investment"),
    [categories],
  );
  const netWorthCategories = useMemo(
    () => categories.filter((c) => c.scope === "networth"),
    [categories],
  );

  // Investment form state
  const [invType, setInvType] = useState("Crypto");
  const [invName, setInvName] = useState("");
  const [invSymbol, setInvSymbol] = useState("");
  const [invPurchasedAt, setInvPurchasedAt] = useState("");
  const [invTrackPrice, setInvTrackPrice] = useState(false);
  const [invInvested, setInvInvested] = useState("");
  const [invCurrent, setInvCurrent] = useState("");
  const [invCurrency, setInvCurrency] = useState(preferences.baseCurrency);

  // Net worth form state
  const [nwKind, setNwKind] = useState<NetWorthKind>("asset");
  const [nwCategory, setNwCategory] = useState("Inmuebles");
  const [nwName, setNwName] = useState("");
  const [nwPurchasedAt, setNwPurchasedAt] = useState("");
  const [nwTrackPrice, setNwTrackPrice] = useState(false);
  const [nwValue, setNwValue] = useState("");
  const [nwCurrency, setNwCurrency] = useState(preferences.baseCurrency);

  const investmentsSummary = useMemo(
    () => computeInvestmentsSummary(investments, preferences, fxSnapshot),
    [investments, preferences, fxSnapshot],
  );

  const netWorthSummary = useMemo(
    () =>
      computeNetWorthSummary(
        totalLiquidBalanceBase,
        investmentsSummary.totalCurrentValue,
        netWorthItems,
        preferences,
        fxSnapshot,
      ),
    [
      totalLiquidBalanceBase,
      investmentsSummary.totalCurrentValue,
      netWorthItems,
      preferences,
      fxSnapshot,
    ],
  );

  const handleAddInvestment = async (e: FormEvent) => {
    e.preventDefault();
    if (!invName.trim() || !invInvested.trim() || !invCurrent.trim()) return;
    await onDispatchCommand({
      commandId: generateUuid(),
      actor: "manual",
      issuedAtUtc: new Date().toISOString(),
      type: "investment.upsert",
      payload: {
        investmentId: generateUuid(),
        assetType: invType.trim() || "Crypto",
        name: invName.trim(),
        ...(invSymbol.trim() ? { symbol: invSymbol.trim().toUpperCase() } : {}),
        ...(invPurchasedAt ? { purchasedAt: invPurchasedAt } : {}),
        trackPrice: invTrackPrice,
        investedAmount: invInvested.trim(),
        currentValue: invCurrent.trim(),
        currency: invCurrency.trim().toUpperCase() || preferences.baseCurrency,
      },
    });
    setInvName("");
    setInvSymbol("");
    setInvPurchasedAt("");
    setInvTrackPrice(false);
    setInvInvested("");
    setInvCurrent("");
  };

  const handleAddNetWorth = async (e: FormEvent) => {
    e.preventDefault();
    if (!nwName.trim() || !nwValue.trim()) return;
    await onDispatchCommand({
      commandId: generateUuid(),
      actor: "manual",
      issuedAtUtc: new Date().toISOString(),
      type: "networth.upsert",
      payload: {
        itemId: generateUuid(),
        kind: nwKind,
        category: nwCategory.trim() || "Inmuebles",
        name: nwName.trim(),
        ...(nwPurchasedAt ? { purchasedAt: nwPurchasedAt } : {}),
        trackPrice: nwTrackPrice,
        estimatedValue: nwValue.trim(),
        currency: nwCurrency.trim().toUpperCase() || preferences.baseCurrency,
      },
    });
    setNwName("");
    setNwPurchasedAt("");
    setNwTrackPrice(false);
    setNwValue("");
  };

  return (
    <div className="space-y-6">
      {/* Net Worth Summary + CSV Export Bar */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Landmark className="h-4 w-4 text-emerald-400" />
              <span>
                {locale === "en"
                  ? "Net Worth (Assets − Liabilities)"
                  : "Patrimonio Neto (Activos − Pasivos)"}
              </span>
            </h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              {locale === "en"
                ? "Accounts + Investments + Illiquid Assets − Debts"
                : "Cuentas + Inversiones + Activos no líquidos − Deudas"}
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(
              [
                {
                  id: "accounts",
                  label: locale === "en" ? "CSV Accounts" : "CSV Cuentas",
                  run: () =>
                    triggerCsvDownload(
                      "agenticf-accounts.csv",
                      exportAccountsToCsv(accounts, preferences),
                    ),
                },
                {
                  id: "transactions",
                  label:
                    locale === "en" ? "CSV Transactions" : "CSV Movimientos",
                  run: () =>
                    triggerCsvDownload(
                      "agenticf-transactions.csv",
                      exportTransactionsToCsv(transactions, preferences),
                    ),
                },
                {
                  id: "investments",
                  label:
                    locale === "en" ? "CSV Investments" : "CSV Inversiones",
                  run: () =>
                    triggerCsvDownload(
                      "agenticf-investments.csv",
                      exportInvestmentsToCsv(investments, preferences),
                    ),
                },
                {
                  id: "networth",
                  label: locale === "en" ? "CSV Net Worth" : "CSV Patrimonio",
                  run: () =>
                    triggerCsvDownload(
                      "agenticf-networth.csv",
                      exportNetWorthToCsv(netWorthItems, preferences),
                    ),
                },
              ] as const
            ).map((btn) => (
              <button
                key={btn.id}
                type="button"
                onClick={btn.run}
                className="flex items-center gap-1 rounded-lg bg-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
              >
                <Download className="h-3.5 w-3.5 text-emerald-400" />
                <span>{btn.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3.5">
            <span className="text-[11px] uppercase tracking-wider text-zinc-400">
              {locale === "en" ? "Net Worth" : "Patrimonio Neto"}
            </span>
            <p className="mt-1 text-lg font-bold text-emerald-400">
              {netWorthSummary.formattedNetWorth}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3.5">
            <span className="text-[11px] uppercase tracking-wider text-zinc-400">
              {locale === "en" ? "Total Assets" : "Activos Totales"}
            </span>
            <p className="mt-1 text-lg font-bold text-zinc-100">
              {netWorthSummary.formattedTotalAssets}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3.5">
            <span className="text-[11px] uppercase tracking-wider text-zinc-400">
              {locale === "en" ? "Investments" : "Inversiones"}
            </span>
            <p className="mt-1 text-lg font-bold text-sky-300">
              {investmentsSummary.formattedTotalCurrentValue} (
              {investmentsSummary.unrealizedPnlPercent}%)
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3.5">
            <span className="text-[11px] uppercase tracking-wider text-zinc-400">
              {locale === "en" ? "Liabilities / Debts" : "Pasivos / Deudas"}
            </span>
            <p className="mt-1 text-lg font-bold text-rose-400">
              {netWorthSummary.formattedTotalLiabilities}
            </p>
          </div>
        </div>
      </section>

      {/* Investments + Illiquid Assets & Liabilities Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Investments V1 */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <LineChart className="h-4 w-4 text-emerald-400" />
            <span>
              {locale === "en" ? "Investments (V1)" : "Inversiones (V1)"}
            </span>
          </h3>

          <div className="mt-3 space-y-2">
            {investmentsSummary.items.length === 0 ? (
              <p className="text-xs text-zinc-500">
                Añade posiciones de crypto, acciones, ETFs, fondos o categorías
                personalizadas.
              </p>
            ) : (
              investmentsSummary.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-xl border border-zinc-800/80 bg-zinc-950/60 px-3.5 py-2.5"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {item.name} {item.symbol ? `(${item.symbol})` : ""}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {item.assetType} · Inv: {item.formattedInvestedAmount}
                      {item.purchasedAt ? ` · Compra: ${item.purchasedAt}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        void onDispatchCommand({
                          commandId: generateUuid(),
                          actor: "manual",
                          issuedAtUtc: new Date().toISOString(),
                          type: "investment.upsert",
                          payload: {
                            investmentId: item.id,
                            assetType: item.assetType,
                            name: item.name,
                            ...(item.symbol ? { symbol: item.symbol } : {}),
                            ...(item.quantity
                              ? { quantity: item.quantity }
                              : {}),
                            ...(item.purchasedAt
                              ? { purchasedAt: item.purchasedAt }
                              : {}),
                            ...(item.purchasePrice
                              ? { purchasePrice: item.purchasePrice }
                              : {}),
                            trackPrice: !item.trackPrice,
                            investedAmount: item.investedAmount,
                            currentValue: item.currentValue,
                            currency: item.currency,
                          },
                        })
                      }
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${
                        item.trackPrice
                          ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/40"
                          : "bg-zinc-900 text-zinc-500 ring-zinc-800 hover:text-zinc-300"
                      }`}
                    >
                      {item.trackPrice ? "Tracking ON" : "Tracking OFF"}
                    </button>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-sky-300">
                        {item.formattedCurrentValue}
                      </p>
                      <p
                        className={`text-[11px] ${
                          Number(item.unrealizedPnl) >= 0
                            ? "text-emerald-400"
                            : "text-rose-400"
                        }`}
                      >
                        {item.unrealizedPnlPercent}%
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Eliminar inversión ${item.name}`}
                      onClick={() =>
                        void onDispatchCommand({
                          commandId: generateUuid(),
                          actor: "manual",
                          issuedAtUtc: new Date().toISOString(),
                          type: "investment.delete",
                          payload: { investmentId: item.id },
                        })
                      }
                      className="text-zinc-500 hover:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <form
            onSubmit={(e) => void handleAddInvestment(e)}
            className="mt-4 grid grid-cols-2 gap-2 border-t border-zinc-800/80 pt-4 sm:grid-cols-3"
          >
            <input
              type="text"
              list="investment-categories-list"
              placeholder="Tipo (Crypto, Acciones...)"
              aria-label="Tipo de inversión"
              value={invType}
              onChange={(e) => setInvType(e.target.value)}
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs"
            />
            <datalist id="investment-categories-list">
              {investmentCategories.map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
            <input
              type="text"
              required
              placeholder="Nombre (ej. Bitcoin)"
              aria-label="Nombre inversión"
              value={invName}
              onChange={(e) => setInvName(e.target.value)}
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs"
            />
            <input
              type="text"
              placeholder="Ticker (BTC, AAPL)"
              aria-label="Símbolo"
              value={invSymbol}
              onChange={(e) => setInvSymbol(e.target.value)}
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs uppercase"
            />
            <input
              type="text"
              required
              placeholder="Invertido"
              aria-label="Importe invertido"
              value={invInvested}
              onChange={(e) => setInvInvested(e.target.value)}
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs"
            />
            <input
              type="text"
              required
              placeholder="Valor actual"
              aria-label="Valor actual"
              value={invCurrent}
              onChange={(e) => setInvCurrent(e.target.value)}
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs"
            />
            <input
              type="date"
              aria-label="Fecha de compra inversión"
              value={invPurchasedAt}
              onChange={(e) => setInvPurchasedAt(e.target.value)}
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs"
            />
            <label className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={invTrackPrice}
                onChange={(e) => setInvTrackPrice(e.target.checked)}
              />
              <span>Seguimiento</span>
            </label>
            <div className="flex gap-1.5">
              <input
                type="text"
                maxLength={5}
                placeholder="EUR"
                aria-label="Divisa inversión"
                value={invCurrency}
                onChange={(e) => setInvCurrency(e.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs uppercase"
              />
              <button
                type="submit"
                aria-label="Añadir inversión"
                className="rounded-lg bg-emerald-500 px-2.5 py-1.5 text-zinc-950 hover:bg-emerald-400"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </form>
        </section>

        {/* Illiquid Assets & Liabilities */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
          <h3 className="text-base font-semibold">
            {locale === "en"
              ? "Assets & Liabilities"
              : "Activos no líquidos y Pasivos"}
          </h3>

          <div className="mt-3 space-y-2">
            {netWorthSummary.items.length === 0 ? (
              <p className="text-xs text-zinc-500">
                Registra casas, coches, cartas/coleccionables o deudas como
                hipotecas y préstamos.
              </p>
            ) : (
              netWorthSummary.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-xl border border-zinc-800/80 bg-zinc-950/60 px-3.5 py-2.5"
                >
                  <div>
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-zinc-400">
                      {item.kind === "asset" ? "Activo" : "Pasivo"} ·{" "}
                      {item.category}
                      {item.purchasedAt ? ` · Compra: ${item.purchasedAt}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.kind === "asset" && (
                      <button
                        type="button"
                        onClick={() =>
                          void onDispatchCommand({
                            commandId: generateUuid(),
                            actor: "manual",
                            issuedAtUtc: new Date().toISOString(),
                            type: "networth.upsert",
                            payload: {
                              itemId: item.id,
                              kind: item.kind,
                              category: item.category,
                              name: item.name,
                              ...(item.purchasedAt
                                ? { purchasedAt: item.purchasedAt }
                                : {}),
                              ...(item.purchasePrice
                                ? { purchasePrice: item.purchasePrice }
                                : {}),
                              trackPrice: !item.trackPrice,
                              estimatedValue: item.estimatedValue,
                              currency: item.currency,
                            },
                          })
                        }
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${
                          item.trackPrice
                            ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/40"
                            : "bg-zinc-900 text-zinc-500 ring-zinc-800 hover:text-zinc-300"
                        }`}
                      >
                        {item.trackPrice ? "Tracking ON" : "Tracking OFF"}
                      </button>
                    )}
                    <span
                      className={`text-sm font-semibold ${
                        item.kind === "asset"
                          ? "text-emerald-400"
                          : "text-rose-400"
                      }`}
                    >
                      {item.kind === "liability" ? "-" : "+"}
                      {item.formattedValue}
                    </span>
                    <button
                      type="button"
                      aria-label={`Eliminar elemento patrimonial ${item.name}`}
                      onClick={() =>
                        void onDispatchCommand({
                          commandId: generateUuid(),
                          actor: "manual",
                          issuedAtUtc: new Date().toISOString(),
                          type: "networth.delete",
                          payload: { itemId: item.id },
                        })
                      }
                      className="text-zinc-500 hover:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <form
            onSubmit={(e) => void handleAddNetWorth(e)}
            className="mt-4 grid grid-cols-2 gap-2 border-t border-zinc-800/80 pt-4 sm:grid-cols-5"
          >
            <select
              aria-label="Tipo patrimonial"
              value={nwKind}
              onChange={(e) => setNwKind(e.target.value as NetWorthKind)}
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs"
            >
              <option value="asset">Activo (+)</option>
              <option value="liability">Pasivo (-)</option>
            </select>
            <input
              type="text"
              list="networth-categories-list"
              placeholder="Categoría"
              aria-label="Categoría patrimonial"
              value={nwCategory}
              onChange={(e) => setNwCategory(e.target.value)}
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs"
            />
            <datalist id="networth-categories-list">
              {netWorthCategories.map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
            <input
              type="text"
              required
              placeholder="Nombre (ej. Piso)"
              aria-label="Nombre elemento patrimonial"
              value={nwName}
              onChange={(e) => setNwName(e.target.value)}
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs"
            />
            <input
              type="text"
              required
              placeholder="Valor"
              aria-label="Valor estimado"
              value={nwValue}
              onChange={(e) => setNwValue(e.target.value)}
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs"
            />
            <input
              type="date"
              aria-label="Fecha de compra patrimonio"
              value={nwPurchasedAt}
              onChange={(e) => setNwPurchasedAt(e.target.value)}
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs"
            />
            <label className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={nwTrackPrice}
                onChange={(e) => setNwTrackPrice(e.target.checked)}
              />
              <span>Seguimiento</span>
            </label>
            <div className="flex gap-1.5">
              <input
                type="text"
                maxLength={5}
                placeholder="EUR"
                aria-label="Divisa patrimonial"
                value={nwCurrency}
                onChange={(e) => setNwCurrency(e.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs uppercase"
              />
              <button
                type="submit"
                aria-label="Añadir patrimonio"
                className="rounded-lg bg-emerald-500 px-2.5 py-1.5 text-zinc-950 hover:bg-emerald-400"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
