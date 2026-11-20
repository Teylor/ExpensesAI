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
import { type FormEvent, useEffect, useMemo, useState } from "react";
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
}

interface ChatMessage {
  readonly id: string;
  readonly role: "user" | "agent";
  readonly text: string;
  readonly status?: string;
  readonly proposedCommand?: CommandEnvelope;
  readonly impactSummary?: string;
}

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
}: AgentFloatingDockProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"chat" | "settings">("chat");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [isSending, setIsSending] = useState(false);

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
    <div className="fixed right-4 bottom-4 z-50 flex flex-col items-end">
      {open && (
        <div
          data-testid="agent-drawer"
          className="mb-3 flex h-[480px] w-[360px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl"
        >
          {/* Drawer Header */}
          <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/90 px-4 py-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-400" />
              <span className="text-sm font-semibold">
                {t(locale, "agent.ui.title")}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label={t(locale, "agent.ui.settingsAria")}
                onClick={() => setTab(tab === "chat" ? "settings" : "chat")}
                className={`rounded-lg p-1.5 text-xs ${
                  tab === "settings"
                    ? "bg-emerald-500 text-zinc-950"
                    : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                }`}
              >
                <Settings2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label={t(locale, "agent.ui.closeAria")}
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {tab === "chat" ? (
            <>
              {/* Messages */}
              <div className="flex-1 space-y-3 overflow-y-auto p-4 text-xs">
                {messages.length === 0 && (
                  <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3 text-zinc-400">
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
                      className={`max-w-[90%] rounded-xl px-3 py-2 ${
                        msg.role === "user"
                          ? "bg-emerald-500 text-zinc-950 font-medium"
                          : msg.status === "rejected_guardrail"
                            ? "border border-amber-500/30 bg-amber-950/30 text-amber-200"
                            : "border border-zinc-800 bg-zinc-900 text-zinc-100"
                      }`}
                    >
                      {msg.status === "rejected_guardrail" && (
                        <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase text-amber-400">
                          <ShieldAlert className="h-3 w-3" />
                          <span>{t(locale, "agent.ui.guardrailBadge")}</span>
                        </div>
                      )}
                      <p>{msg.text}</p>

                      {msg.proposedCommand && (
                        <div className="mt-2.5 flex gap-2 border-t border-zinc-800 pt-2">
                          <button
                            type="button"
                            onClick={() =>
                              void handleConfirmProposal(
                                msg.id,
                                msg.proposedCommand as CommandEnvelope,
                              )
                            }
                            className="flex items-center gap-1 rounded-lg bg-emerald-500 px-2.5 py-1 text-[11px] font-semibold text-zinc-950 hover:bg-emerald-400"
                          >
                            <Check className="h-3 w-3" />
                            <span>{t(locale, "agent.ui.confirm")}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCancelProposal(msg.id)}
                            className="rounded-lg bg-zinc-800 px-2.5 py-1 text-[11px] text-zinc-300 hover:bg-zinc-700"
                          >
                            {t(locale, "agent.ui.cancel")}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Chat + Push-to-Talk Input */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleSendMessage(input);
                }}
                className="flex items-center gap-2 border-t border-zinc-800 bg-zinc-900/60 p-3"
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
                  className={`rounded-xl p-2 ${
                    isListening
                      ? "animate-pulse bg-rose-500 text-white"
                      : voiceSupported
                        ? "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                        : "bg-zinc-900 text-zinc-600 cursor-not-allowed"
                  }`}
                >
                  {isListening ? (
                    <MicOff className="h-4 w-4" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </button>

                <input
                  type="text"
                  placeholder={t(locale, "agent.ui.inputPlaceholder")}
                  aria-label={t(locale, "agent.ui.inputAria")}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none"
                />

                <button
                  type="submit"
                  disabled={isSending || !input.trim()}
                  aria-label={t(locale, "agent.ui.sendAria")}
                  className="rounded-xl bg-emerald-500 p-2 text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </>
          ) : (
            /* AI Settings Tab */
            <div className="flex-1 space-y-4 overflow-y-auto p-4 text-xs">
              <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                <div>
                  <p className="font-medium text-zinc-100">
                    {t(locale, "agent.ui.confirmToggleTitle")}
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    {t(locale, "agent.ui.confirmToggleDesc")}
                  </p>
                </div>
                <input
                  type="checkbox"
                  aria-label={t(locale, "agent.ui.confirmToggleTitle")}
                  checked={preferences.agentConfirmEnabled}
                  onChange={(e) =>
                    void onToggleConfirmEnabled(e.target.checked)
                  }
                />
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                <p className="font-medium text-zinc-100">
                  {t(locale, "agent.ui.chatgptTitle")}
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-400">
                  {t(locale, "agent.ui.chatgptDesc")}
                </p>
                <button
                  type="button"
                  disabled={!isAuthenticated || !isOnline}
                  onClick={() => void handleStartChatGpt()}
                  className="mt-2.5 w-full rounded-lg bg-emerald-500 py-1.5 font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
                >
                  {t(locale, "agent.ui.chatgptConnect")}
                </button>
              </div>

              <form
                onSubmit={(e) => void handleSaveByok(e)}
                className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3"
              >
                <p className="flex items-center gap-1.5 font-medium text-zinc-100">
                  <KeyRound className="h-3.5 w-3.5 text-emerald-400" />
                  <span>{t(locale, "agent.ui.byokTitle")}</span>
                </p>
                <input
                  type="text"
                  placeholder={t(locale, "agent.ui.byokLabelPlaceholder")}
                  aria-label={t(locale, "agent.ui.byokLabelAria")}
                  value={byokLabel}
                  onChange={(e) => setByokLabel(e.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs"
                />
                <input
                  type="text"
                  placeholder={t(locale, "agent.ui.byokModelPlaceholder")}
                  aria-label={t(locale, "agent.ui.byokModelAria")}
                  value={byokModel}
                  onChange={(e) => setByokModel(e.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs"
                />
                <input
                  type="password"
                  placeholder={t(locale, "agent.ui.byokKeyPlaceholder")}
                  aria-label={t(locale, "agent.ui.byokKeyAria")}
                  value={byokKey}
                  onChange={(e) => setByokKey(e.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs"
                />
                <button
                  type="submit"
                  disabled={!isAuthenticated || !isOnline || !byokKey.trim()}
                  className="w-full rounded-lg bg-zinc-800 py-1.5 font-medium text-zinc-100 hover:bg-zinc-700 disabled:opacity-50"
                >
                  {t(locale, "agent.ui.byokSave")}
                </button>
              </form>

              {settingsMsg && (
                <p className="text-[11px] text-emerald-300">{settingsMsg}</p>
              )}

              {connections.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase text-zinc-400">
                    {t(locale, "agent.ui.activeConnections")}
                  </p>
                  {connections.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5"
                    >
                      <div>
                        <p className="font-medium">{c.label}</p>
                        <p className="text-[10px] text-zinc-400">
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
                        className="text-zinc-500 hover:text-rose-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Always-visible Floating Trigger Button */}
      <button
        type="button"
        data-testid="agent-floating-trigger"
        aria-label={t(locale, "agent.ui.triggerAria")}
        onClick={() => setOpen((v) => !v)}
        className="flex h-14 items-center gap-2 rounded-full bg-emerald-500 px-5 font-semibold text-zinc-950 shadow-lg shadow-emerald-500/25 transition hover:scale-105 hover:bg-emerald-400"
      >
        <Bot className="h-5 w-5" />
        <span className="text-sm">{t(locale, "agent.ui.triggerButton")}</span>
      </button>
    </div>
  );
}
