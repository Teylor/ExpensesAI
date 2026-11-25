import {
  type CommandEnvelope,
  evaluateFinancialDomainGuardrail,
  type FxRateSnapshot,
  parseNaturalFinanceIntent,
  simulateCommandImpact,
  t,
  type UserPreferences,
} from "@agenticf/domain";
import {
  Bot,
  Check,
  KeyRound,
  Mic,
  MicOff,
  Send,
  Settings2,
  ShieldAlert,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type AiConnectionDto,
  createByokConnection,
  deleteAiConnection,
  fetchAiConnections,
  sendAgentChatRemote,
  startChatGptOAuthFlow,
} from "../api/client.js";
import type { LocalAccount } from "../offline/db.js";
import { createBrowserVoiceProvider } from "../voice/speech.js";

export interface AgentFloatingDockProps {
  readonly isOnline: boolean;
  readonly isAuthenticated: boolean;
  readonly accounts: readonly LocalAccount[];
  readonly formattedTotalBalance: string;
  readonly preferences: UserPreferences;
  readonly fxSnapshot?: FxRateSnapshot;
  readonly onDispatchCommand: (envelope: CommandEnvelope) => Promise<void>;
  readonly onToggleConfirmEnabled: (enabled: boolean) => Promise<void>;
  /** Controlled open state so other drawers (e.g. Actions History) can close it. */
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

interface ChatMessage {
  readonly id: string;
  readonly role: "user" | "agent";
  readonly text: string;
  readonly status?: string;
  readonly proposedCommand?: CommandEnvelope;
  readonly impactSummary?: string;
}

const INPUT_CLASS =
  "min-h-11 w-full rounded-xl border border-(--border-subtle) bg-(--bg-input) px-3 py-2 text-base text-(--text-primary) placeholder:text-(--text-secondary) focus-visible:border-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:min-h-9 sm:text-sm";

function generateUuid(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }
  return "30000000-0000-4000-8000-000000000000";
}

export function AgentFloatingDock({
  isOnline,
  isAuthenticated,
  accounts,
  formattedTotalBalance,
  preferences,
  fxSnapshot,
  onDispatchCommand,
  onToggleConfirmEnabled,
  open,
  onOpenChange,
}: AgentFloatingDockProps) {
  const [tab, setTab] = useState<"chat" | "settings">("chat");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const locale = preferences.locale;

  // AI Connections state (Settings tab)
  const [connections, setConnections] = useState<AiConnectionDto[]>([]);
  const [byokLabel, setByokLabel] = useState(() =>
    t(locale, "agent.ui.byokDefaultLabel"),
  );
  const [byokModel, setByokModel] = useState("gpt-4o-mini");
  const [byokKey, setByokKey] = useState("");
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);

  const voiceProvider = useMemo(() => createBrowserVoiceProvider(), []);
  const voiceSupported = voiceProvider.isSupported();

  const closeDrawer = useCallback(() => {
    onOpenChange(false);
    requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    if (tab === "chat") {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDrawer();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, tab, closeDrawer]);

  useEffect(() => {
    if (open && tab === "settings" && isAuthenticated && isOnline) {
      void fetchAiConnections().then(setConnections);
    }
  }, [open, tab, isAuthenticated, isOnline]);

  const simulateLocally = (command: CommandEnvelope) => {
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
    return simulateCommandImpact(
      { accounts: accountMap },
      command,
      preferences,
      fxSnapshot,
    );
  };

  const handleSendMessage = async (rawText: string) => {
    const text = rawText.trim();
    if (!text) return;

    const userMsgId = generateUuid();
    setMessages((prev) => [...prev, { id: userMsgId, role: "user", text }]);
    setInput("");
    setIsSending(true);

    try {
      // 1. Always enforce client-side fast financial guardrail
      const guardrail = evaluateFinancialDomainGuardrail(text, locale);
      if (!guardrail.allowed) {
        setMessages((prev) => [
          ...prev,
          {
            id: generateUuid(),
            role: "agent",
            text:
              guardrail.rejectionMessage ??
              t(locale, "agent.guardrail.outOfScope"),
            status: "rejected_guardrail",
          },
        ]);
        return;
      }

      // 2. If online & authenticated, query backend AgentOrchestrator (ChatGPT Plan Sharing -> BYOK -> Manual)
      if (isOnline && isAuthenticated) {
        const remote = await sendAgentChatRemote(text);
        if (remote && remote.status !== "quota_exhausted") {
          setMessages((prev) => [
            ...prev,
            {
              id: generateUuid(),
              role: "agent",
              text: remote.replyText,
              status: remote.status,
              ...(remote.proposedCommand
                ? { proposedCommand: remote.proposedCommand }
                : {}),
              ...(remote.impact?.summary
                ? { impactSummary: remote.impact.summary }
                : {}),
            },
          ]);
          return;
        }
      }

      // 3. Offline / Local fallback using shared @agenticf/domain natural parser & impact simulator
      const defaultAcc = accounts[0];
      const parsed = parseNaturalFinanceIntent(text, {
        ...(defaultAcc ? { defaultAccountId: defaultAcc.id } : {}),
        defaultCurrency: defaultAcc?.currency ?? preferences.baseCurrency,
        commandId: generateUuid(),
        nowIso: new Date().toISOString(),
      });

      if (parsed) {
        const impact = simulateLocally(parsed);
        if (preferences.agentConfirmEnabled) {
          setMessages((prev) => [
            ...prev,
            {
              id: generateUuid(),
              role: "agent",
              text: impact.summary,
              status: "confirmation_required",
              proposedCommand: parsed,
              impactSummary: impact.summary,
            },
          ]);
        } else {
          await onDispatchCommand(parsed);
          setMessages((prev) => [
            ...prev,
            {
              id: generateUuid(),
              role: "agent",
              text: impact.summary,
              status: "executed",
            },
          ]);
        }
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: generateUuid(),
          role: "agent",
          text: t(locale, "agent.ui.balanceFallback", {
            balance: formattedTotalBalance,
          }),
          status: "answered",
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleConfirmProposal = async (
    messageId: string,
    command: CommandEnvelope,
  ) => {
    await onDispatchCommand(command);
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? {
              id: m.id,
              role: m.role,
              text: m.text,
              status: "executed",
            }
          : m,
      ),
    );
  };

  const handleCancelProposal = (messageId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? {
              id: m.id,
              role: m.role,
              text: t(locale, "agent.ui.cancelled"),
              status: "cancelled",
            }
          : m,
      ),
    );
  };

  const handleToggleVoice = () => {
    if (isListening) {
      voiceProvider.stop();
      setIsListening(false);
      return;
    }

    setIsListening(true);
    voiceProvider.start({
      locale,
      onTranscript: (transcript) => {
        setInput(transcript);
      },
      onError: () => {
        setIsListening(false);
      },
      onEnd: () => {
        setIsListening(false);
      },
    });
  };

  const handleSaveByok = async (e: FormEvent) => {
    e.preventDefault();
    if (!byokKey.trim()) return;
    setSettingsMsg(null);
    try {
      await createByokConnection({
        provider: "openai",
        label: byokLabel.trim() || "BYOK Key",
        model: byokModel.trim() || "gpt-4o-mini",
        apiKey: byokKey.trim(),
      });
      setByokKey("");
      setConnections(await fetchAiConnections());
      setSettingsMsg(t(locale, "agent.ui.byokSaved"));
    } catch (err) {
      setSettingsMsg(
        err instanceof Error ? err.message : t(locale, "agent.ui.byokError"),
      );
    }
  };

  const handleStartChatGpt = async () => {
    setSettingsMsg(null);
    try {
      const { authorizationUrl } = await startChatGptOAuthFlow();
      setSettingsMsg(
        t(locale, "agent.ui.chatgptStarted", { url: authorizationUrl }),
      );
    } catch (err) {
      setSettingsMsg(
        err instanceof Error ? err.message : t(locale, "agent.ui.chatgptError"),
      );
    }
  };

  return (
    <>
      {/* Mobile / Tablet Backdrop Scrim */}
      {open && (
        <button
          type="button"
          data-testid="agent-backdrop"
          aria-label={t(locale, "agent.ui.closeAria")}
          onClick={closeDrawer}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] lg:hidden"
        />
      )}

      {/* Agent Drawer: Mobile Bottom-Sheet (<lg) / Desktop Floating Panel (lg+) */}
      {open && (
        <div
          role="dialog"
          aria-label={t(locale, "agent.ui.title")}
          data-testid="agent-drawer"
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex h-[min(82dvh,600px)] max-h-[calc(100dvh-3.5rem-env(safe-area-inset-top))] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border-t border-(--border-subtle) bg-(--bg-canvas) shadow-2xl lg:inset-x-auto lg:right-5 lg:bottom-[5.25rem] lg:mx-0 lg:h-[min(540px,calc(100dvh-7.5rem))] lg:max-h-none lg:w-[380px] lg:rounded-2xl lg:border"
        >
          {/* Drawer Header */}
          <div className="flex items-center justify-between border-b border-(--border-subtle) bg-(--bg-surface-strong)/90 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Sparkles
                className="h-4 w-4 text-emerald-400"
                aria-hidden={true}
              />
              <span className="text-sm font-semibold text-(--text-primary)">
                {t(locale, "agent.ui.title")}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label={t(locale, "agent.ui.settingsAria")}
                aria-pressed={tab === "settings"}
                onClick={() => setTab(tab === "chat" ? "settings" : "chat")}
                className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:min-h-9 sm:min-w-9 ${
                  tab === "settings"
                    ? "bg-emerald-500 text-zinc-950"
                    : "text-(--text-secondary) hover:bg-zinc-800 hover:text-(--text-primary)"
                }`}
              >
                <Settings2 className="h-4 w-4" aria-hidden={true} />
              </button>
              <button
                type="button"
                aria-label={t(locale, "agent.ui.closeAria")}
                onClick={closeDrawer}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-(--text-secondary) hover:bg-zinc-800 hover:text-(--text-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:min-h-9 sm:min-w-9"
              >
                <X className="h-4 w-4" aria-hidden={true} />
              </button>
            </div>
          </div>

          {tab === "chat" ? (
            <>
              {/* Messages */}
              <div className="flex-1 space-y-3 overflow-y-auto p-4 text-xs sm:text-sm">
                {messages.length === 0 && (
                  <div className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-3.5 text-(--text-secondary)">
                    {t(locale, "agent.ui.emptyPrompt")}
                  </div>
                )}

                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${
                      msg.role === "user" ? "items-end" : "items-start"
                    }`}
                  >
                    <div
                      className={`max-w-[90%] rounded-xl px-3.5 py-2.5 ${
                        msg.role === "user"
                          ? "bg-emerald-500 font-medium text-zinc-950"
                          : msg.status === "rejected_guardrail"
                            ? "border border-amber-500/30 bg-amber-950/30 text-amber-200"
                            : "border border-(--border-subtle) bg-(--bg-surface-strong) text-(--text-primary)"
                      }`}
                    >
                      {msg.status === "rejected_guardrail" && (
                        <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase text-amber-300">
                          <ShieldAlert
                            className="h-3.5 w-3.5"
                            aria-hidden={true}
                          />
                          <span>{t(locale, "agent.ui.guardrailBadge")}</span>
                        </div>
                      )}
                      <p>{msg.text}</p>

                      {msg.proposedCommand && (
                        <div className="mt-3 flex flex-wrap gap-2 border-t border-(--border-subtle) pt-2.5">
                          <button
                            type="button"
                            onClick={() =>
                              void handleConfirmProposal(
                                msg.id,
                                msg.proposedCommand as CommandEnvelope,
                              )
                            }
                            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 sm:min-h-9"
                          >
                            <Check className="h-3.5 w-3.5" aria-hidden={true} />
                            <span>{t(locale, "agent.ui.confirm")}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCancelProposal(msg.id)}
                            className="inline-flex min-h-11 items-center rounded-xl bg-zinc-800 px-3.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:min-h-9"
                          >
                            {t(locale, "agent.ui.cancel")}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {isSending && (
                  <div className="flex items-start">
                    <div
                      role="status"
                      aria-live="polite"
                      className="rounded-xl border border-(--border-subtle) bg-(--bg-surface-strong) px-3.5 py-2 text-xs text-(--text-secondary)"
                    >
                      {t(locale, "agent.ui.thinking")}
                    </div>
                  </div>
                )}
              </div>

              {/* Chat + Push-to-Talk Input (safe-area aware on mobile) */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleSendMessage(input);
                }}
                className="flex items-center gap-2 border-t border-(--border-subtle) bg-(--bg-surface) px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:pb-3"
              >
                <button
                  type="button"
                  disabled={!voiceSupported}
                  onClick={handleToggleVoice}
                  title={
                    voiceSupported
                      ? t(locale, "agent.ui.voiceSupportedTitle")
                      : t(locale, "agent.ui.voiceUnsupportedTitle")
                  }
                  aria-label={t(locale, "agent.ui.voiceAria")}
                  className={`inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:min-h-9 sm:min-w-9 ${
                    isListening
                      ? "animate-pulse bg-rose-500 text-white"
                      : voiceSupported
                        ? "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                        : "cursor-not-allowed bg-(--bg-surface-strong) text-(--text-secondary) opacity-50"
                  }`}
                >
                  {isListening ? (
                    <MicOff className="h-4 w-4" aria-hidden={true} />
                  ) : (
                    <Mic className="h-4 w-4" aria-hidden={true} />
                  )}
                </button>

                <input
                  ref={inputRef}
                  type="text"
                  placeholder={t(locale, "agent.ui.inputPlaceholder")}
                  aria-label={t(locale, "agent.ui.inputAria")}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  className={INPUT_CLASS}
                />

                <button
                  type="submit"
                  disabled={isSending || !input.trim()}
                  aria-label={t(locale, "agent.ui.sendAria")}
                  className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-zinc-950 hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:opacity-50 sm:min-h-9 sm:min-w-9"
                >
                  <Send className="h-4 w-4" aria-hidden={true} />
                </button>
              </form>
            </>
          ) : (
            /* AI Settings Tab */
            <div className="flex-1 space-y-4 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-xs lg:pb-4">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-3.5">
                <div>
                  <p className="font-medium text-(--text-primary)">
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
                    void onToggleConfirmEnabled(
                      !preferences.agentConfirmEnabled,
                    )
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

              <div className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-3.5">
                <p className="font-medium text-(--text-primary)">
                  {t(locale, "agent.ui.chatgptTitle")}
                </p>
                <p className="mt-0.5 text-[11px] text-(--text-secondary)">
                  {t(locale, "agent.ui.chatgptDesc")}
                </p>
                <button
                  type="button"
                  disabled={!isAuthenticated || !isOnline}
                  onClick={() => void handleStartChatGpt()}
                  className="mt-3 min-h-11 w-full rounded-xl bg-emerald-500 py-2 font-semibold text-zinc-950 hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:opacity-50 sm:min-h-9"
                >
                  {t(locale, "agent.ui.chatgptConnect")}
                </button>
              </div>

              <form
                onSubmit={(e) => void handleSaveByok(e)}
                className="space-y-2.5 rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-3.5"
              >
                <p className="flex items-center gap-1.5 font-medium text-(--text-primary)">
                  <KeyRound
                    className="h-3.5 w-3.5 text-emerald-400"
                    aria-hidden={true}
                  />
                  <span>{t(locale, "agent.ui.byokTitle")}</span>
                </p>
                <input
                  type="text"
                  placeholder={t(locale, "agent.ui.byokLabelPlaceholder")}
                  aria-label={t(locale, "agent.ui.byokLabelAria")}
                  value={byokLabel}
                  onChange={(e) => setByokLabel(e.target.value)}
                  className={INPUT_CLASS}
                />
                <input
                  type="text"
                  placeholder={t(locale, "agent.ui.byokModelPlaceholder")}
                  aria-label={t(locale, "agent.ui.byokModelAria")}
                  value={byokModel}
                  onChange={(e) => setByokModel(e.target.value)}
                  className={INPUT_CLASS}
                />
                <input
                  type="password"
                  placeholder={t(locale, "agent.ui.byokKeyPlaceholder")}
                  aria-label={t(locale, "agent.ui.byokKeyAria")}
                  value={byokKey}
                  onChange={(e) => setByokKey(e.target.value)}
                  className={INPUT_CLASS}
                />
                <button
                  type="submit"
                  disabled={!isAuthenticated || !isOnline || !byokKey.trim()}
                  className="min-h-11 w-full rounded-xl bg-zinc-800 py-2 font-medium text-zinc-100 hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-50 sm:min-h-9"
                >
                  {t(locale, "agent.ui.byokSave")}
                </button>
              </form>

              {settingsMsg && (
                <p
                  role="status"
                  aria-live="polite"
                  className="text-xs text-emerald-300"
                >
                  {settingsMsg}
                </p>
              )}

              {connections.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase text-(--text-secondary)">
                    {t(locale, "agent.ui.activeConnections")}
                  </p>
                  {connections.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between rounded-xl border border-(--border-subtle) bg-(--bg-input) px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-(--text-primary)">
                          {c.label}
                        </p>
                        <p className="text-[11px] text-(--text-secondary)">
                          {c.kind} · {c.maskedPreview}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label={t(locale, "agent.ui.deleteConnectionAria", {
                          label: c.label,
                        })}
                        onClick={() =>
                          void deleteAiConnection(c.id).then(() =>
                            fetchAiConnections().then(setConnections),
                          )
                        }
                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-(--text-secondary) hover:bg-rose-500/15 hover:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:min-h-9 sm:min-w-9"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden={true} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Always-visible Floating Trigger Button (elevated above Bottom Nav on <lg, hidden while mobile sheet is open) */}
      <button
        ref={triggerRef}
        type="button"
        data-testid="agent-floating-trigger"
        aria-label={t(locale, "agent.ui.triggerAria")}
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        className={`${
          open ? "hidden lg:flex" : "flex"
        } fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 h-12 w-12 items-center justify-center gap-2 rounded-full bg-emerald-500 font-semibold text-zinc-950 shadow-lg shadow-emerald-500/25 transition hover:scale-105 hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 sm:w-auto sm:px-4 lg:right-5 lg:bottom-5 lg:h-13`}
      >
        <Bot className="h-5 w-5 shrink-0" aria-hidden={true} />
        <span className="hidden text-sm sm:inline">
          {t(locale, "agent.ui.triggerButton")}
        </span>
      </button>
    </>
  );
}
