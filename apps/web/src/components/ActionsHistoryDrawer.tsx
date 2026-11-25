import { type SupportedLocale, t } from "@agenticf/domain";
import {
  Activity,
  ArrowLeftRight,
  CloudOff,
  type LucideIcon,
  Repeat,
  RotateCcw,
  Scale,
  Tags,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import { type KeyboardEvent, useCallback, useEffect, useRef } from "react";
import type {
  HistoryActionItem,
  HistoryFilter,
  HistoryProjection,
} from "../history/actions.js";

export interface ActionsHistoryDrawerProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly locale: SupportedLocale;
  readonly isOnline: boolean;
  readonly filter: HistoryFilter;
  readonly onFilterChange: (filter: HistoryFilter) => void;
  readonly loading: boolean;
  /** True when the server fetch failed (local rows are still shown). */
  readonly serverError: boolean;
  readonly onRetry: () => void;
  readonly items: readonly HistoryActionItem[];
  readonly counts: HistoryProjection["counts"];
  /** Command id currently being undone (1-click Undo guard). */
  readonly busyCommandId: string | null;
  readonly onUndoCommand: (commandId: string) => void;
}

const FILTERS: readonly HistoryFilter[] = ["all", "active", "undone"];

const NEXT_FILTER: Record<HistoryFilter, HistoryFilter> = {
  all: "active",
  active: "undone",
  undone: "all",
};
const PREV_FILTER: Record<HistoryFilter, HistoryFilter> = {
  all: "undone",
  active: "all",
  undone: "active",
};

function iconForCommandType(commandType: string): LucideIcon {
  switch (commandType.split(".")[0]) {
    case "account":
      return Wallet;
    case "transaction":
      return ArrowLeftRight;
    case "recurring":
      return Repeat;
    case "investment":
      return TrendingUp;
    case "networth":
      return Scale;
    case "category":
      return Tags;
    default:
      return Activity;
  }
}

function formatTimestamp(iso: string, locale: SupportedLocale): string {
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return iso;
    }
    return new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return iso;
  }
}

export function ActionsHistoryDrawer({
  open,
  onClose,
  locale,
  isOnline,
  filter,
  onFilterChange,
  loading,
  serverError,
  onRetry,
  items,
  counts,
  busyCommandId,
  onUndoCommand,
}: ActionsHistoryDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);
  const tabRefs = useRef<
    Partial<Record<HistoryFilter, HTMLButtonElement | null>>
  >({});

  // Modal focus management: move focus in on open, restore it to the header
  // trigger (history-trigger-button) on close.
  useEffect(() => {
    if (!open) {
      if (wasOpenRef.current) {
        const trigger = document.querySelector<HTMLElement>(
          '[data-testid="history-trigger-button"]',
        );
        trigger?.focus();
      }
      wasOpenRef.current = false;
      return;
    }
    wasOpenRef.current = true;
    panelRef.current?.focus();
  }, [open]);

  const handlePanelKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") {
        return;
      }
      // Minimal focus trap: cycle Tab/Shift+Tab within the dialog.
      const focusables =
        panelRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, [tabindex]:not([tabindex="-1"])',
        ) ?? [];
      if (focusables.length === 0) {
        return;
      }
      let first: HTMLElement | null = null;
      let last: HTMLElement | null = null;
      for (const el of focusables) {
        if (first === null) {
          first = el;
        }
        last = el;
      }
      if (first === null || last === null) {
        return;
      }
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panelRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (!e.shiftKey && active === panelRef.current) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  const handleTablistKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    let next: HistoryFilter | null = null;
    if (e.key === "ArrowRight") {
      next = NEXT_FILTER[filter];
    } else if (e.key === "ArrowLeft") {
      next = PREV_FILTER[filter];
    } else if (e.key === "Home") {
      next = "all";
    } else if (e.key === "End") {
      next = "undone";
    }
    if (next) {
      e.preventDefault();
      onFilterChange(next);
      tabRefs.current[next]?.focus();
    }
  };

  if (!open) {
    return null;
  }

  const emptyMessage =
    filter === "active"
      ? t(locale, "history.empty.active")
      : filter === "undone"
        ? t(locale, "history.empty.undone")
        : t(locale, "history.empty.all");

  return (
    <>
      <button
        type="button"
        data-testid="actions-history-backdrop"
        aria-label={t(locale, "history.closeAria")}
        onClick={onClose}
        className="fixed inset-0 z-50 cursor-default bg-black/60 backdrop-blur-[2px]"
      />
      <div
        id="actions-history-drawer"
        data-testid="actions-history-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="actions-history-title"
        ref={panelRef}
        tabIndex={-1}
        onKeyDown={handlePanelKeyDown}
        className="fixed inset-x-0 bottom-0 z-50 flex h-[min(85dvh,640px)] flex-col overflow-hidden rounded-t-2xl border-t border-(--border-subtle) bg-(--bg-canvas) pb-[env(safe-area-inset-bottom)] shadow-2xl outline-none lg:inset-x-auto lg:inset-y-0 lg:right-0 lg:h-auto lg:w-[420px] lg:max-w-[92vw] lg:rounded-l-2xl lg:rounded-tr-none lg:border lg:border-r-0 lg:border-(--border-subtle) lg:pb-0"
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between border-b border-(--border-subtle) bg-(--bg-surface-strong)/90 px-4 py-2.5">
          <span
            id="actions-history-title"
            className="text-sm font-semibold text-(--text-primary)"
          >
            {t(locale, "history.title")}
          </span>
          <button
            type="button"
            data-testid="actions-history-close"
            aria-label={t(locale, "history.closeAria")}
            onClick={onClose}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-(--text-secondary) hover:bg-zinc-800 hover:text-(--text-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:min-h-9 sm:min-w-9"
          >
            <X className="h-4 w-4" aria-hidden={true} />
          </button>
        </div>

        {/* Filter tabs */}
        <div
          role="tablist"
          aria-label={t(locale, "history.filterAria")}
          onKeyDown={handleTablistKeyDown}
          className="flex items-center gap-1 border-b border-(--border-subtle) px-2 pt-1"
        >
          {FILTERS.map((f) => {
            const selected = filter === f;
            const count = counts[f];
            return (
              <button
                key={f}
                type="button"
                role="tab"
                id={`actions-history-tab-${f}`}
                data-testid={`actions-history-tab-${f}`}
                aria-selected={selected}
                aria-controls="actions-history-content"
                tabIndex={selected ? 0 : -1}
                ref={(el) => {
                  tabRefs.current[f] = el;
                }}
                onClick={() => onFilterChange(f)}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-t-lg px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:min-h-9 ${
                  selected
                    ? "text-(--text-primary)"
                    : "text-(--text-secondary) hover:text-(--text-primary)"
                }`}
              >
                <span
                  className={`border-b-2 pb-1.5 ${
                    selected ? "border-emerald-400" : "border-transparent"
                  }`}
                >
                  {t(locale, `history.filter.${f}`)}
                </span>
                <span className="rounded-full bg-(--bg-surface-strong) px-1.5 py-0.5 text-[10px] tabular-nums text-(--text-secondary)">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div
          id="actions-history-content"
          role="tabpanel"
          aria-labelledby={`actions-history-tab-${filter}`}
          className="flex-1 overflow-y-auto"
        >
          {serverError && (
            <div
              role="alert"
              className="flex items-start gap-2 border-b border-amber-500/30 bg-amber-950/30 px-4 py-2.5 text-xs text-amber-200"
            >
              <CloudOff
                className="mt-0.5 h-3.5 w-3.5 shrink-0"
                aria-hidden={true}
              />
              <span className="min-w-0 flex-1">
                {t(locale, "history.error")}
              </span>
              <button
                type="button"
                data-testid="actions-history-retry"
                aria-label={t(locale, "history.refreshAria")}
                onClick={onRetry}
                className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-2 text-xs font-semibold hover:bg-amber-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:min-h-9"
              >
                {t(locale, "history.refreshAria")}
              </button>
            </div>
          )}

          {loading ? (
            <ul
              aria-hidden={true}
              className="divide-y divide-(--border-subtle)"
            >
              {[0, 1, 2, 3].map((i) => (
                <li key={i} className="h-[92px] animate-pulse p-4" />
              ))}
            </ul>
          ) : items.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm text-(--text-secondary)">{emptyMessage}</p>
              {filter !== "all" && (
                <button
                  type="button"
                  data-testid="actions-history-view-all"
                  onClick={() => onFilterChange("all")}
                  className="mt-3 inline-flex min-h-11 items-center rounded-lg px-3 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:min-h-9"
                >
                  {t(locale, "history.empty.viewAll")}
                </button>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-(--border-subtle)">
              {items.map((item) => {
                const Icon = iconForCommandType(item.commandType);
                const offlineGuard = item.status === "synced" && !isOnline;
                const busy = busyCommandId === item.commandId;
                return (
                  <li
                    key={item.commandId}
                    data-testid={`history-row-${item.commandId}`}
                    className="px-4 py-3"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-300"
                        aria-hidden={true}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p
                          id={`history-row-summary-${item.commandId}`}
                          className={`text-sm ${
                            item.status === "undone"
                              ? "text-(--text-secondary) line-through"
                              : "text-(--text-primary)"
                          }`}
                        >
                          {item.summary}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full border border-(--border-subtle) px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-(--text-secondary)">
                            {t(locale, `history.actor.${item.actor}`)}
                          </span>
                          <span className="rounded-full border border-(--border-subtle) px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-(--text-secondary)">
                            {t(locale, `history.status.${item.status}`)}
                          </span>
                          {offlineGuard && (
                            <span
                              className="inline-flex items-center gap-1 text-[10px] text-(--text-secondary)"
                              role="note"
                            >
                              <CloudOff
                                className="h-3 w-3"
                                aria-hidden={true}
                              />
                              {t(locale, "history.offlineUndoGuard")}
                            </span>
                          )}
                          <time
                            dateTime={item.timestamp}
                            className="ml-auto text-xs tabular-nums text-(--text-secondary)"
                          >
                            {formatTimestamp(item.timestamp, locale)}
                          </time>
                        </div>
                      </div>
                      {item.canUndo && (
                        <button
                          type="button"
                          data-testid={`history-undo-${item.commandId}`}
                          aria-label={t(locale, "history.undoAria")}
                          aria-describedby={`history-row-summary-${item.commandId}`}
                          aria-busy={busy}
                          disabled={busy || offlineGuard}
                          onClick={() => onUndoCommand(item.commandId)}
                          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-(--text-secondary) hover:bg-emerald-500/15 hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-9 sm:min-w-9"
                        >
                          <RotateCcw className="h-4 w-4" aria-hidden={true} />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
