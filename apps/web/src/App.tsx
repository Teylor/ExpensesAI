import {
  ACCOUNT_TYPES,
  type AccountType,
  CATEGORY_SCOPES,
  type CategoryScope,
  type CommandEnvelope,
  computeBalancesSummary,
  createMoney,
  DEFAULT_USER_PREFERENCES,
  FINANCIAL_PERIODS,
  type FinancialPeriod,
  type FxRateSnapshot,
  formatMoneyWithBase,
  type SupportedLocale,
  simulateCommandImpact,
  t,
  type UserPreferences,
} from "@agenticf/domain";
import {
  ArrowLeftRight,
  Banknote,
  CalendarClock,
  CloudOff,
  LogOut,
  Plus,
  RefreshCw,
  RotateCcw,
  Tag,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
  Wifi,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  createHttpOutboxTransport,
  fetchCurrentUser,
  hydrateOfflineDbFromServer,
  loginWithEmail,
  logoutSession,
  type PublicUserDto,
  patchUserPreferences,
  registerWithEmail,
  runDueRecurringRulesRemote,
  startChatGptOAuthFlow,
} from "./api/client.js";
import { AgentFloatingDock } from "./components/AgentFloatingDock.js";
import { AnalyticsPanel } from "./components/AnalyticsPanel.js";
import { WealthAndExportPanel } from "./components/WealthAndExportPanel.js";
import {
  createOfflineDb,
  type LocalAccount,
  type LocalCategory,
  type LocalInvestment,
  type LocalNetWorthItem,
  type LocalRecurringRule,
  type LocalTransaction,
} from "./offline/db.js";
import { OutboxSyncEngine } from "./offline/outbox.js";

const offlineDb = createOfflineDb();
const outboxEngine = new OutboxSyncEngine({
  db: offlineDb,
  transport: createHttpOutboxTransport(),
});

function generateUuid(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }
  return "10000000-0000-4000-8000-000000000000";
}

export function App() {
  const [user, setUser] = useState<PublicUserDto | null>(null);
  const [offlineGuest, setOfflineGuest] = useState(false);
  const [preferences, setPreferences] = useState<UserPreferences>(
    DEFAULT_USER_PREFERENCES,
  );
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const [accounts, setAccounts] = useState<LocalAccount[]>([]);
  const [categories, setCategories] = useState<LocalCategory[]>([]);
  const [transactions, setTransactions] = useState<LocalTransaction[]>([]);
  const [recurringRules, setRecurringRules] = useState<LocalRecurringRule[]>(
    [],
  );
  const [investments, setInvestments] = useState<LocalInvestment[]>([]);
  const [netWorthItems, setNetWorthItems] = useState<LocalNetWorthItem[]>([]);
  const [fxSnapshot, setFxSnapshot] = useState<FxRateSnapshot | undefined>(
    undefined,
  );

  const [lastCommand, setLastCommand] = useState<{
    commandId: string;
    summary: string;
  } | null>(null);

  // Auth form
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  // Account creation form
  const [newAccName, setNewAccName] = useState("");
  const [newAccType, setNewAccType] = useState<AccountType>("bank");
  const [newAccCurrency, setNewAccCurrency] = useState("EUR");
  const [newAccBalance, setNewAccBalance] = useState("0");

  // Transaction form
  const [txKind, setTxKind] = useState<"income" | "expense" | "transfer">(
    "expense",
  );
  const [txAccountId, setTxAccountId] = useState("");
  const [txToAccountId, setTxToAccountId] = useState("");
  const [txAmount, setTxAmount] = useState("");
  const [txDestAmount, setTxDestAmount] = useState("");
  const [txCategoryId, setTxCategoryId] = useState("");
  const [txDescription, setTxDescription] = useState("");
  const [txClient, setTxClient] = useState("");

  // Category form
  const [activeScope, setActiveScope] = useState<CategoryScope>("expense");
  const [newCatName, setNewCatName] = useState("");

  // Recurring form
  const [recKind, setRecKind] = useState<"income" | "expense">("expense");
  const [recFrequency, setRecFrequency] = useState<FinancialPeriod>("monthly");
  const [recDayOfMonth, setRecDayOfMonth] = useState("1");
  const [recAmount, setRecAmount] = useState("");
  const [recDescription, setRecDescription] = useState("");

  const reloadLocalState = useCallback(async () => {
    const [accs, cats, txs, recs, invs, nws, fx, prefs, pending] =
      await Promise.all([
        offlineDb.accounts.toArray(),
        offlineDb.categories.toArray(),
        offlineDb.transactions.toArray(),
        offlineDb.recurringRules.toArray(),
        offlineDb.investments.toArray(),
        offlineDb.netWorthItems.toArray(),
        offlineDb.getLatestFxSnapshot(),
        offlineDb.getPreferences(),
        outboxEngine.getPendingCount(),
      ]);

    const activeAccs = accs.filter((a) => !a.isArchived);
    setAccounts(activeAccs);
    if (activeAccs.length > 0 && !txAccountId) {
      setTxAccountId(activeAccs[0]?.id ?? "");
    }
    setCategories(cats.filter((c) => c.deletedAt === null));
    setTransactions(
      txs
        .filter((tx) => tx.deletedAt === null)
        .sort((a, b) => b.occurredAtUtc.localeCompare(a.occurredAtUtc)),
    );
    setRecurringRules(
      recs
        .filter((r) => r.deletedAt === null)
        .sort((a, b) => a.nextDueLocalDate.localeCompare(b.nextDueLocalDate)),
    );
    setInvestments(invs.filter((i) => i.deletedAt === null));
    setNetWorthItems(nws.filter((i) => i.deletedAt === null));
    setFxSnapshot(fx ?? undefined);
    setPreferences(prefs);
    setPendingCount(pending);
  }, [txAccountId]);

  const handleSyncNow = useCallback(async () => {
    setIsSyncing(true);
    try {
      await outboxEngine.syncPending();
      if (user) {
        await hydrateOfflineDbFromServer(offlineDb);
      }
      await reloadLocalState();
    } finally {
      setIsSyncing(false);
    }
  }, [reloadLocalState, user]);

  useEffect(() => {
    void (async () => {
      await reloadLocalState();
      const me = await fetchCurrentUser();
      if (me) {
        setUser(me.user);
        await offlineDb.savePreferences(me.preferences);
        await outboxEngine.syncPending();
        await hydrateOfflineDbFromServer(offlineDb);
        await reloadLocalState();
      }
    })();
  }, [reloadLocalState]);

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      void handleSyncNow();
    };
    const onOffline = () => setIsOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [handleSyncNow]);

  const dispatchCommand = async (envelope: CommandEnvelope) => {
    const accountMap: Record<
      string,
      { id: string; name: string; currency: string; balance: string }
    > = {};
    for (const acc of accounts) {
      accountMap[acc.id] = {
        id: acc.id,
        name: acc.name,
        currency: acc.currency,
        balance: acc.balance,
      };
    }

    const impact = simulateCommandImpact(
      { accounts: accountMap },
      envelope,
      preferences,
      fxSnapshot,
    );

    await outboxEngine.enqueueCommand(envelope);
    setLastCommand({
      commandId: envelope.commandId,
      summary: impact.summary,
    });
    await reloadLocalState();

    if (isOnline && user) {
      void handleSyncNow();
    }
  };

  const handleUndoLast = async () => {
    if (!lastCommand) return;
    await outboxEngine.undoCommand(lastCommand.commandId);
    setLastCommand(null);
    if (isOnline && user) {
      await hydrateOfflineDbFromServer(offlineDb);
    }
    await reloadLocalState();
  };

  const handleAuthSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      const res =
        authMode === "login"
          ? await loginWithEmail(email, password)
          : await registerWithEmail(email, password);
      setUser(res.user);
      setOfflineGuest(false);
      await offlineDb.savePreferences(res.preferences);
      await hydrateOfflineDbFromServer(offlineDb);
      await reloadLocalState();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Error de sesión");
    }
  };

  const handleLogout = async () => {
    await logoutSession();
    await offlineDb.clearLocalUserData();
    setUser(null);
    setOfflineGuest(false);
    setLastCommand(null);
    await reloadLocalState();
  };

  const handleSignInWithChatGpt = async () => {
    setAuthError(null);
    try {
      const { authorizationUrl } = await startChatGptOAuthFlow();
      window.location.assign(authorizationUrl);
    } catch (err) {
      setAuthError(
        err instanceof Error
          ? err.message
          : "Error iniciando Sign in with ChatGPT (requiere backend conectado)",
      );
    }
  };

  const handleToggleLocale = async (nextLocale: SupportedLocale) => {
    const nextPrefs = { ...preferences, locale: nextLocale };
    await offlineDb.savePreferences(nextPrefs);
    setPreferences(nextPrefs);
    if (isOnline && user) {
      await patchUserPreferences({ locale: nextLocale });
    }
  };

  const handleToggleAgentConfirm = async (enabled: boolean) => {
    const nextPrefs = { ...preferences, agentConfirmEnabled: enabled };
    await offlineDb.savePreferences(nextPrefs);
    setPreferences(nextPrefs);
    if (isOnline && user) {
      await patchUserPreferences({ agentConfirmEnabled: enabled });
    }
  };

  const handleCreateAccount = async (e: FormEvent) => {
    e.preventDefault();
    if (!newAccName.trim()) return;
    const accountId = generateUuid();
    await dispatchCommand({
      commandId: generateUuid(),
      actor: "manual",
      issuedAtUtc: new Date().toISOString(),
      type: "account.create",
      payload: {
        accountId,
        name: newAccName.trim(),
        accountType: newAccType,
        currency: newAccCurrency.toUpperCase(),
        initialBalance: newAccBalance || "0",
      },
    });
    setNewAccName("");
    setNewAccBalance("0");
    if (!txAccountId) {
      setTxAccountId(accountId);
    }
  };

  const handleCreateTransaction = async (e: FormEvent) => {
    e.preventDefault();
    const sourceAcc = accounts.find((a) => a.id === txAccountId);
    if (!sourceAcc || !txAmount.trim()) return;

    if (txKind === "transfer") {
      if (!txToAccountId || txToAccountId === sourceAcc.id) return;
      await dispatchCommand({
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
      await dispatchCommand({
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

  const handleAddCategory = async (e: FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    await dispatchCommand({
      commandId: generateUuid(),
      actor: "manual",
      issuedAtUtc: new Date().toISOString(),
      type: "category.upsert",
      payload: {
        categoryId: generateUuid(),
        scope: activeScope,
        name: newCatName.trim(),
      },
    });
    setNewCatName("");
  };

  const handleDeleteCategory = async (categoryId: string) => {
    await dispatchCommand({
      commandId: generateUuid(),
      actor: "manual",
      issuedAtUtc: new Date().toISOString(),
      type: "category.delete",
      payload: { categoryId },
    });
  };

  const handleDeleteTransaction = async (transactionId: string) => {
    await dispatchCommand({
      commandId: generateUuid(),
      actor: "manual",
      issuedAtUtc: new Date().toISOString(),
      type: "transaction.delete",
      payload: { transactionId },
    });
  };

  const handleCreateRecurring = async (e: FormEvent) => {
    e.preventDefault();
    const targetAcc = accounts.find((a) => a.id === txAccountId) ?? accounts[0];
    if (!targetAcc || !recAmount.trim() || !recDescription.trim()) return;

    const dayNum = Number(recDayOfMonth);
    await dispatchCommand({
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
    await dispatchCommand({
      commandId: generateUuid(),
      actor: "manual",
      issuedAtUtc: new Date().toISOString(),
      type: "recurring.delete",
      payload: { ruleId },
    });
  };

  const handleRunDueRecurring = async () => {
    if (!isOnline || !user) return;
    await outboxEngine.syncPending();
    await runDueRecurringRulesRemote();
    await hydrateOfflineDbFromServer(offlineDb);
    await reloadLocalState();
  };

  const balancesSummary = computeBalancesSummary(
    accounts,
    preferences,
    fxSnapshot,
  );

  const locale = preferences.locale;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Top Navbar */}
      <header className="sticky top-0 z-20 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <span className="font-semibold tracking-tight">AgenticF</span>
              <span className="ml-2 rounded-md bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400">
                PWA Offline-First
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Connection + Outbox Status */}
            <div
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ${
                isOnline
                  ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30"
                  : "bg-amber-500/10 text-amber-300 ring-amber-500/30"
              }`}
            >
              {isOnline ? (
                <Wifi className="h-3.5 w-3.5" />
              ) : (
                <CloudOff className="h-3.5 w-3.5" />
              )}
              <span>
                {isOnline
                  ? "Online"
                  : locale === "en"
                    ? "Offline"
                    : "Sin conexión"}
              </span>
              {pendingCount > 0 && (
                <span className="ml-1 rounded-full bg-amber-500/20 px-1.5 py-0.2 text-[11px] text-amber-200">
                  {pendingCount}
                </span>
              )}
            </div>

            {pendingCount > 0 && (
              <button
                type="button"
                onClick={() => void handleSyncNow()}
                disabled={isSyncing}
                className="flex items-center gap-1 rounded-lg bg-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`}
                />
                <span>{locale === "en" ? "Sync" : "Sincronizar"}</span>
              </button>
            )}

            {/* Locale toggle */}
            <div className="flex rounded-lg bg-zinc-900 p-0.5 ring-1 ring-zinc-800">
              {(["es", "en"] as const).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => void handleToggleLocale(lang)}
                  className={`rounded-md px-2 py-0.5 text-xs font-medium uppercase ${
                    locale === lang
                      ? "bg-emerald-500 text-zinc-950"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>

            {(user || offlineGuest) && (
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="flex items-center gap-1 rounded-lg bg-zinc-900 px-2.5 py-1 text-xs text-zinc-400 ring-1 ring-zinc-800 hover:text-zinc-200"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>{user ? user.email : "Local"}</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Global Undo Banner */}
      {lastCommand && (
        <div className="border-b border-emerald-500/20 bg-emerald-950/30 px-4 py-2.5">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 text-sm">
            <span className="text-emerald-200">{lastCommand.summary}</span>
            <button
              type="button"
              onClick={() => void handleUndoLast()}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1 text-xs font-semibold text-zinc-950 hover:bg-emerald-400"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>{locale === "en" ? "Undo" : "Deshacer"}</span>
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 py-6">
        {!user && !offlineGuest ? (
          <div className="mx-auto max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 shadow-xl">
            <h1 className="text-lg font-semibold">
              {authMode === "login" ? "Iniciar sesión" : "Crear cuenta"}
            </h1>
            <p className="mt-1 text-xs text-zinc-400">
              Sincroniza tus cuentas con PostgreSQL o entra en modo local
              offline-first.
            </p>

            <form
              onSubmit={(e) => void handleAuthSubmit(e)}
              className="mt-4 space-y-3"
            >
              <input
                type="email"
                required
                placeholder="email@ejemplo.com"
                aria-label="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
              <input
                type="password"
                required
                minLength={12}
                placeholder="Contraseña (mín. 12 caracteres)"
                aria-label="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
              {authError && (
                <p className="text-xs text-rose-400">{authError}</p>
              )}
              <button
                type="submit"
                className="w-full rounded-xl bg-emerald-500 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400"
              >
                {authMode === "login" ? "Entrar" : "Registrarme"}
              </button>
            </form>

            <div className="mt-3">
              <button
                type="button"
                onClick={() => void handleSignInWithChatGpt()}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-800"
              >
                <span>Sign in with ChatGPT (Plan Sharing)</span>
              </button>
            </div>

            <div className="mt-4 flex items-center justify-between text-xs text-zinc-400">
              <button
                type="button"
                onClick={() =>
                  setAuthMode(authMode === "login" ? "register" : "login")
                }
                className="underline hover:text-zinc-200"
              >
                {authMode === "login"
                  ? "¿No tienes cuenta? Regístrate"
                  : "¿Ya tienes cuenta? Inicia sesión"}
              </button>
              <button
                type="button"
                onClick={() => setOfflineGuest(true)}
                className="text-emerald-400 hover:underline"
              >
                Usar modo Offline Local →
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary Balance Cards */}
            <section className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
                <span className="text-xs uppercase tracking-wider text-zinc-400">
                  {locale === "en" ? "Total Balance" : "Saldo Total"}
                </span>
                <p className="mt-2 text-2xl font-bold text-emerald-400">
                  {balancesSummary.formattedTotalBalance}
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
                <span className="text-xs uppercase tracking-wider text-zinc-400">
                  {t(locale, "account.type.cash")}
                </span>
                <p className="mt-2 text-2xl font-bold text-zinc-100">
                  {balancesSummary.formattedCashBalance}
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
                <span className="text-xs uppercase tracking-wider text-zinc-400">
                  Cola Outbox Offline
                </span>
                <p className="mt-2 text-2xl font-bold text-zinc-100">
                  {pendingCount} pendientes
                </p>
              </div>
            </section>

            {/* Analytics & Savings Panel (Recharts, 100% offline-first) */}
            <AnalyticsPanel
              transactions={transactions}
              categories={categories}
              preferences={preferences}
              {...(fxSnapshot ? { fxSnapshot } : {})}
            />

            {/* Accounts & New Transaction Grid */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Accounts Section */}
              <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <Banknote className="h-4 w-4 text-emerald-400" />
                  <span>{locale === "en" ? "Accounts" : "Cuentas"}</span>
                </h2>

                <div className="mt-4 space-y-2.5">
                  {balancesSummary.accounts.length === 0 ? (
                    <p className="text-xs text-zinc-500">
                      Crea tu primera cuenta bancaria, efectivo o ahorro.
                    </p>
                  ) : (
                    balancesSummary.accounts.map((acc) => (
                      <div
                        key={acc.id}
                        className="flex items-center justify-between rounded-xl border border-zinc-800/80 bg-zinc-950/60 px-3.5 py-2.5"
                      >
                        <div>
                          <p className="text-sm font-medium">{acc.name}</p>
                          <p className="text-xs text-zinc-400">
                            {acc.accountType} · {acc.currency}
                          </p>
                        </div>
                        <p className="text-sm font-semibold text-emerald-300">
                          {acc.formattedBalance}
                        </p>
                      </div>
                    ))
                  )}
                </div>

                <form
                  onSubmit={(e) => void handleCreateAccount(e)}
                  className="mt-4 grid grid-cols-2 gap-2 border-t border-zinc-800/80 pt-4 sm:grid-cols-4"
                >
                  <input
                    type="text"
                    required
                    placeholder="Nombre cuenta"
                    aria-label="Nombre cuenta"
                    value={newAccName}
                    onChange={(e) => setNewAccName(e.target.value)}
                    className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs"
                  />
                  <select
                    aria-label="Tipo de cuenta"
                    value={newAccType}
                    onChange={(e) =>
                      setNewAccType(e.target.value as AccountType)
                    }
                    className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs"
                  >
                    {ACCOUNT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    maxLength={5}
                    placeholder="EUR / USD"
                    aria-label="Divisa"
                    value={newAccCurrency}
                    onChange={(e) => setNewAccCurrency(e.target.value)}
                    className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs uppercase"
                  />
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      placeholder="Saldo inicial"
                      aria-label="Saldo inicial"
                      value={newAccBalance}
                      onChange={(e) => setNewAccBalance(e.target.value)}
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs"
                    />
                    <button
                      type="submit"
                      aria-label="Añadir cuenta"
                      className="rounded-lg bg-emerald-500 px-2.5 py-1.5 text-zinc-950 hover:bg-emerald-400"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </form>
              </section>

              {/* Quick Transaction / Transfer Form */}
              <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold">
                    Registrar Movimiento
                  </h2>
                  <div className="flex rounded-lg bg-zinc-950 p-0.5 ring-1 ring-zinc-800">
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
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setTxKind(tab.id)}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                          txKind === tab.id
                            ? "bg-emerald-500 text-zinc-950"
                            : "text-zinc-400 hover:text-zinc-200"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                <form
                  onSubmit={(e) => void handleCreateTransaction(e)}
                  className="mt-4 space-y-3"
                >
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <select
                      aria-label="Cuenta origen"
                      value={txAccountId}
                      onChange={(e) => setTxAccountId(e.target.value)}
                      className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs"
                    >
                      <option value="">Selecciona cuenta...</option>
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} ({acc.currency})
                        </option>
                      ))}
                    </select>

                    {txKind === "transfer" ? (
                      <select
                        aria-label="Cuenta destino"
                        value={txToAccountId}
                        onChange={(e) => setTxToAccountId(e.target.value)}
                        className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs"
                      >
                        <option value="">Cuenta destino...</option>
                        {accounts
                          .filter((a) => a.id !== txAccountId)
                          .map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.name} ({acc.currency})
                            </option>
                          ))}
                      </select>
                    ) : (
                      <select
                        aria-label="Categoría"
                        value={txCategoryId}
                        onChange={(e) => setTxCategoryId(e.target.value)}
                        className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs"
                      >
                        <option value="">Sin categoría</option>
                        {categories
                          .filter((c) => c.scope === txKind)
                          .map((cat) => (
                            <option key={cat.id} value={cat.id}>
                              {cat.name}
                            </option>
                          ))}
                      </select>
                    )}
                  </div>

                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <input
                      type="text"
                      required
                      placeholder="Importe (ej. 125.50)"
                      aria-label="Importe"
                      value={txAmount}
                      onChange={(e) => setTxAmount(e.target.value)}
                      className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs"
                    />
                    {txKind === "transfer" ? (
                      <input
                        type="text"
                        placeholder="Importe destino (si otra divisa)"
                        aria-label="Importe destino"
                        value={txDestAmount}
                        onChange={(e) => setTxDestAmount(e.target.value)}
                        className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs"
                      />
                    ) : (
                      <input
                        type="text"
                        placeholder="Cliente / Comercio (opcional)"
                        aria-label="Cliente o comercio"
                        value={txClient}
                        onChange={(e) => setTxClient(e.target.value)}
                        className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs"
                      />
                    )}
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Concepto / Descripción"
                      aria-label="Descripción"
                      value={txDescription}
                      onChange={(e) => setTxDescription(e.target.value)}
                      className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs"
                    />
                    <button
                      type="submit"
                      className="shrink-0 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400"
                    >
                      {locale === "en" ? "Save" : "Guardar"}
                    </button>
                  </div>
                </form>
              </section>
            </div>

            {/* Transactions & Editable Categories */}
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Transactions History */}
              <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 lg:col-span-2">
                <h2 className="text-base font-semibold">
                  Movimientos Recientes
                </h2>
                <div className="mt-4 space-y-2">
                  {transactions.length === 0 ? (
                    <p className="text-xs text-zinc-500">
                      Aún no hay movimientos registrados.
                    </p>
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
                          className="flex items-center justify-between rounded-xl border border-zinc-800/80 bg-zinc-950/60 px-3.5 py-2.5"
                        >
                          <div className="flex items-center gap-3">
                            {tx.kind === "income" ? (
                              <TrendingUp className="h-4 w-4 text-emerald-400" />
                            ) : tx.kind === "expense" ? (
                              <TrendingDown className="h-4 w-4 text-rose-400" />
                            ) : (
                              <ArrowLeftRight className="h-4 w-4 text-sky-400" />
                            )}
                            <div>
                              <p className="text-sm font-medium">
                                {tx.description}
                              </p>
                              <p className="text-xs text-zinc-400">
                                {tx.localDate}
                                {tx.clientOrPayee
                                  ? ` · ${tx.clientOrPayee}`
                                  : ""}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <span
                              className={`text-sm font-semibold ${
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
                              onClick={() =>
                                void handleDeleteTransaction(tx.id)
                              }
                              className="text-zinc-500 hover:text-rose-400"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>

              {/* Editable Categories Catalog */}
              <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <Tag className="h-4 w-4 text-emerald-400" />
                  <span>Categorías Editables</span>
                </h2>

                <div className="mt-3 flex flex-wrap gap-1">
                  {CATEGORY_SCOPES.map((scope) => (
                    <button
                      key={scope}
                      type="button"
                      onClick={() => setActiveScope(scope)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                        activeScope === scope
                          ? "bg-emerald-500 text-zinc-950"
                          : "bg-zinc-950 text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      {scope}
                    </button>
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {categories
                    .filter((c) => c.scope === activeScope)
                    .map((cat) => (
                      <span
                        key={cat.id}
                        className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs"
                      >
                        <span>{cat.name}</span>
                        <button
                          type="button"
                          aria-label={`Eliminar ${cat.name}`}
                          onClick={() => void handleDeleteCategory(cat.id)}
                          className="text-zinc-500 hover:text-rose-400"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                </div>

                <form
                  onSubmit={(e) => void handleAddCategory(e)}
                  className="mt-4 flex gap-1.5"
                >
                  <input
                    type="text"
                    placeholder="Nueva categoría..."
                    aria-label="Nueva categoría"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs"
                  />
                  <button
                    type="submit"
                    aria-label="Crear categoría"
                    className="rounded-lg bg-emerald-500 px-2.5 py-1.5 text-zinc-950 hover:bg-emerald-400"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </form>
              </section>
            </div>

            {/* Recurring Rules Section */}
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <CalendarClock className="h-4 w-4 text-emerald-400" />
                  <span>
                    Recurrentes (Nómina, Alquiler, Suscripciones · MultiHora)
                  </span>
                </h2>
                {user && isOnline && (
                  <button
                    type="button"
                    onClick={() => void handleRunDueRecurring()}
                    className="rounded-lg bg-zinc-800 px-3 py-1 text-xs font-medium text-emerald-300 hover:bg-zinc-700"
                  >
                    Ejecutar vencidas ahora
                  </button>
                )}
              </div>

              <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {recurringRules.length === 0 ? (
                  <p className="text-xs text-zinc-500">
                    Programa tu nómina, alquiler o suscripciones recurrentes.
                  </p>
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
                        className="flex items-center justify-between rounded-xl border border-zinc-800/80 bg-zinc-950/60 px-3.5 py-2.5"
                      >
                        <div>
                          <p className="text-sm font-medium">
                            {rule.description}
                          </p>
                          <p className="text-xs text-zinc-400">
                            {rule.frequency} · Próx: {rule.nextDueLocalDate}
                          </p>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`text-sm font-semibold ${
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
                            className="text-zinc-500 hover:text-rose-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <form
                onSubmit={(e) => void handleCreateRecurring(e)}
                className="mt-4 grid gap-2 border-t border-zinc-800/80 pt-4 sm:grid-cols-6"
              >
                <select
                  aria-label="Tipo recurrente"
                  value={recKind}
                  onChange={(e) =>
                    setRecKind(e.target.value as "income" | "expense")
                  }
                  className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs"
                >
                  <option value="expense">
                    {t(locale, "transaction.type.expense")}
                  </option>
                  <option value="income">
                    {t(locale, "transaction.type.income")}
                  </option>
                </select>

                <input
                  type="text"
                  required
                  placeholder="Concepto (ej. Nómina / Netflix)"
                  aria-label="Concepto recurrente"
                  value={recDescription}
                  onChange={(e) => setRecDescription(e.target.value)}
                  className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs sm:col-span-2"
                />

                <input
                  type="text"
                  required
                  placeholder="Importe"
                  aria-label="Importe recurrente"
                  value={recAmount}
                  onChange={(e) => setRecAmount(e.target.value)}
                  className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs"
                />

                <select
                  aria-label="Frecuencia"
                  value={recFrequency}
                  onChange={(e) =>
                    setRecFrequency(e.target.value as FinancialPeriod)
                  }
                  className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs"
                >
                  {FINANCIAL_PERIODS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>

                <div className="flex gap-1.5">
                  <input
                    type="number"
                    min={1}
                    max={31}
                    placeholder="Día"
                    aria-label="Día del mes"
                    value={recDayOfMonth}
                    onChange={(e) => setRecDayOfMonth(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs"
                  />
                  <button
                    type="submit"
                    aria-label="Añadir regla recurrente"
                    className="rounded-lg bg-emerald-500 px-3 py-1.5 text-zinc-950 hover:bg-emerald-400"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </form>
            </section>

            {/* Investments (V1), Net Worth & CSV Export Panel */}
            <WealthAndExportPanel
              accounts={accounts}
              totalLiquidBalanceBase={balancesSummary.totalBalance}
              transactions={transactions}
              categories={categories}
              investments={investments}
              netWorthItems={netWorthItems}
              preferences={preferences}
              {...(fxSnapshot ? { fxSnapshot } : {})}
              onDispatchCommand={dispatchCommand}
            />
          </div>
        )}
      </main>

      {(user || offlineGuest) && (
        <AgentFloatingDock
          isOnline={isOnline}
          isAuthenticated={Boolean(user)}
          accounts={accounts}
          formattedTotalBalance={balancesSummary.formattedTotalBalance}
          preferences={preferences}
          {...(fxSnapshot ? { fxSnapshot } : {})}
          onDispatchCommand={dispatchCommand}
          onToggleConfirmEnabled={handleToggleAgentConfirm}
        />
      )}
    </div>
  );
}
