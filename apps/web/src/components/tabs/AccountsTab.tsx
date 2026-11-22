import {
  ACCOUNT_TYPES,
  type AccountType,
  type BalancesSummary,
  type CommandEnvelope,
  type MessageKey,
  t,
  type UserPreferences,
} from "@agenticf/domain";
import { Banknote, Plus, Wallet } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";

export interface AccountsTabProps {
  readonly balancesSummary: BalancesSummary;
  readonly preferences: UserPreferences;
  readonly generateUuid: () => string;
  readonly onDispatchCommand: (envelope: CommandEnvelope) => Promise<void>;
}

const INPUT_CLASS =
  "min-h-11 w-full rounded-xl border border-(--border-subtle) bg-(--bg-input) px-3.5 py-2 text-base text-(--text-primary) placeholder:text-(--text-secondary) focus-visible:border-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:min-h-10 sm:text-sm";

export function AccountsTab({
  balancesSummary,
  preferences,
  generateUuid,
  onDispatchCommand,
}: AccountsTabProps) {
  const locale = preferences.locale;

  const [newAccName, setNewAccName] = useState("");
  const [newAccType, setNewAccType] = useState<AccountType>("bank");
  const [newAccCurrency, setNewAccCurrency] = useState(
    preferences.baseCurrency,
  );
  const [newAccBalance, setNewAccBalance] = useState("0");
  const [formError, setFormError] = useState<string | null>(null);

  const uniqueCurrencies = useMemo(() => {
    const set = new Set(balancesSummary.accounts.map((acc) => acc.currency));
    return Array.from(set);
  }, [balancesSummary.accounts]);

  const handleCreateAccount = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!newAccName.trim()) {
      setFormError(t(locale, "accounts.validationMissingName"));
      return;
    }

    await onDispatchCommand({
      commandId: generateUuid(),
      actor: "manual",
      issuedAtUtc: new Date().toISOString(),
      type: "account.create",
      payload: {
        accountId: generateUuid(),
        name: newAccName.trim(),
        accountType: newAccType,
        currency:
          newAccCurrency.trim().toUpperCase() || preferences.baseCurrency,
        initialBalance: newAccBalance.trim() || "0",
      },
    });
    setNewAccName("");
    setNewAccBalance("0");
  };

  return (
    <div className="space-y-6">
      {/* Consolidated Balance Strip */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <div className="rounded-2xl border border-emerald-500/30 bg-(--bg-surface) p-5">
          <span className="text-xs uppercase tracking-wider text-(--text-secondary)">
            {t(locale, "overview.totalBalance")}
          </span>
          <p className="mt-2 text-2xl font-bold tabular-nums text-emerald-400">
            {balancesSummary.formattedTotalBalance}
          </p>
        </div>

        <div className="rounded-2xl border border-(--border-subtle) bg-(--bg-surface) p-5">
          <span className="text-xs uppercase tracking-wider text-(--text-secondary)">
            {t(locale, "account.type.cash")}
          </span>
          <p className="mt-2 text-2xl font-bold tabular-nums text-(--text-primary)">
            {balancesSummary.formattedCashBalance}
          </p>
        </div>

        <div className="rounded-2xl border border-(--border-subtle) bg-(--bg-surface) p-5">
          <span className="text-xs uppercase tracking-wider text-(--text-secondary)">
            {t(locale, "accounts.portfolioMix")}
          </span>
          <p className="mt-2 text-base font-semibold text-(--text-primary)">
            {t(locale, "accounts.countSummary", {
              count: balancesSummary.accounts.length,
            })}
          </p>
          {uniqueCurrencies.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {uniqueCurrencies.map((code) => (
                <span
                  key={code}
                  className="rounded-md bg-(--bg-surface-strong) px-2 py-0.5 text-xs font-medium text-(--text-secondary) ring-1 ring-(--border-subtle)"
                >
                  {code}
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Main Split: Accounts List + Add Account Form */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="rounded-2xl border border-(--border-subtle) bg-(--bg-surface) p-5 lg:col-span-7">
          <h2 className="flex items-center gap-2 text-base font-semibold text-(--text-primary)">
            <Banknote className="h-4 w-4 text-emerald-400" aria-hidden={true} />
            <span>{t(locale, "nav.accounts")}</span>
          </h2>

          <div className="mt-4 space-y-2.5">
            {balancesSummary.accounts.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-(--border-subtle) bg-(--bg-input) px-4 py-8 text-center">
                <Wallet
                  className="h-6 w-6 text-(--text-secondary)"
                  aria-hidden={true}
                />
                <p className="mt-2 text-sm text-(--text-secondary)">
                  {locale === "en"
                    ? "Create your first bank, cash, or savings account."
                    : "Crea tu primera cuenta bancaria, efectivo o ahorro."}
                </p>
              </div>
            ) : (
              balancesSummary.accounts.map((acc) => (
                <div
                  key={acc.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-(--border-subtle) bg-(--bg-input) px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-(--text-primary)">
                      {acc.name}
                    </p>
                    <p className="mt-0.5 text-xs text-(--text-secondary)">
                      {t(
                        locale,
                        `account.type.${acc.accountType}` as MessageKey,
                      )}{" "}
                      · {acc.currency}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold tabular-nums text-emerald-300 sm:text-base">
                    {acc.formattedBalance}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-(--border-subtle) bg-(--bg-surface) p-5 lg:col-span-5">
          <h2 className="text-base font-semibold text-(--text-primary)">
            {t(locale, "accounts.addTitle")}
          </h2>

          <form
            onSubmit={(e) => void handleCreateAccount(e)}
            className="mt-4 space-y-3"
            noValidate
          >
            <div>
              <label
                htmlFor="account-name-input"
                className="mb-1 block text-xs font-medium text-(--text-secondary)"
              >
                {locale === "en" ? "Account name" : "Nombre cuenta"}
              </label>
              <input
                id="account-name-input"
                type="text"
                required
                placeholder={
                  locale === "en" ? "e.g. Main Bank" : "Ej. Banco Principal"
                }
                aria-label="Nombre cuenta"
                value={newAccName}
                onChange={(e) => setNewAccName(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="account-type-select"
                  className="mb-1 block text-xs font-medium text-(--text-secondary)"
                >
                  {locale === "en" ? "Account type" : "Tipo de cuenta"}
                </label>
                <select
                  id="account-type-select"
                  aria-label="Tipo de cuenta"
                  value={newAccType}
                  onChange={(e) => setNewAccType(e.target.value as AccountType)}
                  className={INPUT_CLASS}
                >
                  {ACCOUNT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(locale, `account.type.${type}` as MessageKey)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="account-currency-input"
                  className="mb-1 block text-xs font-medium text-(--text-secondary)"
                >
                  {locale === "en" ? "Currency" : "Divisa"}
                </label>
                <input
                  id="account-currency-input"
                  type="text"
                  maxLength={5}
                  placeholder="EUR / USD"
                  aria-label="Divisa"
                  value={newAccCurrency}
                  onChange={(e) => setNewAccCurrency(e.target.value)}
                  className={`${INPUT_CLASS} uppercase`}
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="account-balance-input"
                className="mb-1 block text-xs font-medium text-(--text-secondary)"
              >
                {locale === "en" ? "Initial balance" : "Saldo inicial"}
              </label>
              <input
                id="account-balance-input"
                type="text"
                inputMode="decimal"
                placeholder="0"
                aria-label="Saldo inicial"
                value={newAccBalance}
                onChange={(e) => setNewAccBalance(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>

            {formError && (
              <p
                role="alert"
                className="rounded-xl border border-rose-500/30 bg-rose-950/40 px-3 py-2 text-xs text-rose-200"
              >
                {formError}
              </p>
            )}

            <button
              type="submit"
              aria-label="Añadir cuenta"
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
            >
              <Plus className="h-4 w-4" aria-hidden={true} />
              <span>{t(locale, "accounts.addSubmit")}</span>
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
