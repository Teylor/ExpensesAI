import {
  type CommandEnvelope,
  computeBalancesSummary,
  DEFAULT_USER_PREFERENCES,
  type FxRateSnapshot,
  type SupportedLocale,
  simulateCommandImpact,
  t,
  type UserPreferences,
} from "@agenticf/domain";
import { Wallet } from "lucide-react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  type CommandHistoryItemDto,
  completeChatGptOAuthCallback,
  createHttpOutboxTransport,
  fetchCommandHistory,
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
import { ActionsHistoryDrawer } from "./components/ActionsHistoryDrawer.js";
import { ActionToast, type ActionToastData } from "./components/ActionToast.js";
import { AgentFloatingDock } from "./components/AgentFloatingDock.js";
import { AppShell } from "./components/AppShell.js";
import { AccountsTab } from "./components/tabs/AccountsTab.js";
import { ActivityTab } from "./components/tabs/ActivityTab.js";
import { ManageTab } from "./components/tabs/ManageTab.js";
import { OverviewTab } from "./components/tabs/OverviewTab.js";
import { WealthTab } from "./components/tabs/WealthTab.js";
import { type HistoryFilter, projectHistory } from "./history/actions.js";
import { type AppTab, buildTabUrl, parseAppTab } from "./navigation/tabs.js";
import {
  createOfflineDb,
  type LocalAccount,
  type LocalCategory,
  type LocalInvestment,
  type LocalNetWorthItem,
  type LocalRecurringRule,
  type LocalTransaction,
  type OutboxEntry,
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
  const [isHydrating, setIsHydrating] = useState(true);
  const [activeTab, setActiveTab] = useState<AppTab>(() =>
    typeof window !== "undefined"
      ? parseAppTab(window.location.search)
      : "overview",
  );

  const [user, setUser] = useState<PublicUserDto | null>(null);
  const [offlineGuest, setOfflineGuest] = useState(false);
  const [preferences, setPreferences] = useState<UserPreferences>(
    DEFAULT_USER_PREFERENCES,
  );
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
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

  const [actionToast, setActionToast] = useState<ActionToastData | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyServerError, setHistoryServerError] = useState(false);
  const [serverHistoryItems, setServerHistoryItems] = useState<
    CommandHistoryItemDto[] | null
  >(null);
  const [busyCommandId, setBusyCommandId] = useState<string | null>(null);
  const [localEntries, setLocalEntries] = useState<readonly OutboxEntry[]>([]);

  // Auth form
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  const locale = preferences.locale;

  // Keep <html lang="..."> synced with user preferences
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  // Listen to browser Back / Forward for URL ?tab=
  useEffect(() => {
    const onPopState = () => {
      setActiveTab(parseAppTab(window.location.search));
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  const handleSelectTab = useCallback((nextTab: AppTab) => {
    setActiveTab(nextTab);
    if (typeof window !== "undefined") {
      const nextUrl = buildTabUrl(window.location.href, nextTab);
      if (
        nextUrl !==
        `${window.location.pathname}${window.location.search}${window.location.hash}`
      ) {
        window.history.pushState({ tab: nextTab }, "", nextUrl);
      }
    }
  }, []);

  const reloadLocalState = useCallback(async () => {
    const [accs, cats, txs, recs, invs, nws, fx, prefs, pending, outbox] =
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
        outboxEngine.listEntries(),
      ]);

    setAccounts(accs.filter((a) => !a.isArchived));
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
    setLocalEntries(outbox);
  }, []);

  const handleSyncNow = useCallback(async () => {
    setIsSyncing(true);
    setSyncError(null);
    try {
      await outboxEngine.syncPending();
      if (user) {
        await hydrateOfflineDbFromServer(offlineDb);
      }
      await reloadLocalState();
    } catch {
      setSyncError(t(locale, "shell.syncError"));
    } finally {
      setIsSyncing(false);
    }
  }, [locale, reloadLocalState, user]);

  const refreshServerHistory = useCallback(async () => {
    if (!user) {
      setServerHistoryItems(null);
      setHistoryServerError(false);
      return;
    }
    setHistoryLoading(true);
    const items = await fetchCommandHistory(50);
    setServerHistoryItems(items);
    setHistoryServerError(items === null);
    setHistoryLoading(false);
  }, [user]);

  useEffect(() => {
    void (async () => {
      try {
        await reloadLocalState();

        const params = new URLSearchParams(window.location.search);
        const oauthCode = params.get("code");
        const oauthState = params.get("state");
        if (oauthCode && oauthState) {
          try {
            const cb = await completeChatGptOAuthCallback(
              oauthState,
              oauthCode,
            );
            window.history.replaceState({}, "", "/");
            setActiveTab("overview");
            if (cb.user && cb.preferences) {
              setUser(cb.user);
              await offlineDb.savePreferences(cb.preferences);
              await hydrateOfflineDbFromServer(offlineDb);
              await reloadLocalState();
              return;
            }
          } catch (err) {
            setAuthError(
              err instanceof Error
                ? err.message
                : "Error completando Sign in with ChatGPT",
            );
            window.history.replaceState({}, "", "/");
            setActiveTab("overview");
          }
        }

        const me = await fetchCurrentUser();
        if (me) {
          setUser(me.user);
          await offlineDb.savePreferences(me.preferences);
          await outboxEngine.syncPending();
          await hydrateOfflineDbFromServer(offlineDb);
          await reloadLocalState();
        }
      } finally {
        setIsHydrating(false);
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
    setActionToast({
      id: envelope.commandId,
      summary: impact.summary,
      variant: "action",
    });
    await reloadLocalState();

    if (isOnline && user) {
      void handleSyncNow();
    }
  };

  const handleUndoCommand = async (commandId: string) => {
    if (busyCommandId) return;
    setBusyCommandId(commandId);
    try {
      await outboxEngine.undoCommand(commandId);
      if (isOnline && user) {
        await hydrateOfflineDbFromServer(offlineDb);
      }
      await reloadLocalState();
      if (isOnline && user) {
        await refreshServerHistory();
      }
      setActionToast({
        id: `${commandId}::undone`,
        summary: t(locale, "toast.undoneSummary"),
        variant: "undone",
      });
    } finally {
      setBusyCommandId(null);
    }
  };

  const handleOpenHistory = () => {
    setAgentOpen(false);
    setHistoryOpen(true);
    void refreshServerHistory();
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
    setActionToast(null);
    setHistoryOpen(false);
    setAgentOpen(false);
    setServerHistoryItems(null);
    setHistoryServerError(false);
    setBusyCommandId(null);
    setHistoryFilter("all");
    setSyncError(null);
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

  const handleRunDueRecurring = async () => {
    if (!isOnline || !user) return;
    await outboxEngine.syncPending();
    await runDueRecurringRulesRemote();
    await hydrateOfflineDbFromServer(offlineDb);
    await reloadLocalState();
  };

  const historyProjection = useMemo(
    () =>
      projectHistory({
        localEntries,
        serverItems: serverHistoryItems ?? [],
        preferences,
        filter: historyFilter,
      }),
    [localEntries, serverHistoryItems, preferences, historyFilter],
  );

  const balancesSummary = computeBalancesSummary(
    accounts,
    preferences,
    fxSnapshot,
  );

  if (isHydrating) {
    return (
      <div className="min-h-screen bg-(--bg-canvas) px-4 py-8 text-(--text-primary)">
        <div
          role="status"
          aria-live="polite"
          className="mx-auto max-w-6xl space-y-4"
        >
          <p className="sr-only">{t(locale, "shell.loading")}</p>
          <div className="h-14 animate-pulse rounded-2xl bg-(--bg-surface-strong)" />
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="h-[92px] animate-pulse rounded-2xl bg-(--bg-surface-strong)" />
            <div className="h-[92px] animate-pulse rounded-2xl bg-(--bg-surface-strong)" />
            <div className="h-[92px] animate-pulse rounded-2xl bg-(--bg-surface-strong)" />
          </div>
          <div className="h-56 animate-pulse rounded-2xl bg-(--bg-surface-strong)" />
        </div>
      </div>
    );
  }

  if (!user && !offlineGuest) {
    return (
      <div className="min-h-screen bg-(--bg-canvas) text-(--text-primary)">
        <header className="border-b border-(--border-subtle) bg-(--bg-canvas)/90 pt-[env(safe-area-inset-top)] backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30">
                <Wallet className="h-5 w-5" aria-hidden={true} />
              </div>
              <span className="font-semibold tracking-tight">AgenticF</span>
            </div>

            <div className="flex rounded-lg bg-(--bg-surface-strong) p-0.5 ring-1 ring-(--border-subtle)">
              {(["es", "en"] as const).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  aria-pressed={locale === lang}
                  onClick={() => void handleToggleLocale(lang)}
                  className={`min-h-9 rounded-md px-2.5 text-xs font-medium uppercase focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                    locale === lang
                      ? "bg-emerald-500 text-zinc-950"
                      : "text-(--text-secondary) hover:text-(--text-primary)"
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>
          </div>
        </header>

        <main className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center px-4 py-8">
          <div className="w-full max-w-md rounded-2xl border border-(--border-subtle) bg-(--bg-surface) p-6 shadow-xl">
            <h1 className="text-lg font-semibold text-(--text-primary)">
              {authMode === "login"
                ? locale === "en"
                  ? "Sign in"
                  : "Iniciar sesión"
                : locale === "en"
                  ? "Create account"
                  : "Crear cuenta"}
            </h1>
            <p className="mt-1 text-xs text-(--text-secondary)">
              {locale === "en"
                ? "Sync your accounts with PostgreSQL or enter local offline-first mode."
                : "Sincroniza tus cuentas con PostgreSQL o entra en modo local offline-first."}
            </p>

            <form
              onSubmit={(e) => void handleAuthSubmit(e)}
              className="mt-4 space-y-3"
            >
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="email@ejemplo.com"
                aria-label="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="min-h-11 w-full rounded-xl border border-(--border-subtle) bg-(--bg-input) px-3.5 py-2 text-base text-(--text-primary) placeholder:text-(--text-secondary) focus-visible:border-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:text-sm"
              />
              <input
                type="password"
                required
                minLength={12}
                autoComplete={
                  authMode === "login" ? "current-password" : "new-password"
                }
                placeholder={
                  locale === "en"
                    ? "Password (min. 12 characters)"
                    : "Contraseña (mín. 12 caracteres)"
                }
                aria-label="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="min-h-11 w-full rounded-xl border border-(--border-subtle) bg-(--bg-input) px-3.5 py-2 text-base text-(--text-primary) placeholder:text-(--text-secondary) focus-visible:border-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:text-sm"
              />
              {authError && (
                <p role="alert" className="text-xs text-rose-400">
                  {authError}
                </p>
              )}
              <button
                type="submit"
                className="min-h-11 w-full rounded-xl bg-emerald-500 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
              >
                {authMode === "login"
                  ? locale === "en"
                    ? "Sign in"
                    : "Entrar"
                  : locale === "en"
                    ? "Register"
                    : "Registrarme"}
              </button>
            </form>

            <div className="mt-3">
              <button
                type="button"
                onClick={() => void handleSignInWithChatGpt()}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-(--border-strong) bg-(--bg-input) py-2 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-strong) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                <span>Sign in with ChatGPT (Plan Sharing)</span>
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-(--text-secondary)">
              <button
                type="button"
                onClick={() =>
                  setAuthMode(authMode === "login" ? "register" : "login")
                }
                className="min-h-10 underline hover:text-(--text-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                {authMode === "login"
                  ? locale === "en"
                    ? "No account? Register"
                    : "¿No tienes cuenta? Regístrate"
                  : locale === "en"
                    ? "Already have an account? Sign in"
                    : "¿Ya tienes cuenta? Inicia sesión"}
              </button>
              <button
                type="button"
                onClick={() => setOfflineGuest(true)}
                className="min-h-10 font-medium text-emerald-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                Usar modo Offline Local →
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <>
      <AppShell
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        locale={locale}
        onToggleLocale={(lang) => void handleToggleLocale(lang)}
        isOnline={isOnline}
        isSyncing={isSyncing}
        pendingCount={pendingCount}
        syncError={syncError}
        onSyncNow={() => void handleSyncNow()}
        userEmail={user ? user.email : null}
        onLogout={() => void handleLogout()}
        historyActiveCount={historyProjection.counts.active}
        onOpenHistory={handleOpenHistory}
      >
        {activeTab === "overview" && (
          <OverviewTab
            balancesSummary={balancesSummary}
            accounts={accounts}
            transactions={transactions}
            categories={categories}
            preferences={preferences}
            {...(fxSnapshot ? { fxSnapshot } : {})}
            pendingCount={pendingCount}
            isSyncing={isSyncing}
            onSyncNow={() => void handleSyncNow()}
            onSelectTab={handleSelectTab}
          />
        )}

        {activeTab === "activity" && (
          <ActivityTab
            accounts={accounts}
            categories={categories}
            transactions={transactions}
            recurringRules={recurringRules}
            preferences={preferences}
            isOnline={isOnline}
            isAuthenticated={Boolean(user)}
            generateUuid={generateUuid}
            onDispatchCommand={dispatchCommand}
            onRunDueRecurring={handleRunDueRecurring}
            onSelectTab={handleSelectTab}
          />
        )}

        {activeTab === "accounts" && (
          <AccountsTab
            balancesSummary={balancesSummary}
            preferences={preferences}
            generateUuid={generateUuid}
            onDispatchCommand={dispatchCommand}
          />
        )}

        {activeTab === "wealth" && (
          <WealthTab
            totalLiquidBalanceBase={balancesSummary.totalBalance}
            categories={categories}
            investments={investments}
            netWorthItems={netWorthItems}
            preferences={preferences}
            {...(fxSnapshot ? { fxSnapshot } : {})}
            generateUuid={generateUuid}
            onDispatchCommand={dispatchCommand}
          />
        )}

        {activeTab === "manage" && (
          <ManageTab
            accounts={accounts}
            transactions={transactions}
            investments={investments}
            netWorthItems={netWorthItems}
            categories={categories}
            preferences={preferences}
            isOnline={isOnline}
            isSyncing={isSyncing}
            pendingCount={pendingCount}
            syncError={syncError}
            userEmail={user ? user.email : null}
            generateUuid={generateUuid}
            onDispatchCommand={dispatchCommand}
            onSyncNow={() => void handleSyncNow()}
            onToggleLocale={(lang) => void handleToggleLocale(lang)}
            onToggleAgentConfirm={(enabled) =>
              void handleToggleAgentConfirm(enabled)
            }
            onLogout={() => void handleLogout()}
          />
        )}
      </AppShell>

      <AgentFloatingDock
        isOnline={isOnline}
        isAuthenticated={Boolean(user)}
        accounts={accounts}
        formattedTotalBalance={balancesSummary.formattedTotalBalance}
        preferences={preferences}
        {...(fxSnapshot ? { fxSnapshot } : {})}
        onDispatchCommand={dispatchCommand}
        onToggleConfirmEnabled={handleToggleAgentConfirm}
        open={agentOpen}
        onOpenChange={(nextOpen) => {
          setAgentOpen(nextOpen);
          if (nextOpen) setHistoryOpen(false);
        }}
      />

      <ActionsHistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        locale={locale}
        isOnline={isOnline}
        filter={historyFilter}
        onFilterChange={setHistoryFilter}
        loading={historyLoading}
        serverError={historyServerError}
        onRetry={() => void refreshServerHistory()}
        items={historyProjection.items}
        counts={historyProjection.counts}
        busyCommandId={busyCommandId}
        onUndoCommand={(commandId) => void handleUndoCommand(commandId)}
      />

      <ActionToast
        toast={actionToast}
        locale={locale}
        onUndo={
          actionToast && actionToast.variant === "action"
            ? () => void handleUndoCommand(actionToast.id)
            : null
        }
        onDismiss={() => setActionToast(null)}
      />
    </>
  );
}
