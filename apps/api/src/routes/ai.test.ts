import type { UserPreferences } from "@agenticf/domain";
import { describe, expect, it } from "vitest";
import {
  type AccountsRepository,
  AccountsService,
  registerAccountCommandHandlers,
  type StoredAccount,
} from "../accounts/service.js";
import {
  type AiOauthStateRecord,
  type AiOauthStateRepository,
  ChatGptOAuthService,
} from "../ai/oauth.js";
import {
  AgentOrchestrator,
  type AiConnectionRecord,
  type AiConnectionsRepository,
} from "../ai/orchestrator.js";
import { SecretVault } from "../ai/vault.js";
import { buildApp } from "../app.js";
import {
  type AuthRepository,
  AuthService,
  EmailAlreadyExistsError,
  type StoredSession,
  type StoredUser,
} from "../auth/service.js";
import {
  CommandBus,
  type CommandLogEntry,
  type CommandLogRepository,
} from "../commands/bus.js";
import {
  registerTransactionCommandHandlers,
  type StoredTransaction,
  type TransactionsRepository,
  TransactionsService,
} from "../transactions/service.js";

function createTestWiring() {
  const usersById = new Map<string, StoredUser>();
  const usersByEmail = new Map<string, StoredUser>();
  const prefsByUser = new Map<string, UserPreferences>();
  const sessionsById = new Map<string, StoredSession>();

  const authRepo: AuthRepository = {
    async findUserByEmail(email) {
      return usersByEmail.get(email) ?? null;
    },
    async findUserById(userId) {
      return usersById.get(userId) ?? null;
    },
    async createUserWithPreferences(user, preferences) {
      if (usersByEmail.has(user.email)) {
        throw new EmailAlreadyExistsError(user.email);
      }
      usersById.set(user.id, user);
      usersByEmail.set(user.email, user);
      prefsByUser.set(user.id, preferences);
    },
    async getPreferences(userId) {
      return prefsByUser.get(userId) ?? null;
    },
    async upsertPreferences(userId, preferences) {
      prefsByUser.set(userId, preferences);
    },
    async createSession(session) {
      sessionsById.set(session.id, session);
    },
    async findSessionById(sessionId) {
      return sessionsById.get(sessionId) ?? null;
    },
    async deleteSessionById(sessionId) {
      sessionsById.delete(sessionId);
    },
  };

  const cmdEntries = new Map<string, CommandLogEntry>();
  const cmdRepo: CommandLogRepository = {
    async findByCommandId(userId, commandId) {
      const e = cmdEntries.get(commandId);
      return e && e.userId === userId ? e : null;
    },
    async insert(entry) {
      cmdEntries.set(entry.commandId, entry);
    },
    async markUndone(userId, commandId, undoneByCommandId, undoneAt) {
      const e = cmdEntries.get(commandId);
      if (!e || e.userId !== userId) return false;
      cmdEntries.set(commandId, { ...e, undoneAt, undoneByCommandId });
      return true;
    },
    async listByUser(userId, limit) {
      return [...cmdEntries.values()]
        .filter((e) => e.userId === userId)
        .slice(0, limit);
    },
  };

  const accStore = new Map<string, StoredAccount>();
  const accRepo: AccountsRepository = {
    async listByUser(userId, includeArchived) {
      return [...accStore.values()].filter(
        (a) => a.userId === userId && (includeArchived || !a.isArchived),
      );
    },
    async findById(userId, accountId) {
      const a = accStore.get(accountId);
      return a && a.userId === userId ? a : null;
    },
    async insert(account) {
      accStore.set(account.id, account);
    },
    async update(userId, accountId, patch) {
      const a = accStore.get(accountId);
      if (!a || a.userId !== userId) return null;
      const updated = { ...a, ...patch };
      accStore.set(accountId, updated);
      return updated;
    },
    async deleteById(userId, accountId) {
      const a = accStore.get(accountId);
      if (!a || a.userId !== userId) return false;
      accStore.delete(accountId);
      return true;
    },
  };

  const txStore = new Map<string, StoredTransaction>();
  const txRepo: TransactionsRepository = {
    async insert(tx) {
      txStore.set(tx.id, tx);
    },
    async findById(userId, txId, includeDeleted = false) {
      const tx = txStore.get(txId);
      if (!tx || tx.userId !== userId) return null;
      if (!includeDeleted && tx.deletedAt !== null) return null;
      return tx;
    },
    async setDeletedAt(userId, txId, deletedAt) {
      const tx = txStore.get(txId);
      if (!tx || tx.userId !== userId) return null;
      const updated = { ...tx, deletedAt };
      txStore.set(txId, updated);
      return updated;
    },
    async listByUser(userId) {
      return [...txStore.values()].filter(
        (tx) => tx.userId === userId && tx.deletedAt === null,
      );
    },
  };

  const connStore = new Map<string, AiConnectionRecord>();
  const aiConnectionsRepository: AiConnectionsRepository = {
    async listByUser(userId) {
      return [...connStore.values()].filter((c) => c.userId === userId);
    },
    async upsert(conn) {
      connStore.set(conn.id, conn);
    },
    async deleteById(userId, connId) {
      const c = connStore.get(connId);
      if (!c || c.userId !== userId) return false;
      connStore.delete(connId);
      return true;
    },
  };

  const oauthStateStore = new Map<string, AiOauthStateRecord>();
  const oauthRepo: AiOauthStateRepository = {
    async saveState(record) {
      oauthStateStore.set(record.stateHash, record);
    },
    async consumeState(stateHash) {
      const r = oauthStateStore.get(stateHash) ?? null;
      oauthStateStore.delete(stateHash);
      return r;
    },
  };

  const secretVault = SecretVault.fromPassphrase("routes-ai-test-key");
  const authService = new AuthService({ repository: authRepo });
  const commandBus = new CommandBus({ repository: cmdRepo });
  const accountsService = new AccountsService({ repository: accRepo });
  const transactionsService = new TransactionsService({
    repository: txRepo,
    accountsRepository: accRepo,
    getUserPreferences: (userId) => authService.getUserPreferences(userId),
  });
  const chatGptOAuthService = new ChatGptOAuthService({
    repository: oauthRepo,
    vault: secretVault,
  });
  const agentOrchestrator = new AgentOrchestrator({
    connectionsRepository: aiConnectionsRepository,
    vault: secretVault,
    accountsService,
    commandBus,
    getUserPreferences: (userId) => authService.getUserPreferences(userId),
  });

  registerAccountCommandHandlers(commandBus, accountsService);
  registerTransactionCommandHandlers(commandBus, transactionsService);

  return {
    authService,
    commandBus,
    accountsService,
    transactionsService,
    aiConnectionsRepository,
    secretVault,
    chatGptOAuthService,
    agentOrchestrator,
  };
}

function cookiePair(setCookie: string | string[] | undefined): string {
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return raw?.split(";")[0] ?? "";
}

describe("AI Connectors (ChatGPT OAuth Plan Sharing + BYOK) & Agent Chat REST routes", () => {
  it("links ChatGPT Plan Sharing OAuth, stores encrypted BYOK without exposing raw key, and enforces guardrails + impact confirmation", async () => {
    const wiring = createTestWiring();
    const app = await buildApp({
      corsOrigin: "http://localhost:5173",
      logLevel: "silent",
      checkDatabase: async () => true,
      ...wiring,
      secureCookies: false,
    });

    try {
      expect(
        (await app.inject({ method: "GET", url: "/api/v1/ai/connections" }))
          .statusCode,
      ).toBe(401);

      const regA = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: {
          email: "ai-a@example.com",
          password: "correct-horse-battery-staple",
        },
      });
      const cookieA = cookiePair(regA.headers["set-cookie"]);

      // Create bank account with 3000 EUR
      await app.inject({
        method: "POST",
        url: "/api/v1/commands",
        headers: { cookie: cookieA },
        payload: {
          commandId: "81000000-0000-4000-8000-000000000001",
          actor: "manual",
          issuedAtUtc: "2026-11-20T07:00:00.000Z",
          type: "account.create",
          payload: {
            name: "Banco Principal",
            accountType: "bank",
            currency: "EUR",
            initialBalance: "3000",
          },
        },
      });

      // Add BYOK connection -> response never exposes raw API key
      const rawApiKey = ["sk", "user", "secret", "8899"].join("-");
      const byokRes = await app.inject({
        method: "POST",
        url: "/api/v1/ai/connections/byok",
        headers: { cookie: cookieA },
        payload: {
          provider: "openai",
          label: "Mi OpenAI Key",
          model: "gpt-4o-mini",
          apiKey: rawApiKey,
        },
      });
      expect(byokRes.statusCode).toBe(201);
      expect(JSON.stringify(byokRes.json())).not.toContain(rawApiKey);
      expect(byokRes.json().connection.maskedPreview).toBe("sk-...8899");

      // Start & complete ChatGPT OAuth Plan Sharing flow
      const startOauth = await app.inject({
        method: "POST",
        url: "/api/v1/ai/oauth/chatgpt/start",
        headers: { cookie: cookieA },
      });
      expect(startOauth.statusCode).toBe(200);
      const { state, authorizationUrl } = startOauth.json();
      expect(authorizationUrl).toContain("code_challenge_method=S256");

      const callbackOauth = await app.inject({
        method: "POST",
        url: "/api/v1/ai/oauth/chatgpt/callback",
        headers: { cookie: cookieA },
        payload: { state, code: "chatgpt-code-777" },
      });
      expect(callbackOauth.statusCode).toBe(200);

      // List connections -> 2 connections (chatgpt_oauth + byok)
      const listConns = await app.inject({
        method: "GET",
        url: "/api/v1/ai/connections",
        headers: { cookie: cookieA },
      });
      expect(listConns.json().connections).toHaveLength(2);

      // Out-of-scope chat prompt rejected by guardrail
      const badChat = await app.inject({
        method: "POST",
        url: "/api/v1/ai/agent/chat",
        headers: { cookie: cookieA },
        payload: { message: "Escribe un poema sobre gatos" },
      });
      expect(badChat.statusCode).toBe(200);
      expect(badChat.json().status).toBe("rejected_guardrail");

      // Valid financial action prompt -> returns confirmation_required with exact impact summary
      const goodChat = await app.inject({
        method: "POST",
        url: "/api/v1/ai/agent/chat",
        headers: { cookie: cookieA },
        payload: {
          message: "Nuevo ingreso de 2000 EUR por Trabajo X",
        },
      });
      expect(goodChat.statusCode).toBe(200);
      expect(goodChat.json().status).toBe("confirmation_required");
      expect(goodChat.json().impact.summary).toContain(
        "3.000,00 € a 5.000,00 €",
      );

      // Direct unauthenticated Sign in with ChatGPT OAuth (creates passwordless user + issues session cookie)
      const directStart = await app.inject({
        method: "POST",
        url: "/api/v1/ai/oauth/chatgpt/start",
      });
      expect(directStart.statusCode).toBe(200);

      const directCallback = await app.inject({
        method: "POST",
        url: "/api/v1/ai/oauth/chatgpt/callback",
        payload: {
          state: directStart.json().state,
          code: "direct-oauth-code",
        },
      });
      expect(directCallback.statusCode).toBe(200);
      expect(directCallback.headers["set-cookie"]).toBeDefined();
      expect(directCallback.json().user.email).toBe(
        "chatgpt-user@agenticf.local",
      );
      expect(directCallback.json().connection.kind).toBe("chatgpt_oauth");
    } finally {
      await app.close();
    }
  });
});
