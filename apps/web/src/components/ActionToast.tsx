import { type SupportedLocale, t } from "@agenticf/domain";
import { RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export type ActionToastVariant = "action" | "undone";

export interface ActionToastData {
  readonly id: string;
  readonly summary: string;
  readonly variant: ActionToastVariant;
}

export interface ActionToastProps {
  readonly toast: ActionToastData | null;
  readonly locale: SupportedLocale;
  readonly onUndo: (() => void) | null;
  readonly onDismiss: () => void;
}

const AUTO_DISMISS_MS = 3000;
const TICK_MS = 100;

const VARIANT_STYLES: Record<
  ActionToastVariant,
  { readonly card: string; readonly strip: string; readonly icon: string }
> = {
  action: {
    card: "ring-emerald-500/30 bg-emerald-950/95 text-emerald-100",
    strip: "bg-emerald-400",
    icon: "text-emerald-200",
  },
  undone: {
    card: "ring-zinc-500/40 bg-zinc-900/95 text-zinc-200",
    strip: "bg-zinc-400",
    icon: "text-zinc-300",
  },
};

export function ActionToast({
  toast,
  locale,
  onUndo,
  onDismiss,
}: ActionToastProps) {
  const [remainingMs, setRemainingMs] = useState(AUTO_DISMISS_MS);
  const remainingRef = useRef(AUTO_DISMISS_MS);
  const lastTickAtRef = useRef(0);
  const pausedRef = useRef(false);
  const activeToastIdRef = useRef<string | null>(null);
  const intervalRef = useRef<number | null>(null);
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  const stopTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    if (pausedRef.current) {
      return;
    }
    stopTimer();
    lastTickAtRef.current = Date.now();
    intervalRef.current = window.setInterval(() => {
      const now = Date.now();
      const delta = now - lastTickAtRef.current;
      lastTickAtRef.current = now;
      remainingRef.current = Math.max(0, remainingRef.current - delta);
      setRemainingMs(remainingRef.current);
      if (remainingRef.current <= 0) {
        stopTimer();
        onDismissRef.current();
      }
    }, TICK_MS);
  }, [stopTimer]);

  useEffect(() => {
    if (toast === null) {
      return;
    }
    if (toast.id !== activeToastIdRef.current) {
      // New toast: latest wins, reset countdown to the full window.
      activeToastIdRef.current = toast.id;
      remainingRef.current = AUTO_DISMISS_MS;
      setRemainingMs(AUTO_DISMISS_MS);
      pausedRef.current = false;
    }
    startTimer();
    return stopTimer;
  }, [toast, startTimer, stopTimer]);

  const handlePause = useCallback(() => {
    if (pausedRef.current) {
      return;
    }
    pausedRef.current = true;
    stopTimer();
  }, [stopTimer]);

  const handleResume = useCallback(() => {
    if (!pausedRef.current) {
      return;
    }
    pausedRef.current = false;
    startTimer();
  }, [startTimer]);

  if (!toast) {
    return null;
  }

  const variant = VARIANT_STYLES[toast.variant];
  const progress = remainingMs / AUTO_DISMISS_MS;

  return (
    <div
      data-testid="action-toast"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="fixed inset-x-4 bottom-[calc(8.5rem+env(safe-area-inset-bottom))] z-[55] mx-auto w-auto max-w-[420px] lg:inset-x-auto lg:left-[16.25rem] lg:right-auto lg:bottom-5 lg:mx-0 lg:w-full lg:max-w-[min(420px,calc(100vw-43.5rem))]"
      onMouseEnter={handlePause}
      onMouseLeave={handleResume}
      onFocusCapture={handlePause}
      onBlurCapture={handleResume}
    >
      <div
        className={`relative flex items-center justify-between gap-2 overflow-hidden rounded-xl px-3.5 py-2.5 shadow-2xl ring-1 backdrop-blur ${variant.card}`}
      >
        <p className="min-w-0 flex-1 truncate text-xs font-medium sm:text-sm">
          {toast.summary}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          {onUndo && (
            <button
              type="button"
              data-testid="action-toast-undo"
              onClick={onUndo}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 sm:min-h-8"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden={true} />
              <span>{t(locale, "shell.undo")}</span>
            </button>
          )}
          <button
            type="button"
            data-testid="action-toast-dismiss"
            aria-label={t(locale, "toast.dismissAria")}
            onClick={onDismiss}
            className={`inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg ${variant.icon} hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 sm:min-h-8 sm:min-w-8`}
          >
            <X className="h-4 w-4" aria-hidden={true} />
          </button>
        </div>
        <div
          className="absolute inset-x-0 bottom-0 h-0.5 motion-reduce:hidden"
          aria-hidden={true}
        >
          <div
            className={`h-full w-full origin-left transition-[transform] duration-100 ease-linear ${variant.strip}`}
            style={{ transform: `scaleX(${progress})` }}
          />
        </div>
      </div>
    </div>
  );
}
