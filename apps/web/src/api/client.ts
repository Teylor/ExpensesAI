import type {
  CommandEnvelope,
  FxRateSnapshot,
  UpdateUserPreferencesInput,
  UserPreferences,
} from "@agenticf/domain";
import type {
  AgenticfOfflineDb,
  LocalAccount,
  LocalCategory,
  LocalInvestment,
  LocalNetWorthItem,
  LocalRecurringRule,
  LocalTransaction,
} from "../offline/db.js";
import {
  type OutboxBatchAck,
  OutboxPermanentError,
  OutboxTransientError,
  type OutboxTransport,
} from "../offline/outbox.js";

export interface PublicUserDto {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
}

export interface AuthMeResponse {
  user: PublicUserDto;
  preferences: UserPreferences;
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as {
      message?: string;
      error?: string;
    };
    return data.message ?? data.error ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

export function createHttpOutboxTransport(baseUrl = ""): OutboxTransport {
  return {
    async sendBatch(
      commands: readonly CommandEnvelope[],
    ): Promise<OutboxBatchAck[]> {
      let response: Response;
      try {
        response = await fetch(`${baseUrl}/api/v1/commands/batch`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commands }),
        });
      } catch (error) {
        throw new OutboxTransientError(
          error instanceof Error ? error.message : "Network error",
        );
      }

      if (response.ok) {
        const body = (await response.json()) as {
          results: Array<{
            commandId: string;
            status: "applied" | "duplicate";
          }>;
        };
        return body.results;
      }

      const msg = await parseErrorMessage(response);
      if (
        response.status >= 400 &&
        response.status < 500 &&
        response.status !== 401 &&
        response.status !== 429
      ) {
        throw new OutboxPermanentError(msg);
      }
      throw new OutboxTransientError(msg);
    },

    async undoCommand(commandId: string): Promise<void> {
      const response = await fetch(
        `${baseUrl}/api/v1/commands/${commandId}/undo`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      if (!response.ok) {
        throw new Error(await parseErrorMessage(response));
      }
    },
  };
}

export interface CommandHistoryItemDto {
  commandId: string;
  actor: "manual" | "agent" | "system";
  commandType: string;
  createdAt: string;
  undoneAt: string | null;
  canUndo: boolean;
  payload: Record<string, unknown>;
  result: Record<string, unknown>;
}

export async function fetchCommandHistory(
  limit = 50,
  baseUrl = "",
): Promise<CommandHistoryItemDto[] | null> {
  try {
    const clamped = Math.min(100, Math.max(1, Math.trunc(limit)));
    const res = await fetch(
      `${baseUrl}/api/v1/commands/history?limit=${encodeURIComponent(
        String(clamped),
      )}`,
      { credentials: "include" },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { items: CommandHistoryItemDto[] };
    return data.items;
  } catch {
    return null;
  }
}

export async function fetchCurrentUser(
  baseUrl = "",
): Promise<AuthMeResponse | null> {
  try {
    const res = await fetch(`${baseUrl}/api/v1/auth/me`, {
      credentials: "include",
    });
    if (!res.ok) return null;
    return (await res.json()) as AuthMeResponse;
  } catch {
    return null;
  }
}

export async function loginWithEmail(
  email: string,
  password: string,
  baseUrl = "",
): Promise<AuthMeResponse> {
  const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
  return (await res.json()) as AuthMeResponse;
}

export async function registerWithEmail(
  email: string,
  password: string,
  displayName?: string,
  baseUrl = "",
): Promise<AuthMeResponse> {
  const res = await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      ...(displayName?.trim() ? { displayName: displayName.trim() } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
  return (await res.json()) as AuthMeResponse;
}

export async function logoutSession(baseUrl = ""): Promise<void> {
  try {
    await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
  } catch {
    // Allow local logout even if offline
  }
}

export async function patchUserPreferences(
  patch: UpdateUserPreferencesInput,
  baseUrl = "",
): Promise<UserPreferences | null> {
  try {
    const res = await fetch(`${baseUrl}/api/v1/preferences`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { preferences: UserPreferences };
    return data.preferences;
  } catch {
    return null;
  }
}

export async function hydrateOfflineDbFromServer(
  db: AgenticfOfflineDb,
  baseUrl = "",
): Promise<void> {
  const nowIso = new Date().toISOString();

  const [accRes, catRes, txRes, recRes, invRes, nwRes, fxRes] =
    await Promise.allSettled([
      fetch(`${baseUrl}/api/v1/accounts?includeArchived=true`, {
        credentials: "include",
      }),
      fetch(`${baseUrl}/api/v1/categories`, { credentials: "include" }),
      fetch(`${baseUrl}/api/v1/transactions?limit=200`, {
        credentials: "include",
      }),
      fetch(`${baseUrl}/api/v1/recurring`, { credentials: "include" }),
      fetch(`${baseUrl}/api/v1/investments`, { credentials: "include" }),
      fetch(`${baseUrl}/api/v1/networth`, { credentials: "include" }),
      fetch(`${baseUrl}/api/v1/fx/latest`, { credentials: "include" }),
    ]);

  if (accRes.status === "fulfilled" && accRes.value.ok) {
    const body = (await accRes.value.json()) as {
      accounts: Array<{
        id: string;
        name: string;
        accountType: LocalAccount["accountType"];
        currency: string;
        balance: string;
        isArchived: boolean;
      }>;
    };
    await db.accounts.bulkPut(
      body.accounts.map((a) => ({
        id: a.id,
        name: a.name,
        accountType: a.accountType,
        currency: a.currency,
        balance: a.balance,
        isArchived: a.isArchived,
        updatedAt: nowIso,
      })),
    );
  }

  if (catRes.status === "fulfilled" && catRes.value.ok) {
    const body = (await catRes.value.json()) as {
      categories: Array<{
        id: string;
        scope: LocalCategory["scope"];
        name: string;
        icon: string | null;
        color: string | null;
        updatedAt: string;
      }>;
    };
    await db.categories.bulkPut(
      body.categories.map((c) => ({
        id: c.id,
        scope: c.scope,
        name: c.name,
        icon: c.icon,
        color: c.color,
        deletedAt: null,
        updatedAt: c.updatedAt,
      })),
    );
  }

  if (txRes.status === "fulfilled" && txRes.value.ok) {
    const body = (await txRes.value.json()) as {
      transactions: Array<Omit<LocalTransaction, "deletedAt">>;
    };
    await db.transactions.bulkPut(
      body.transactions.map((tx) => ({
        ...tx,
        deletedAt: null,
      })),
    );
  }

  if (recRes.status === "fulfilled" && recRes.value.ok) {
    const body = (await recRes.value.json()) as {
      rules: Array<Omit<LocalRecurringRule, "deletedAt">>;
    };
    await db.recurringRules.bulkPut(
      body.rules.map((r) => ({
        ...r,
        deletedAt: null,
      })),
    );
  }

  if (invRes.status === "fulfilled" && invRes.value.ok) {
    const body = (await invRes.value.json()) as {
      items: Array<Omit<LocalInvestment, "deletedAt" | "updatedAt">>;
    };
    await db.investments.bulkPut(
      body.items.map((i) => ({
        ...i,
        deletedAt: null,
        updatedAt: nowIso,
      })),
    );
  }

  if (nwRes.status === "fulfilled" && nwRes.value.ok) {
    const body = (await nwRes.value.json()) as {
      items: Array<Omit<LocalNetWorthItem, "deletedAt" | "updatedAt">>;
    };
    await db.netWorthItems.bulkPut(
      body.items.map((i) => ({
        ...i,
        deletedAt: null,
        updatedAt: nowIso,
      })),
    );
  }

  if (fxRes.status === "fulfilled" && fxRes.value.ok) {
    const snapshot = (await fxRes.value.json()) as FxRateSnapshot;
    await db.saveFxSnapshot(snapshot);
  }
}

export async function runDueRecurringRulesRemote(
  baseUrl = "",
): Promise<{ triggeredCount: number } | null> {
  try {
    const res = await fetch(`${baseUrl}/api/v1/recurring/run-due`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) return null;
    return (await res.json()) as { triggeredCount: number };
  } catch {
    return null;
  }
}

export interface AiConnectionDto {
  id: string;
  kind: "chatgpt_oauth" | "byok";
  provider: "openai" | "anthropic" | "openai_compatible";
  label: string;
  model: string;
  baseUrl: string | null;
  maskedPreview: string;
  priority: number;
  isActive: boolean;
}

export interface AgentChatApiResponse {
  status:
    | "answered"
    | "confirmation_required"
    | "executed"
    | "rejected_guardrail"
    | "quota_exhausted";
  replyText: string;
  usedConnectionKind: "chatgpt_oauth" | "byok" | null;
  proposedCommand?: CommandEnvelope;
  executedCommandId?: string;
  impact?: {
    summary: string;
  };
}

export async function fetchAiConnections(
  baseUrl = "",
): Promise<AiConnectionDto[]> {
  try {
    const res = await fetch(`${baseUrl}/api/v1/ai/connections`, {
      credentials: "include",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { connections: AiConnectionDto[] };
    return data.connections;
  } catch {
    return [];
  }
}

export async function createByokConnection(
  input: {
    provider: "openai" | "anthropic" | "openai_compatible";
    label: string;
    model: string;
    apiKey: string;
    baseUrl?: string;
  },
  baseUrl = "",
): Promise<AiConnectionDto> {
  const res = await fetch(`${baseUrl}/api/v1/ai/connections/byok`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  const data = (await res.json()) as { connection: AiConnectionDto };
  return data.connection;
}

export async function deleteAiConnection(
  connectionId: string,
  baseUrl = "",
): Promise<void> {
  await fetch(`${baseUrl}/api/v1/ai/connections/${connectionId}`, {
    method: "DELETE",
    credentials: "include",
  });
}

export async function startChatGptOAuthFlow(
  baseUrl = "",
): Promise<{ authorizationUrl: string; state: string }> {
  const res = await fetch(`${baseUrl}/api/v1/ai/oauth/chatgpt/start`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  return (await res.json()) as { authorizationUrl: string; state: string };
}

export async function completeChatGptOAuthCallback(
  state: string,
  code: string,
  baseUrl = "",
): Promise<{
  user?: PublicUserDto;
  preferences?: UserPreferences;
}> {
  const res = await fetch(`${baseUrl}/api/v1/ai/oauth/chatgpt/callback`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state, code }),
  });
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  return (await res.json()) as {
    user?: PublicUserDto;
    preferences?: UserPreferences;
  };
}

export async function sendAgentChatRemote(
  message: string,
  baseUrl = "",
): Promise<AgentChatApiResponse | null> {
  try {
    const res = await fetch(`${baseUrl}/api/v1/ai/agent/chat`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    if (!res.ok) return null;
    return (await res.json()) as AgentChatApiResponse;
  } catch {
    return null;
  }
}
