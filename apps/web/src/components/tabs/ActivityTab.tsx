import {
  type CommandEnvelope,
  createMoney,
  FINANCIAL_PERIODS,
  type FinancialPeriod,
  formatMoneyWithBase,
  type MessageKey,
  t,
  type UserPreferences,
} from "@agenticf/domain";
import {
  ArrowLeftRight,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import type { ActivitySubTab, AppTab } from "../../navigation/tabs.js";
import type {
  LocalAccount,
  LocalCategory,
  LocalRecurringRule,
  LocalTransaction,
} from "../../offline/db.js";

export interface ActivityTabProps {
  readonly accounts: readonly LocalAccount[];
  readonly categories: readonly LocalCategory[];
  readonly transactions: readonly LocalTransaction[];
  readonly recurringRules: readonly LocalRecurringRule[];
  readonly preferences: UserPreferences;
  readonly isOnline: boolean;
  readonly isAuthenticated: boolean;
  readonly generateUuid: () => string;
  readonly onDispatchCommand: (envelope: CommandEnvelope) => Promise<void>;
  readonly onRunDueRecurring: () => Promise<void>;
  readonly onSelectTab: (tab: AppTab) => void;
}

const INPUT_CLASS =
  "min-h-11 w-full rounded-xl border border-(--border-subtle) bg-(--bg-input) px-3.5 py-2 text-base text-(--text-primary) placeholder:text-(--text-secondary) focus-visible:border-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:min-h-10 sm:text-sm";

export function ActivityTab({
  accounts,
  categories,
  transactions,
  recurringRules,
  preferences,
  isOnline,
  isAuthenticated,
  generateUuid,
  onDispatchCommand,
  onRunDueRecurring,
  onSelectTab,
}: ActivityTabProps) {
  const locale = preferences.locale;

  const [subTab, setSubTab] = useState<ActivitySubTab>("transactions");
  const [composerExpandedMobile, setComposerExpandedMobile] = useState<boolean>(
    () => accounts.length > 0 && transactions.length === 0,
  );

  // Transaction form state
  const [txKind, setTxKind] = useState<"income" | "expense" | "transfer">(
    "expense",
  );
  const [txAccountId, setTxAccountId] = useState(accounts[0]?.id ?? "");
  const [txToAccountId, setTxToAccountId] = useState("");
  const [txAmount, setTxAmount] = useState("");
  const [txDestAmount, setTxDestAmount] = useState("");
  const [txCategoryId, setTxCategoryId] = useState("");
  const [txDescription, setTxDescription] = useState("");
  const [txClient, setTxClient] = useState("");
  const [txError, setTxError] = useState<string | null>(null);

  // Recurring form state (with explicit Account selector)
  const [recAccountId, setRecAccountId] = useState(accounts[0]?.id ?? "");
  const [recKind, setRecKind] = useState<"income" | "expense">("expense");
  const [recFrequency, setRecFrequency] = useState<FinancialPeriod>("monthly");
  const [recDayOfMonth, setRecDayOfMonth] = useState("1");
  const [recAmount, setRecAmount] = useState("");
  const [recDescription, setRecDescription] = useState("");
  const [recError, setRecError] = useState<string | null>(null);

  useEffect(() => {
    const firstId = accounts[0]?.id ?? "";
    if (!firstId) return;
    if (!txAccountId || !accounts.some((a) => a.id === txAccountId)) {
      setTxAccountId(firstId);
    }
    if (!recAccountId || !accounts.some((a) => a.id === recAccountId)) {
      setRecAccountId(firstId);
    }
  }, [accounts, txAccountId, recAccountId]);

  const handleCreateTransaction = async (e: FormEvent) => {
    e.preventDefault();
    setTxError(null);
    const sourceAcc = accounts.find((a) => a.id === txAccountId);
    if (!sourceAcc) {
      setTxError(t(locale, "activity.validationMissingAccount"));
      return;
    }
    const parsedAmount = Number(txAmount.trim().replace(",", "."));
    if (!txAmount.trim() || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setTxError(t(locale, "activity.validationMissingAmount"));
      return;
    }

    if (txKind === "transfer") {
      if (!txToAccountId || txToAccountId === sourceAcc.id) {
        setTxError(t(locale, "activity.validationMissingDestination"));
        return;
      }
      await onDispatchCommand({
        commandId: generateUuid(),
        actor: "manual",
        issuedAtUtc: new Date().toISOString(),
        type: "transaction.transfer",
        payload: {
          transactionId: generateUuid(),
          fromAccountId: sourceAcc.id,
          toAccountId: txToAccountId,
          amount: txAmount.trim(),
          currency: sourceAcc.currency,
          ...(txDestAmount.trim()
            ? { destinationAmount: txDestAmount.trim() }
            : {}),
          ...(txDescription.trim()
            ? { description: txDescription.trim() }
            : {}),
        },
      });
    } else {
      await onDispatchCommand({
        commandId: generateUuid(),
        actor: "manual",
        issuedAtUtc: new Date().toISOString(),
        type: "transaction.record",
        payload: {
          transactionId: generateUuid(),
          kind: txKind,
          accountId: sourceAcc.id,
          amount: txAmount.trim(),
          currency: sourceAcc.currency,
          ...(txCategoryId ? { categoryId: txCategoryId } : {}),
          description: txDescription.trim() || txKind,
          ...(txClient.trim() ? { clientOrPayee: txClient.trim() } : {}),
          source: "manual",
        },
      });
    }

    setTxAmount("");
    setTxDestAmount("");
    setTxDescription("");
    setTxClient("");
  };

  const handleDeleteTransaction = async (transactionId: string) => {
    await onDispatchCommand({
      commandId: generateUuid(),
      actor: "manual",
      issuedAtUtc: new Date().toISOString(),
      type: "transaction.delete",
      payload: { transactionId },
    });
  };

  const handleCreateRecurring = async (e: FormEvent) => {
    e.preventDefault();
    setRecError(null);
    const targetAcc = accounts.find((a) => a.id === recAccountId);
    const parsedAmount = Number(recAmount.trim().replace(",", "."));
    if (
      !targetAcc ||
      !recDescription.trim() ||
      !recAmount.trim() ||
      Number.isNaN(parsedAmount) ||
      parsedAmount <= 0
    ) {
      setRecError(t(locale, "activity.validationMissingRecurring"));
      return;
    }

    const dayNum = Number(recDayOfMonth);
    await onDispatchCommand({
      commandId: generateUuid(),
      actor: "manual",
      issuedAtUtc: new Date().toISOString(),
      type: "recurring.upsert",
      payload: {
        ruleId: generateUuid(),
        kind: recKind,
        accountId: targetAcc.id,
        amount: recAmount.trim(),
        currency: targetAcc.currency,
        frequency: recFrequency,
        ...(Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= 31
          ? { dayOfMonth: dayNum }
          : {}),
        description: recDescription.trim(),
        isActive: true,
      },
    });
    setRecAmount("");
    setRecDescription("");
  };

  const handleDeleteRecurring = async (ruleId: string) => {
    await onDispatchCommand({
      commandId: generateUuid(),
      actor: "manual",
      issuedAtUtc: new Date().toISOString(),
      type: "recurring.delete",
      payload: { ruleId },
    });
  };

  const noAccounts = accounts.length === 0;

  return (
    <div className="space-y-5">
      {/* Top 2-Segment Sub-Navigation */}
      <div
        role="tablist"
        aria-label={t(locale, "nav.subtabsAria")}
        className="inline-flex w-full rounded-xl bg-(--bg-surface) p-1 ring-1 ring-(--border-subtle) sm:w-auto"
      >
        {(
          [
            {
              id: "transactions",
              label: t(locale, "activity.subtab.transactions"),
              count: transactions.length,
            },
            {
              id: "recurring",
              label: t(locale, "activity.subtab.recurring"),
              count: recurringRules.length,
            },
          ] as const
        ).map((item) => {
          const isActive = subTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setSubTab(item.id)}
              className={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg px-4 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:min-h-9 sm:flex-initial ${
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

      {/* No Accounts Guard Banner */}
      {noAccounts && (
        <div className="flex flex-col items-start justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-950/25 p-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2.5 text-sm text-amber-100">
            <Wallet
              className="h-4 w-4 shrink-0 text-amber-300"
              aria-hidden={true}
            />
            <span>{t(locale, "activity.noAccountsNotice")}</span>
          </div>
          <button
            type="button"
            onClick={() => onSelectTab("accounts")}
            className="inline-flex min-h-10 shrink-0 items-center rounded-xl bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
          >
            {t(locale, "activity.goToAccounts")}
          </button>
        </div>
      )}

      {subTab === "transactions" ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Quick Transaction / Transfer Form */}
          <section className="rounded-2xl border border-(--border-subtle) bg-(--bg-surface) p-5 lg:sticky lg:top-20 lg:col-span-5 lg:self-start">
            {/* Mobile Collapsible Header */}
            <div className="flex items-center justify-between gap-2 lg:hidden">
              <button
                type="button"
                aria-expanded={composerExpandedMobile}
                onClick={() => setComposerExpandedMobile((v) => !v)}
                className="flex min-h-11 w-full items-center justify-between rounded-xl bg-(--bg-input) px-3.5 py-2 text-sm font-semibold text-(--text-primary) ring-1 ring-(--border-subtle) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                <span className="flex items-center gap-2">
                  <Plus
                    className="h-4 w-4 text-emerald-400"
                    aria-hidden={true}
                  />
                  <span>{t(locale, "activity.composerToggle")}</span>
                </span>
                {composerExpandedMobile ? (
                  <ChevronUp className="h-4 w-4" aria-hidden={true} />
                ) : (
                  <ChevronDown className="h-4 w-4" aria-hidden={true} />
                )}
              </button>
            </div>

            <div
              className={`${composerExpandedMobile ? "mt-4 block" : "hidden"} lg:mt-0 lg:block`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="hidden text-base font-semibold text-(--text-primary) lg:block">
                  {t(locale, "activity.composerToggle")}
                </h2>
                <div
                  role="tablist"
                  aria-label={t(locale, "activity.composerToggle")}
                  className="flex w-full rounded-xl bg-(--bg-input) p-1 ring-1 ring-(--border-subtle) lg:w-auto"
                >
                  {(
                    [
                      {
                        id: "expense",
                        label: t(locale, "transaction.type.expense"),
                      },
                      {
                        id: "income",
                        label: t(locale, "transaction.type.income"),
                      },
                      {
                        id: "transfer",
                        label: t(locale, "transaction.type.transfer"),
                      },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={txKind === item.id}
                      onClick={() => setTxKind(item.id)}
                      className={`min-h-9 flex-1 rounded-lg px-2.5 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 lg:flex-initial ${
                        txKind === item.id
                          ? "bg-emerald-500 text-zinc-950"
                          : "text-(--text-secondary) hover:text-(--text-primary)"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <form
                onSubmit={(e) => void handleCreateTransaction(e)}
                className="mt-4 space-y-3"
                noValidate
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="tx-account-select"
                      className="mb-1 block text-xs font-medium text-(--text-secondary)"
                    >
                      {locale === "en" ? "Source account" : "Cuenta origen"}
                    </label>
                    <select
                      id="tx-account-select"
                      aria-label="Cuenta origen"
                      disabled={noAccounts}
                      value={txAccountId}
                      onChange={(e) => setTxAccountId(e.target.value)}
                      className={INPUT_CLASS}
                    >
                      <option value="">
                        {locale === "en"
                          ? "Select account..."
                          : "Selecciona cuenta..."}
                      </option>
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} ({acc.currency})
                        </option>
                      ))}
                    </select>
                  </div>

                  {txKind === "transfer" ? (
                    <div>
                      <label
                        htmlFor="tx-dest-account-select"
                        className="mb-1 block text-xs font-medium text-(--text-secondary)"
                      >
                        {locale === "en"
                          ? "Destination account"
                          : "Cuenta destino"}
                      </label>
                      <select
                        id="tx-dest-account-select"
                        aria-label="Cuenta destino"
                        disabled={noAccounts}
                        value={txToAccountId}
                        onChange={(e) => setTxToAccountId(e.target.value)}
                        className={INPUT_CLASS}
                      >
                        <option value="">
                          {locale === "en"
                            ? "Destination account..."
                            : "Cuenta destino..."}
                        </option>
                        {accounts
                          .filter((a) => a.id !== txAccountId)
                          .map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.name} ({acc.currency})
                            </option>
                          ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label
                        htmlFor="tx-category-select"
                        className="mb-1 block text-xs font-medium text-(--text-secondary)"
                      >
                        {locale === "en" ? "Category" : "Categoría"}
                      </label>
                      <select
                        id="tx-category-select"
                        aria-label="Categoría"
                        disabled={noAccounts}
                        value={txCategoryId}
                        onChange={(e) => setTxCategoryId(e.target.value)}
                        className={INPUT_CLASS}
                      >
                        <option value="">
                          {locale === "en" ? "No category" : "Sin categoría"}
                        </option>
                        {categories
                          .filter((c) => c.scope === txKind)
                          .map((cat) => (
                            <option key={cat.id} value={cat.id}>
                              {cat.name}
                            </option>
                          ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="tx-amount-input"
                      className="mb-1 block text-xs font-medium text-(--text-secondary)"
                    >
                      {locale === "en" ? "Amount" : "Importe"}
                    </label>
                    <input
                      id="tx-amount-input"
                      type="text"
                      inputMode="decimal"
                      required
                      disabled={noAccounts}
                      placeholder={
                        locale === "en"
                          ? "Amount (e.g. 125.50)"
                          : "Importe (ej. 125.50)"
                      }
                      aria-label="Importe"
                      value={txAmount}
                      onChange={(e) => setTxAmount(e.target.value)}
                      className={INPUT_CLASS}
                    />
                  </div>

                  {txKind === "transfer" ? (
                    <div>
                      <label
                        htmlFor="tx-dest-amount-input"
                        className="mb-1 block text-xs font-medium text-(--text-secondary)"
                      >
                        {locale === "en"
                          ? "Destination amount (FX)"
                          : "Importe destino"}
                      </label>
                      <input
                        id="tx-dest-amount-input"
                        type="text"
                        inputMode="decimal"
                        disabled={noAccounts}
                        placeholder={
                          locale === "en"
                            ? "Optional if cross-currency"
                            : "Opcional si otra divisa"
                        }
                        aria-label="Importe destino"
                        value={txDestAmount}
                        onChange={(e) => setTxDestAmount(e.target.value)}
                        className={INPUT_CLASS}
                      />
                    </div>
                  ) : (
                    <div>
                      <label
                        htmlFor="tx-client-input"
                        className="mb-1 block text-xs font-medium text-(--text-secondary)"
                      >
                        {locale === "en"
                          ? "Client / Merchant"
                          : "Cliente / Comercio"}
                      </label>
                      <input
                        id="tx-client-input"
                        type="text"
                        disabled={noAccounts}
                        placeholder={locale === "en" ? "Optional" : "Opcional"}
                        aria-label="Cliente o comercio"
                        value={txClient}
                        onChange={(e) => setTxClient(e.target.value)}
                        className={INPUT_CLASS}
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="tx-description-input"
                    className="mb-1 block text-xs font-medium text-(--text-secondary)"
                  >
                    {locale === "en" ? "Description" : "Concepto / Descripción"}
                  </label>
                  <input
                    id="tx-description-input"
                    type="text"
                    disabled={noAccounts}
                    placeholder={
                      locale === "en"
                        ? "e.g. Groceries, Salary..."
                        : "Ej. Supermercado, Nómina..."
                    }
                    aria-label="Descripción"
                    value={txDescription}
                    onChange={(e) => setTxDescription(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </div>

                {txError && (
                  <p
                    role="alert"
                    className="rounded-xl border border-rose-500/30 bg-rose-950/40 px-3 py-2 text-xs text-rose-200"
                  >
                    {txError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={noAccounts}
                  className="flex min-h-11 w-full items-center justify-center rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:opacity-50"
                >
                  {locale === "en" ? "Save" : "Guardar"}
                </button>
              </form>
            </div>
          </section>

          {/* Recent Transactions History */}
          <section className="rounded-2xl border border-(--border-subtle) bg-(--bg-surface) p-5 lg:col-span-7">
            <h2 className="text-base font-semibold text-(--text-primary)">
              {locale === "en"
                ? "Recent Transactions"
                : "Movimientos Recientes"}
            </h2>
            <div className="mt-4 space-y-2.5">
              {transactions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-(--border-subtle) bg-(--bg-input) px-4 py-8 text-center">
                  <p className="text-sm text-(--text-secondary)">
                    {locale === "en"
                      ? "No transactions recorded yet."
                      : "Aún no hay movimientos registrados."}
                  </p>
                </div>
              ) : (
                transactions.slice(0, 25).map((tx) => {
                  const formatted = formatMoneyWithBase(
                    createMoney(tx.amount, tx.currency),
                    preferences.baseCurrency,
                    tx.fxRateToBase,
                    {
                      thousandsSeparator: preferences.thousandsSeparator,
                      decimalSeparator: preferences.decimalSeparator,
                      symbolPosition: preferences.symbolPosition,
                    },
                  );
                  return (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-(--border-subtle) bg-(--bg-input) px-3.5 py-2.5"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        {tx.kind === "income" ? (
                          <TrendingUp
                            className="h-4 w-4 shrink-0 text-emerald-400"
                            aria-hidden={true}
                          />
                        ) : tx.kind === "expense" ? (
                          <TrendingDown
                            className="h-4 w-4 shrink-0 text-rose-400"
                            aria-hidden={true}
                          />
                        ) : (
                          <ArrowLeftRight
                            className="h-4 w-4 shrink-0 text-sky-400"
                            aria-hidden={true}
                          />
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-(--text-primary)">
                            {tx.description}
                          </p>
                          <p className="truncate text-xs text-(--text-secondary)">
                            {tx.localDate}
                            {tx.clientOrPayee ? ` · ${tx.clientOrPayee}` : ""}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <span
                          className={`text-sm font-semibold tabular-nums ${
                            tx.kind === "income"
                              ? "text-emerald-400"
                              : tx.kind === "expense"
                                ? "text-rose-400"
                                : "text-sky-300"
                          }`}
                        >
                          {tx.kind === "expense" ? "-" : ""}
                          {formatted}
                        </span>
                        <button
                          type="button"
                          aria-label="Eliminar movimiento"
                          onClick={() => void handleDeleteTransaction(tx.id)}
                          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-(--text-secondary) hover:bg-rose-500/15 hover:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:min-h-9 sm:min-w-9"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden={true} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      ) : (
        /* Recurring Rules Sub-Tab */
        <section className="rounded-2xl border border-(--border-subtle) bg-(--bg-surface) p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-base font-semibold text-(--text-primary)">
              <CalendarClock
                className="h-4 w-4 text-emerald-400"
                aria-hidden={true}
              />
              <span>
                {locale === "en"
                  ? "Recurring Rules (Salary, Rent, Subscriptions)"
                  : "Recurrentes (Nómina, Alquiler, Suscripciones · MultiHora)"}
              </span>
            </h2>
            {isAuthenticated && isOnline && (
              <button
                type="button"
                onClick={() => void onRunDueRecurring()}
                className="inline-flex min-h-10 items-center rounded-xl bg-zinc-800 px-3.5 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                {locale === "en"
                  ? "Run due rules now"
                  : "Ejecutar vencidas ahora"}
              </button>
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {recurringRules.length === 0 ? (
              <div className="rounded-xl border border-dashed border-(--border-subtle) bg-(--bg-input) px-4 py-6 text-center md:col-span-2 xl:col-span-3">
                <p className="text-sm text-(--text-secondary)">
                  {locale === "en"
                    ? "Schedule recurring salary, rent, or subscriptions."
                    : "Programa tu nómina, alquiler o suscripciones recurrentes."}
                </p>
              </div>
            ) : (
              recurringRules.map((rule) => {
                const formatted = formatMoneyWithBase(
                  createMoney(rule.amount, rule.currency),
                  preferences.baseCurrency,
                  undefined,
                  {
                    thousandsSeparator: preferences.thousandsSeparator,
                    decimalSeparator: preferences.decimalSeparator,
                    symbolPosition: preferences.symbolPosition,
                  },
                );
                return (
                  <div
                    key={rule.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-(--border-subtle) bg-(--bg-input) px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-(--text-primary)">
                        {rule.description}
                      </p>
                      <p className="truncate text-xs text-(--text-secondary)">
                        {t(locale, `period.${rule.frequency}` as MessageKey)} ·{" "}
                        {locale === "en" ? "Next:" : "Próx:"}{" "}
                        {rule.nextDueLocalDate}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={`text-sm font-semibold tabular-nums ${
                          rule.kind === "income"
                            ? "text-emerald-400"
                            : "text-rose-400"
                        }`}
                      >
                        {rule.kind === "expense" ? "-" : "+"}
                        {formatted}
                      </span>
                      <button
                        type="button"
                        aria-label={`Eliminar regla ${rule.description}`}
                        onClick={() => void handleDeleteRecurring(rule.id)}
                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-(--text-secondary) hover:bg-rose-500/15 hover:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:min-h-9 sm:min-w-9"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden={true} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <form
            onSubmit={(e) => void handleCreateRecurring(e)}
            className="mt-5 space-y-3 border-t border-(--border-subtle) pt-5"
            noValidate
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label
                  htmlFor="rec-account-select"
                  className="mb-1 block text-xs font-medium text-(--text-secondary)"
                >
                  {t(locale, "activity.accountLabel")}
                </label>
                <select
                  id="rec-account-select"
                  aria-label="Cuenta recurrente"
                  disabled={noAccounts}
                  value={recAccountId}
                  onChange={(e) => setRecAccountId(e.target.value)}
                  className={INPUT_CLASS}
                >
                  <option value="">
                    {locale === "en"
                      ? "Select account..."
                      : "Selecciona cuenta..."}
                  </option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.currency})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="rec-kind-select"
                  className="mb-1 block text-xs font-medium text-(--text-secondary)"
                >
                  {locale === "en" ? "Type" : "Tipo"}
                </label>
                <select
                  id="rec-kind-select"
                  aria-label="Tipo recurrente"
                  disabled={noAccounts}
                  value={recKind}
                  onChange={(e) =>
                    setRecKind(e.target.value as "income" | "expense")
                  }
                  className={INPUT_CLASS}
                >
                  <option value="expense">
                    {t(locale, "transaction.type.expense")}
                  </option>
                  <option value="income">
                    {t(locale, "transaction.type.income")}
                  </option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="rec-description-input"
                  className="mb-1 block text-xs font-medium text-(--text-secondary)"
                >
                  {locale === "en" ? "Description" : "Concepto"}
                </label>
                <input
                  id="rec-description-input"
                  type="text"
                  required
                  disabled={noAccounts}
                  placeholder={
                    locale === "en"
                      ? "e.g. Salary / Netflix"
                      : "Ej. Nómina / Netflix"
                  }
                  aria-label="Concepto recurrente"
                  value={recDescription}
                  onChange={(e) => setRecDescription(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <label
                  htmlFor="rec-amount-input"
                  className="mb-1 block text-xs font-medium text-(--text-secondary)"
                >
                  {locale === "en" ? "Amount" : "Importe"}
                </label>
                <input
                  id="rec-amount-input"
                  type="text"
                  inputMode="decimal"
                  required
                  disabled={noAccounts}
                  placeholder="0.00"
                  aria-label="Importe recurrente"
                  value={recAmount}
                  onChange={(e) => setRecAmount(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <label
                  htmlFor="rec-frequency-select"
                  className="mb-1 block text-xs font-medium text-(--text-secondary)"
                >
                  {locale === "en" ? "Frequency" : "Frecuencia"}
                </label>
                <select
                  id="rec-frequency-select"
                  aria-label="Frecuencia"
                  disabled={noAccounts}
                  value={recFrequency}
                  onChange={(e) =>
                    setRecFrequency(e.target.value as FinancialPeriod)
                  }
                  className={INPUT_CLASS}
                >
                  {FINANCIAL_PERIODS.map((p) => (
                    <option key={p} value={p}>
                      {t(locale, `period.${p}` as MessageKey)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="rec-day-input"
                  className="mb-1 block text-xs font-medium text-(--text-secondary)"
                >
                  {locale === "en" ? "Day of month" : "Día del mes"}
                </label>
                <input
                  id="rec-day-input"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={31}
                  disabled={noAccounts}
                  placeholder="1"
                  aria-label="Día del mes"
                  value={recDayOfMonth}
                  onChange={(e) => setRecDayOfMonth(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
            </div>

            {recError && (
              <p
                role="alert"
                className="rounded-xl border border-rose-500/30 bg-rose-950/40 px-3 py-2 text-xs text-rose-200"
              >
                {recError}
              </p>
            )}

            <button
              type="submit"
              disabled={noAccounts}
              aria-label="Añadir regla recurrente"
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:opacity-50 sm:w-auto"
            >
              <Plus className="h-4 w-4" aria-hidden={true} />
              <span>
                {locale === "en" ? "Add recurring rule" : "Añadir recurrente"}
              </span>
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
