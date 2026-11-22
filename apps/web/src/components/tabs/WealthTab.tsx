import {
  type CommandEnvelope,
  computeInvestmentsSummary,
  computeNetWorthSummary,
  type FxRateSnapshot,
  type NetWorthKind,
  t,
  type UserPreferences,
} from "@agenticf/domain";
import { Landmark, LineChart, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import type { WealthSubTab } from "../../navigation/tabs.js";
import type {
  LocalCategory,
  LocalInvestment,
  LocalNetWorthItem,
} from "../../offline/db.js";

export interface WealthTabProps {
  readonly totalLiquidBalanceBase: string;
  readonly categories: readonly LocalCategory[];
  readonly investments: readonly LocalInvestment[];
  readonly netWorthItems: readonly LocalNetWorthItem[];
  readonly preferences: UserPreferences;
  readonly fxSnapshot?: FxRateSnapshot;
  readonly generateUuid: () => string;
  readonly onDispatchCommand: (envelope: CommandEnvelope) => Promise<void>;
}

const INPUT_CLASS =
  "min-h-11 w-full rounded-xl border border-(--border-subtle) bg-(--bg-input) px-3.5 py-2 text-base text-(--text-primary) placeholder:text-(--text-secondary) focus-visible:border-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:min-h-10 sm:text-sm";

export function WealthTab({
  totalLiquidBalanceBase,
  categories,
  investments,
  netWorthItems,
  preferences,
  fxSnapshot,
  generateUuid,
  onDispatchCommand,
}: WealthTabProps) {
  const locale = preferences.locale;
  const [mobileSubTab, setMobileSubTab] = useState<WealthSubTab>("investments");

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
  const [invError, setInvError] = useState<string | null>(null);

  // Net worth form state
  const [nwKind, setNwKind] = useState<NetWorthKind>("asset");
  const [nwCategory, setNwCategory] = useState("Inmuebles");
  const [nwName, setNwName] = useState("");
  const [nwPurchasedAt, setNwPurchasedAt] = useState("");
  const [nwTrackPrice, setNwTrackPrice] = useState(false);
  const [nwValue, setNwValue] = useState("");
  const [nwCurrency, setNwCurrency] = useState(preferences.baseCurrency);
  const [nwError, setNwError] = useState<string | null>(null);

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
    setInvError(null);
    if (!invName.trim() || !invInvested.trim() || !invCurrent.trim()) {
      setInvError(t(locale, "wealth.validationInvestment"));
      return;
    }

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
    setNwError(null);
    if (!nwName.trim() || !nwValue.trim()) {
      setNwError(t(locale, "wealth.validationNetWorth"));
      return;
    }

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
      {/* Net Worth Hero Summary */}
      <section className="rounded-2xl border border-(--border-subtle) bg-(--bg-surface) p-5">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-(--text-primary)">
            <Landmark className="h-4 w-4 text-emerald-400" aria-hidden={true} />
            <span>
              {locale === "en"
                ? "Net Worth (Assets − Liabilities)"
                : "Patrimonio Neto (Activos − Pasivos)"}
            </span>
          </h2>
          <p className="mt-0.5 text-xs text-(--text-secondary)">
            {locale === "en"
              ? "Accounts + Investments + Illiquid Assets − Debts"
              : "Cuentas + Inversiones + Activos no líquidos − Deudas"}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl border border-emerald-500/30 bg-(--bg-input) p-3.5">
            <span className="text-[11px] uppercase tracking-wider text-(--text-secondary)">
              {locale === "en" ? "Net Worth" : "Patrimonio Neto"}
            </span>
            <p className="mt-1 text-base font-bold tabular-nums text-emerald-400 sm:text-lg">
              {netWorthSummary.formattedNetWorth}
            </p>
          </div>

          <div className="rounded-xl border border-(--border-subtle) bg-(--bg-input) p-3.5">
            <span className="text-[11px] uppercase tracking-wider text-(--text-secondary)">
              {locale === "en" ? "Total Assets" : "Activos Totales"}
            </span>
            <p className="mt-1 text-base font-bold tabular-nums text-(--text-primary) sm:text-lg">
              {netWorthSummary.formattedTotalAssets}
            </p>
          </div>

          <div className="rounded-xl border border-(--border-subtle) bg-(--bg-input) p-3.5">
            <span className="text-[11px] uppercase tracking-wider text-(--text-secondary)">
              {locale === "en" ? "Investments" : "Inversiones"}
            </span>
            <p className="mt-1 text-base font-bold tabular-nums text-sky-300 sm:text-lg">
              {investmentsSummary.formattedTotalCurrentValue} (
              {investmentsSummary.unrealizedPnlPercent}%)
            </p>
          </div>

          <div className="rounded-xl border border-(--border-subtle) bg-(--bg-input) p-3.5">
            <span className="text-[11px] uppercase tracking-wider text-(--text-secondary)">
              {locale === "en" ? "Liabilities / Debts" : "Pasivos / Deudas"}
            </span>
            <p className="mt-1 text-base font-bold tabular-nums text-rose-400 sm:text-lg">
              {netWorthSummary.formattedTotalLiabilities}
            </p>
          </div>
        </div>
      </section>

      {/* Mobile / Tablet 2-Pill Switcher (<lg) */}
      <div
        role="tablist"
        aria-label={t(locale, "nav.subtabsAria")}
        className="flex rounded-xl bg-(--bg-surface) p-1 ring-1 ring-(--border-subtle) lg:hidden"
      >
        {(
          [
            {
              id: "investments",
              label: t(locale, "wealth.subtab.investments"),
              count: investmentsSummary.items.length,
            },
            {
              id: "networth",
              label: t(locale, "wealth.subtab.networth"),
              count: netWorthSummary.items.length,
            },
          ] as const
        ).map((item) => {
          const isActive = mobileSubTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setMobileSubTab(item.id)}
              className={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                isActive
                  ? "bg-emerald-500 text-zinc-950"
                  : "text-(--text-secondary) hover:text-(--text-primary)"
              }`}
            >
              <span>{item.label}</span>
              <span
                className={`rounded-full px-1.5 text-[11px] tabular-nums ${
                  isActive
                    ? "bg-zinc-950/20 text-zinc-950"
                    : "bg-(--bg-surface-strong) text-(--text-secondary)"
                }`}
              >
                {item.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Investments + Illiquid Assets & Liabilities Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Investments V1 */}
        <section
          className={`${mobileSubTab === "investments" ? "block" : "hidden"} rounded-2xl border border-(--border-subtle) bg-(--bg-surface) p-5 lg:block`}
        >
          <h3 className="flex items-center gap-2 text-base font-semibold text-(--text-primary)">
            <LineChart
              className="h-4 w-4 text-emerald-400"
              aria-hidden={true}
            />
            <span>
              {locale === "en" ? "Investments (V1)" : "Inversiones (V1)"}
            </span>
          </h3>

          <div className="mt-4 space-y-2.5">
            {investmentsSummary.items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-(--border-subtle) bg-(--bg-input) px-4 py-6 text-center">
                <p className="text-xs text-(--text-secondary)">
                  {locale === "en"
                    ? "Add crypto, stocks, ETFs, funds, or custom investment positions."
                    : "Añade posiciones de crypto, acciones, ETFs, fondos o categorías personalizadas."}
                </p>
              </div>
            ) : (
              investmentsSummary.items.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-2.5 rounded-xl border border-(--border-subtle) bg-(--bg-input) px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-(--text-primary)">
                      {item.name} {item.symbol ? `(${item.symbol})` : ""}
                    </p>
                    <p className="text-xs text-(--text-secondary)">
                      {item.assetType} · Inv: {item.formattedInvestedAmount}
                      {item.purchasedAt ? ` · ${item.purchasedAt}` : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
                    <button
                      type="button"
                      aria-pressed={item.trackPrice}
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
                      className={`min-h-9 rounded-full px-3 text-xs font-medium ring-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                        item.trackPrice
                          ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/40"
                          : "bg-(--bg-surface-strong) text-zinc-300 ring-(--border-subtle) hover:text-(--text-primary)"
                      }`}
                    >
                      {item.trackPrice ? "Tracking ON" : "Tracking OFF"}
                    </button>

                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums text-sky-300">
                        {item.formattedCurrentValue}
                      </p>
                      <p
                        className={`text-xs tabular-nums ${
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
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-(--text-secondary) hover:bg-rose-500/15 hover:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:min-h-9 sm:min-w-9"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden={true} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <form
            onSubmit={(e) => void handleAddInvestment(e)}
            className="mt-5 space-y-3 border-t border-(--border-subtle) pt-5"
            noValidate
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="inv-type-input"
                  className="mb-1 block text-xs font-medium text-(--text-secondary)"
                >
                  {locale === "en" ? "Asset type" : "Tipo de inversión"}
                </label>
                <input
                  id="inv-type-input"
                  type="text"
                  list="investment-categories-list"
                  placeholder="Crypto, ETF..."
                  aria-label="Tipo de inversión"
                  value={invType}
                  onChange={(e) => setInvType(e.target.value)}
                  className={INPUT_CLASS}
                />
                <datalist id="investment-categories-list">
                  {investmentCategories.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
              </div>

              <div>
                <label
                  htmlFor="inv-name-input"
                  className="mb-1 block text-xs font-medium text-(--text-secondary)"
                >
                  {locale === "en" ? "Name" : "Nombre"}
                </label>
                <input
                  id="inv-name-input"
                  type="text"
                  required
                  placeholder={locale === "en" ? "e.g. Bitcoin" : "Ej. Bitcoin"}
                  aria-label="Nombre inversión"
                  value={invName}
                  onChange={(e) => setInvName(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <label
                  htmlFor="inv-symbol-input"
                  className="mb-1 block text-xs font-medium text-(--text-secondary)"
                >
                  {locale === "en" ? "Ticker / Symbol" : "Ticker (opcional)"}
                </label>
                <input
                  id="inv-symbol-input"
                  type="text"
                  placeholder="BTC, AAPL"
                  aria-label="Símbolo"
                  value={invSymbol}
                  onChange={(e) => setInvSymbol(e.target.value)}
                  className={`${INPUT_CLASS} uppercase`}
                />
              </div>

              <div>
                <label
                  htmlFor="inv-currency-input"
                  className="mb-1 block text-xs font-medium text-(--text-secondary)"
                >
                  {locale === "en" ? "Currency" : "Divisa"}
                </label>
                <input
                  id="inv-currency-input"
                  type="text"
                  maxLength={5}
                  placeholder="EUR"
                  aria-label="Divisa inversión"
                  value={invCurrency}
                  onChange={(e) => setInvCurrency(e.target.value)}
                  className={`${INPUT_CLASS} uppercase`}
                />
              </div>

              <div>
                <label
                  htmlFor="inv-invested-input"
                  className="mb-1 block text-xs font-medium text-(--text-secondary)"
                >
                  {locale === "en" ? "Invested amount" : "Importe invertido"}
                </label>
                <input
                  id="inv-invested-input"
                  type="text"
                  inputMode="decimal"
                  required
                  placeholder="0.00"
                  aria-label="Importe invertido"
                  value={invInvested}
                  onChange={(e) => setInvInvested(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <label
                  htmlFor="inv-current-input"
                  className="mb-1 block text-xs font-medium text-(--text-secondary)"
                >
                  {locale === "en" ? "Current value" : "Valor actual"}
                </label>
                <input
                  id="inv-current-input"
                  type="text"
                  inputMode="decimal"
                  required
                  placeholder="0.00"
                  aria-label="Valor actual"
                  value={invCurrent}
                  onChange={(e) => setInvCurrent(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <label
                  htmlFor="inv-date-input"
                  className="mb-1 block text-xs font-medium text-(--text-secondary)"
                >
                  {locale === "en" ? "Purchase date" : "Fecha de compra"}
                </label>
                <input
                  id="inv-date-input"
                  type="date"
                  aria-label="Fecha de compra inversión"
                  value={invPurchasedAt}
                  onChange={(e) => setInvPurchasedAt(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>

              <div className="flex items-end">
                <label className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-xl border border-(--border-subtle) bg-(--bg-input) px-3.5 py-2 text-sm text-(--text-primary) sm:min-h-10">
                  <input
                    type="checkbox"
                    checked={invTrackPrice}
                    onChange={(e) => setInvTrackPrice(e.target.checked)}
                    className="h-4 w-4 accent-emerald-500"
                  />
                  <span>
                    {locale === "en" ? "Track price (V2)" : "Seguimiento (V2)"}
                  </span>
                </label>
              </div>
            </div>

            {invError && (
              <p
                role="alert"
                className="rounded-xl border border-rose-500/30 bg-rose-950/40 px-3 py-2 text-xs text-rose-200"
              >
                {invError}
              </p>
            )}

            <button
              type="submit"
              aria-label="Añadir inversión"
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
            >
              <Plus className="h-4 w-4" aria-hidden={true} />
              <span>
                {locale === "en" ? "Add investment" : "Añadir inversión"}
              </span>
            </button>
          </form>
        </section>

        {/* Illiquid Assets & Liabilities */}
        <section
          className={`${mobileSubTab === "networth" ? "block" : "hidden"} rounded-2xl border border-(--border-subtle) bg-(--bg-surface) p-5 lg:block`}
        >
          <h3 className="text-base font-semibold text-(--text-primary)">
            {locale === "en"
              ? "Assets & Liabilities"
              : "Activos no líquidos y Pasivos"}
          </h3>

          <div className="mt-4 space-y-2.5">
            {netWorthSummary.items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-(--border-subtle) bg-(--bg-input) px-4 py-6 text-center">
                <p className="text-xs text-(--text-secondary)">
                  {locale === "en"
                    ? "Track homes, vehicles, collectibles, or debts like mortgages and loans."
                    : "Registra casas, coches, cartas/coleccionables o deudas como hipotecas y préstamos."}
                </p>
              </div>
            ) : (
              netWorthSummary.items.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-2.5 rounded-xl border border-(--border-subtle) bg-(--bg-input) px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-(--text-primary)">
                      {item.name}
                    </p>
                    <p className="text-xs text-(--text-secondary)">
                      {item.kind === "asset"
                        ? locale === "en"
                          ? "Asset"
                          : "Activo"
                        : locale === "en"
                          ? "Liability"
                          : "Pasivo"}{" "}
                      · {item.category}
                      {item.purchasedAt ? ` · ${item.purchasedAt}` : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
                    {item.kind === "asset" && (
                      <button
                        type="button"
                        aria-pressed={item.trackPrice}
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
                        className={`min-h-9 rounded-full px-3 text-xs font-medium ring-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                          item.trackPrice
                            ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/40"
                            : "bg-(--bg-surface-strong) text-zinc-300 ring-(--border-subtle) hover:text-(--text-primary)"
                        }`}
                      >
                        {item.trackPrice ? "Tracking ON" : "Tracking OFF"}
                      </button>
                    )}

                    <span
                      className={`text-sm font-semibold tabular-nums ${
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
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-(--text-secondary) hover:bg-rose-500/15 hover:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:min-h-9 sm:min-w-9"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden={true} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <form
            onSubmit={(e) => void handleAddNetWorth(e)}
            className="mt-5 space-y-3 border-t border-(--border-subtle) pt-5"
            noValidate
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="nw-kind-select"
                  className="mb-1 block text-xs font-medium text-(--text-secondary)"
                >
                  {locale === "en" ? "Kind" : "Tipo"}
                </label>
                <select
                  id="nw-kind-select"
                  aria-label="Tipo patrimonial"
                  value={nwKind}
                  onChange={(e) => setNwKind(e.target.value as NetWorthKind)}
                  className={INPUT_CLASS}
                >
                  <option value="asset">
                    {locale === "en" ? "Asset (+)" : "Activo (+)"}
                  </option>
                  <option value="liability">
                    {locale === "en" ? "Liability (-)" : "Pasivo (-)"}
                  </option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="nw-category-input"
                  className="mb-1 block text-xs font-medium text-(--text-secondary)"
                >
                  {locale === "en" ? "Category" : "Categoría"}
                </label>
                <input
                  id="nw-category-input"
                  type="text"
                  list="networth-categories-list"
                  placeholder={locale === "en" ? "Real Estate..." : "Inmuebles"}
                  aria-label="Categoría patrimonial"
                  value={nwCategory}
                  onChange={(e) => setNwCategory(e.target.value)}
                  className={INPUT_CLASS}
                />
                <datalist id="networth-categories-list">
                  {netWorthCategories.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
              </div>

              <div>
                <label
                  htmlFor="nw-name-input"
                  className="mb-1 block text-xs font-medium text-(--text-secondary)"
                >
                  {locale === "en" ? "Name" : "Nombre"}
                </label>
                <input
                  id="nw-name-input"
                  type="text"
                  required
                  placeholder={locale === "en" ? "e.g. Apartment" : "Ej. Piso"}
                  aria-label="Nombre elemento patrimonial"
                  value={nwName}
                  onChange={(e) => setNwName(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <label
                  htmlFor="nw-value-input"
                  className="mb-1 block text-xs font-medium text-(--text-secondary)"
                >
                  {locale === "en" ? "Estimated value" : "Valor estimado"}
                </label>
                <input
                  id="nw-value-input"
                  type="text"
                  inputMode="decimal"
                  required
                  placeholder="0.00"
                  aria-label="Valor estimado"
                  value={nwValue}
                  onChange={(e) => setNwValue(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <label
                  htmlFor="nw-date-input"
                  className="mb-1 block text-xs font-medium text-(--text-secondary)"
                >
                  {locale === "en" ? "Purchase date" : "Fecha de compra"}
                </label>
                <input
                  id="nw-date-input"
                  type="date"
                  aria-label="Fecha de compra patrimonio"
                  value={nwPurchasedAt}
                  onChange={(e) => setNwPurchasedAt(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <label
                  htmlFor="nw-currency-input"
                  className="mb-1 block text-xs font-medium text-(--text-secondary)"
                >
                  {locale === "en" ? "Currency" : "Divisa"}
                </label>
                <input
                  id="nw-currency-input"
                  type="text"
                  maxLength={5}
                  placeholder="EUR"
                  aria-label="Divisa patrimonial"
                  value={nwCurrency}
                  onChange={(e) => setNwCurrency(e.target.value)}
                  className={`${INPUT_CLASS} uppercase`}
                />
              </div>
            </div>

            <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-(--border-subtle) bg-(--bg-input) px-3.5 py-2 text-sm text-(--text-primary) sm:min-h-10">
              <input
                type="checkbox"
                checked={nwTrackPrice}
                onChange={(e) => setNwTrackPrice(e.target.checked)}
                className="h-4 w-4 accent-emerald-500"
              />
              <span>
                {locale === "en" ? "Track price (V2)" : "Seguimiento (V2)"}
              </span>
            </label>

            {nwError && (
              <p
                role="alert"
                className="rounded-xl border border-rose-500/30 bg-rose-950/40 px-3 py-2 text-xs text-rose-200"
              >
                {nwError}
              </p>
            )}

            <button
              type="submit"
              aria-label="Añadir patrimonio"
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
            >
              <Plus className="h-4 w-4" aria-hidden={true} />
              <span>
                {locale === "en" ? "Add net worth item" : "Añadir patrimonio"}
              </span>
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
