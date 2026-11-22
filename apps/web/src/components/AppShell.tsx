import { type MessageKey, type SupportedLocale, t } from "@agenticf/domain";
import {
  AlertCircle,
  ArrowLeftRight,
  CloudOff,
  Landmark,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Wallet,
  Wifi,
  X,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import type { AppTab } from "../navigation/tabs.js";
import { TabErrorBoundary } from "./TabErrorBoundary.js";

interface NavItemConfig {
  readonly id: AppTab;
  readonly labelKey: MessageKey;
  readonly icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}

const NAV_ITEMS: readonly NavItemConfig[] = [
  { id: "overview", labelKey: "nav.overview", icon: LayoutDashboard },
  { id: "activity", labelKey: "nav.activity", icon: ArrowLeftRight },
  { id: "accounts", labelKey: "nav.accounts", icon: Wallet },
  { id: "wealth", labelKey: "nav.wealth", icon: Landmark },
  { id: "manage", labelKey: "nav.manage", icon: SlidersHorizontal },
];

export interface AppShellProps {
  readonly activeTab: AppTab;
  readonly onSelectTab: (tab: AppTab) => void;
  readonly locale: SupportedLocale;
  readonly onToggleLocale: (locale: SupportedLocale) => void;
  readonly isOnline: boolean;
  readonly isSyncing: boolean;
  readonly pendingCount: number;
  readonly syncError: string | null;
  readonly onSyncNow: () => void;
  readonly userEmail: string | null;
  readonly onLogout: () => void;
  readonly lastCommand: { commandId: string; summary: string } | null;
  readonly onUndoLast: () => void;
  readonly onDismissLastCommand: () => void;
  readonly children: ReactNode;
}

export function AppShell({
  activeTab,
  onSelectTab,
  locale,
  onToggleLocale,
  isOnline,
  isSyncing,
  pendingCount,
  syncError,
  onSyncNow,
  userEmail,
  onLogout,
  lastCommand,
  onUndoLast,
  onDismissLastCommand,
  children,
}: AppShellProps) {
  const activeItem =
    NAV_ITEMS.find((item) => item.id === activeTab) ?? NAV_ITEMS[0];
  const activeTitle = activeItem ? t(locale, activeItem.labelKey) : "AgenticF";

  return (
    <div className="min-h-screen bg-(--bg-canvas) text-(--text-primary)">
      {/* Skip Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:rounded-xl focus:bg-emerald-500 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-zinc-950 focus:outline-none focus:ring-2 focus:ring-emerald-300"
      >
        {t(locale, "nav.skipToContent")}
      </a>

      {/* Desktop Left Sidebar (lg+) */}
      <aside
        data-testid="desktop-sidebar"
        aria-label={t(locale, "nav.primaryAria")}
        className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-60 lg:flex-col lg:border-r lg:border-(--border-subtle) lg:bg-(--bg-canvas)"
      >
        <div className="flex h-14 items-center gap-2.5 border-b border-(--border-subtle) px-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30">
            <Wallet className="h-5 w-5" aria-hidden={true} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight">
              AgenticF
            </p>
            <p className="truncate text-[11px] text-(--text-secondary)">
              PWA Offline-First
            </p>
          </div>
        </div>

        <nav
          aria-label={t(locale, "nav.primaryAria")}
          className="flex-1 space-y-1 p-3"
        >
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === activeTab;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`desktop-nav-tab-${item.id}`}
                aria-current={isActive ? "page" : undefined}
                onClick={() => onSelectTab(item.id)}
                className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                  isActive
                    ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
                    : "text-(--text-secondary) hover:bg-(--bg-surface-strong) hover:text-(--text-primary)"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden={true} />
                <span className="truncate">{t(locale, item.labelKey)}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-(--border-subtle) p-3">
          <p className="truncate px-2 text-xs text-(--text-secondary)">
            {userEmail ?? t(locale, "shell.localMode")}
          </p>
          <button
            type="button"
            onClick={onLogout}
            className="mt-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-(--border-subtle) bg-(--bg-surface-strong) px-3 py-1.5 text-xs font-medium text-(--text-secondary) hover:text-(--text-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden={true} />
            <span>{t(locale, "shell.logout")}</span>
          </button>
        </div>
      </aside>

      {/* Main Content Column */}
      <div className="flex min-h-screen flex-col lg:pl-60">
        {/* Sticky Top Header */}
        <header className="sticky top-0 z-20 border-b border-(--border-subtle) bg-(--bg-canvas)/90 pt-[env(safe-area-inset-top)] backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4 lg:px-6">
            {/* Mobile Brand / Desktop Active Tab Heading */}
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30 lg:hidden">
                <Wallet className="h-4 w-4" aria-hidden={true} />
              </div>
              <span className="truncate text-sm font-semibold tracking-tight lg:hidden">
                AgenticF
              </span>
              <h1 className="hidden truncate text-base font-semibold tracking-tight lg:block">
                {activeTitle}
              </h1>
            </div>

            {/* Right Controls */}
            <div className="flex shrink-0 items-center gap-2">
              <div
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${
                  isOnline
                    ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30"
                    : "bg-amber-500/10 text-amber-300 ring-amber-500/30"
                }`}
              >
                {isOnline ? (
                  <Wifi className="h-3.5 w-3.5" aria-hidden={true} />
                ) : (
                  <CloudOff className="h-3.5 w-3.5" aria-hidden={true} />
                )}
                <span>
                  {isOnline
                    ? t(locale, "shell.online")
                    : t(locale, "shell.offline")}
                </span>
                {pendingCount > 0 && (
                  <span className="ml-0.5 rounded-full bg-amber-500/20 px-1.5 text-[11px] tabular-nums text-amber-200">
                    {pendingCount}
                  </span>
                )}
              </div>

              {pendingCount > 0 && (
                <button
                  type="button"
                  onClick={onSyncNow}
                  disabled={isSyncing}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-100 hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-50"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`}
                    aria-hidden={true}
                  />
                  <span>{t(locale, "shell.sync")}</span>
                </button>
              )}

              {/* Desktop Locale Toggle (mobile lives in Manage tab to avoid header wrap) */}
              <div className="hidden rounded-lg bg-(--bg-surface-strong) p-0.5 ring-1 ring-(--border-subtle) lg:flex">
                {(["es", "en"] as const).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    aria-pressed={locale === lang}
                    onClick={() => onToggleLocale(lang)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium uppercase focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
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
          </div>
        </header>

        {/* Sticky Global Undo Banner (zero overlap with Bottom Nav or Agent FAB) */}
        {lastCommand && (
          <div
            role="status"
            aria-live="polite"
            data-testid="global-undo-banner"
            className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-40 border-b border-emerald-500/30 bg-emerald-950/95 px-4 py-2.5 backdrop-blur lg:top-14"
          >
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 text-xs sm:text-sm">
              <span className="min-w-0 flex-1 text-emerald-100">
                {lastCommand.summary}
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={onUndoLast}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 sm:min-h-8"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden={true} />
                  <span>{t(locale, "shell.undo")}</span>
                </button>
                <button
                  type="button"
                  aria-label={t(locale, "shell.dismissNotice")}
                  onClick={onDismissLastCommand}
                  className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg text-emerald-200 hover:bg-emerald-900/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 sm:min-h-8 sm:min-w-8"
                >
                  <X className="h-4 w-4" aria-hidden={true} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Sync Failure Alert Banner */}
        {syncError && (
          <div
            role="alert"
            className="border-b border-rose-500/30 bg-rose-950/60 px-4 py-2.5"
          >
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 text-xs sm:text-sm">
              <div className="flex items-center gap-2 text-rose-200">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden={true} />
                <span>{syncError}</span>
              </div>
              <button
                type="button"
                onClick={onSyncNow}
                className="shrink-0 rounded-lg bg-rose-500/20 px-3 py-1.5 text-xs font-semibold text-rose-100 ring-1 ring-rose-500/40 hover:bg-rose-500/30"
              >
                {t(locale, "shell.retry")}
              </button>
            </div>
          </div>
        )}

        {/* Main Active Tab View */}
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-6xl flex-1 px-4 py-4 pb-[calc(8.5rem+env(safe-area-inset-bottom))] focus:outline-none md:px-5 md:py-5 lg:px-6 lg:py-6 lg:pb-24"
        >
          <h1 className="mb-4 text-lg font-semibold tracking-tight text-(--text-primary) lg:hidden">
            {activeTitle}
          </h1>
          <TabErrorBoundary resetKey={activeTab} locale={locale}>
            {children}
          </TabErrorBoundary>
        </main>
      </div>

      {/* Mobile & Tablet Fixed Bottom Tab Bar (<lg) */}
      <nav
        data-testid="mobile-bottom-nav"
        aria-label={t(locale, "nav.mobileAria")}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-(--border-subtle) bg-(--bg-canvas)/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <div className="mx-auto grid h-16 max-w-lg grid-cols-5 items-center px-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === activeTab;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`mobile-nav-tab-${item.id}`}
                aria-current={isActive ? "page" : undefined}
                onClick={() => onSelectTab(item.id)}
                className={`relative flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                  isActive
                    ? "text-emerald-400"
                    : "text-(--text-secondary) hover:text-(--text-primary)"
                }`}
              >
                {isActive && (
                  <span
                    aria-hidden={true}
                    className="absolute top-0.5 h-0.5 w-6 rounded-full bg-emerald-400"
                  />
                )}
                <Icon className="h-5 w-5 shrink-0" aria-hidden={true} />
                <span className="max-w-full truncate">
                  {t(locale, item.labelKey)}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
