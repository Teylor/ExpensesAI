import {
  CATEGORY_SCOPES,
  type CategoryScope,
  type CommandEnvelope,
  type MessageKey,
  type SupportedLocale,
  t,
  type UserPreferences,
} from "@agenticf/domain";
import {
  CloudOff,
  LogOut,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Tag,
  Wifi,
} from "lucide-react";
import { type FormEvent, useState } from "react";
import type {
  LocalAccount,
  LocalCategory,
  LocalInvestment,
  LocalNetWorthItem,
  LocalTransaction,
} from "../../offline/db.js";
import { CsvExportCard } from "../CsvExportCard.js";

export interface ManageTabProps {
  readonly accounts: readonly LocalAccount[];
  readonly transactions: readonly LocalTransaction[];
  readonly investments: readonly LocalInvestment[];
  readonly netWorthItems: readonly LocalNetWorthItem[];
  readonly categories: readonly LocalCategory[];
  readonly preferences: UserPreferences;
  readonly isOnline: boolean;
  readonly isSyncing: boolean;
  readonly pendingCount: number;
  readonly syncError: string | null;
  readonly userEmail: string | null;
  readonly generateUuid: () => string;
  readonly onDispatchCommand: (envelope: CommandEnvelope) => Promise<void>;
  readonly onSyncNow: () => void;
  readonly onToggleLocale: (locale: SupportedLocale) => void;
  readonly onToggleAgentConfirm: (enabled: boolean) => void;
  readonly onLogout: () => void;
}

export function ManageTab({
  accounts,
  transactions,
  investments,
  netWorthItems,
  categories,
  preferences,
  isOnline,
  isSyncing,
  pendingCount,
  syncError,
  userEmail,
  generateUuid,
  onDispatchCommand,
  onSyncNow,
  onToggleLocale,
  onToggleAgentConfirm,
  onLogout,
}: ManageTabProps) {
  const locale = preferences.locale;
  const [activeScope, setActiveScope] = useState<CategoryScope>("expense");
  const [newCatName, setNewCatName] = useState("");

  const scopedCategories = categories.filter((c) => c.scope === activeScope);

  const handleAddCategory = async (e: FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    await onDispatchCommand({
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
    await onDispatchCommand({
      commandId: generateUuid(),
      actor: "manual",
      issuedAtUtc: new Date().toISOString(),
      type: "category.delete",
      payload: { categoryId },
    });
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Editable Categories Catalog */}
      <section
        data-testid="manage-categories-card"
        className="rounded-2xl border border-(--border-subtle) bg-(--bg-surface) p-5 lg:col-span-2"
      >
        <h2 className="flex items-center gap-2 text-base font-semibold text-(--text-primary)">
          <Tag className="h-4 w-4 text-emerald-400" aria-hidden={true} />
          <span>{t(locale, "manage.categoriesTitle")}</span>
        </h2>

        <div
          role="tablist"
          aria-label={t(locale, "manage.categoriesTitle")}
          className="mt-3 flex flex-wrap gap-1.5"
        >
          {CATEGORY_SCOPES.map((scope) => {
            const count = categories.filter((c) => c.scope === scope).length;
            const isActive = activeScope === scope;
            return (
              <button
                key={scope}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveScope(scope)}
                className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:min-h-9 ${
                  isActive
                    ? "bg-emerald-500 text-zinc-950"
                    : "border border-(--border-subtle) bg-(--bg-input) text-(--text-secondary) hover:text-(--text-primary)"
                }`}
              >
                <span>
                  {t(locale, `manage.categoriesScope.${scope}` as MessageKey)}
                </span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[11px] tabular-nums ${
                    isActive
                      ? "bg-zinc-950/20 text-zinc-950"
                      : "bg-(--bg-surface-strong) text-(--text-secondary)"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {scopedCategories.length === 0 ? (
            <p className="text-xs text-(--text-secondary)">
              {t(locale, "manage.categoriesEmpty")}
            </p>
          ) : (
            scopedCategories.map((cat) => (
              <span
                key={cat.id}
                className="inline-flex min-h-9 items-center gap-1 rounded-full border border-(--border-subtle) bg-(--bg-input) py-0.5 pr-1 pl-3 text-xs text-(--text-primary)"
              >
                <span>{cat.name}</span>
                <button
                  type="button"
                  aria-label={`Eliminar ${cat.name}`}
                  onClick={() => void handleDeleteCategory(cat.id)}
                  className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-full text-(--text-secondary) hover:bg-rose-500/15 hover:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                >
                  ×
                </button>
              </span>
            ))
          )}
        </div>

        <form
          onSubmit={(e) => void handleAddCategory(e)}
          className="mt-4 flex max-w-md gap-2"
        >
          <input
            type="text"
            placeholder={
              locale === "en" ? "New category..." : "Nueva categoría..."
            }
            aria-label="Nueva categoría"
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-(--border-subtle) bg-(--bg-input) px-3.5 py-2 text-base text-(--text-primary) placeholder:text-(--text-secondary) focus-visible:border-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:min-h-10 sm:text-sm"
          />
          <button
            type="submit"
            aria-label="Crear categoría"
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500 px-3.5 text-zinc-950 hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 sm:min-h-10"
          >
            <Plus className="h-4 w-4" aria-hidden={true} />
          </button>
        </form>
      </section>

      {/* CSV Data Exports (migrated from Wealth) */}
      <CsvExportCard
        accounts={accounts}
        transactions={transactions}
        investments={investments}
        netWorthItems={netWorthItems}
        preferences={preferences}
      />

      {/* Offline Sync & Outbox Status */}
      <section className="rounded-2xl border border-(--border-subtle) bg-(--bg-surface) p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-(--text-primary)">
          {isOnline ? (
            <Wifi className="h-4 w-4 text-emerald-400" aria-hidden={true} />
          ) : (
            <CloudOff className="h-4 w-4 text-amber-300" aria-hidden={true} />
          )}
          <span>{t(locale, "manage.syncTitle")}</span>
        </h2>
        <p className="mt-1 text-xs text-(--text-secondary)">
          {t(locale, "manage.syncDesc")}
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-(--border-subtle) bg-(--bg-input) p-3.5">
          <div>
            <p className="text-sm font-medium text-(--text-primary)">
              {isOnline
                ? t(locale, "shell.online")
                : t(locale, "shell.offline")}
            </p>
            <p className="text-xs tabular-nums text-(--text-secondary)">
              {pendingCount > 0
                ? t(locale, "shell.pendingCount", { count: pendingCount })
                : t(locale, "shell.synced")}
            </p>
          </div>

          <button
            type="button"
            onClick={onSyncNow}
            disabled={isSyncing}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-zinc-800 px-3.5 py-2 text-xs font-semibold text-zinc-100 hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`}
              aria-hidden={true}
            />
            <span>
              {isSyncing
                ? t(locale, "shell.syncing")
                : t(locale, "shell.syncNow")}
            </span>
          </button>
        </div>

        {syncError && (
          <p
            role="alert"
            className="mt-3 rounded-xl border border-rose-500/30 bg-rose-950/40 px-3 py-2 text-xs text-rose-200"
          >
            {syncError}
          </p>
        )}
      </section>

      {/* Quick Preferences & Session (modular slot for future Theme & Config Seeds) */}
      <section className="rounded-2xl border border-(--border-subtle) bg-(--bg-surface) p-5 lg:col-span-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-(--text-primary)">
          <SlidersHorizontal
            className="h-4 w-4 text-emerald-400"
            aria-hidden={true}
          />
          <span>{t(locale, "manage.prefsTitle")}</span>
        </h2>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          {/* Language */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-(--border-subtle) bg-(--bg-input) p-3.5">
            <span className="text-xs font-medium text-(--text-primary)">
              {t(locale, "manage.languageLabel")}
            </span>
            <div className="flex rounded-lg bg-(--bg-surface-strong) p-0.5 ring-1 ring-(--border-subtle)">
              {(["es", "en"] as const).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  aria-pressed={locale === lang}
                  onClick={() => onToggleLocale(lang)}
                  className={`min-h-10 rounded-md px-3 text-xs font-semibold uppercase focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:min-h-8 ${
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

          {/* Agent Pre-Confirmation Switch */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-(--border-subtle) bg-(--bg-input) p-3.5">
            <div className="min-w-0">
              <p className="text-xs font-medium text-(--text-primary)">
                {t(locale, "agent.ui.confirmToggleTitle")}
              </p>
              <p className="mt-0.5 text-[11px] text-(--text-secondary)">
                {t(locale, "agent.ui.confirmToggleDesc")}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={preferences.agentConfirmEnabled}
              aria-label={t(locale, "agent.ui.confirmToggleTitle")}
              onClick={() =>
                onToggleAgentConfirm(!preferences.agentConfirmEnabled)
              }
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                preferences.agentConfirmEnabled
                  ? "bg-emerald-500"
                  : "bg-zinc-700"
              }`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-zinc-950 transition ${
                  preferences.agentConfirmEnabled
                    ? "translate-x-5"
                    : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Session & Logout */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-(--border-subtle) bg-(--bg-input) p-3.5">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wider text-(--text-secondary)">
                {t(locale, "manage.sessionLabel")}
              </p>
              <p className="truncate text-xs font-medium text-(--text-primary)">
                {userEmail ?? t(locale, "shell.localMode")}
              </p>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-(--border-subtle) bg-(--bg-surface-strong) px-3 py-1.5 text-xs font-medium text-(--text-secondary) hover:text-(--text-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden={true} />
              <span>{t(locale, "shell.logout")}</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
