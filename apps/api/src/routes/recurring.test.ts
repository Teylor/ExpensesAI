import type { FxRateSnapshot, UserPreferences } from "@agenticf/domain";
import { describe, expect, it } from "vitest";
import {
  type AccountsRepository,
  AccountsService,
  registerAccountCommandHandlers,
  type StoredAccount,
} from "../accounts/service.js";
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
  type RecurringRepository,
  RecurringService,
  registerRecurringCommandHandlers,
  type StoredRecurringRule,
} from "../recurring/service.js";
import {
  registerTransactionCommandHandlers,
  type StoredTransaction,
  type TransactionsRepository,
  TransactionsService,
} from "../transactions/service.js";

const FX_SNAPSHOT: FxRateSnapshot = {
  pivotCurrency: "EUR",
  rateDate: "2026-11-19",
  provider: "frankfurter",
  fetchedAt: "2026-11-19T16:30:00.000Z",
  rates: {
    USD: "1.1",
  },
};

function createTestWiring() {
  const now = () => new Date("2026-11-19T10:00:00.000Z");

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
      const updated: StoredAccount = { ...a, ...patch };
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
      const updated: StoredTransaction = { ...tx, deletedAt };
      txStore.set(txId, updated);
      return updated;
    },
    async listByUser(userId) {
      return [...txStore.values()].filter(
        (tx) => tx.userId === userId && tx.deletedAt === null,
      );
    },
  };

  const ruleStore = new Map<string, StoredRecurringRule>();
  const ruleRepo: RecurringRepository = {
    async listByUser(userId) {
      return [...ruleStore.values()].filter(
        (r) => r.userId === userId && r.deletedAt === null,
      );
    },
    async listAllActive() {
      return [...ruleStore.values()].filter(
        (r) => r.isActive && r.deletedAt === null,
      );
    },
    async findById(userId, ruleId, includeDeleted = false) {
      const r = ruleStore.get(ruleId);
      if (!r || r.userId !== userId) return null;
      if (!includeDeleted && r.deletedAt !== null) return null;
      return r;
    },
    async upsert(rule) {
      ruleStore.set(rule.id, rule);
    },
    async setDeletedAt(userId, ruleId, deletedAt) {
      const r = ruleStore.get(ruleId);
      if (!r || r.userId !== userId) return null;
      const updated: StoredRecurringRule = {
        ...r,
        deletedAt,
        updatedAt: now(),
      };
      ruleStore.set(ruleId, updated);
      return updated;
    },
  };

  const fxRateReader = { getLatestSnapshot: async () => FX_SNAPSHOT };
  const authService = new AuthService({ repository: authRepo, now });
  const commandBus = new CommandBus({ repository: cmdRepo, now });
  const accountsService = new AccountsService({ repository: accRepo, now });
  const transactionsService = new TransactionsService({
    repository: txRepo,
    accountsRepository: accRepo,
    getUserPreferences: (userId) => authService.getUserPreferences(userId),
    fxRateReader,
    now,
  });
  const recurringService = new RecurringService({
    repository: ruleRepo,
    accountsRepository: accRepo,
    getUserPreferences: (userId) => authService.getUserPreferences(userId),
    commandBus,
    advisoryLock: {
      async withLock(_key, fn) {
        return { acquired: true, result: await fn() };
      },
    },
    now,
  });

  registerAccountCommandHandlers(commandBus, accountsService);
  registerTransactionCommandHandlers(commandBus, transactionsService);
  registerRecurringCommandHandlers(commandBus, recurringService);

  return {
    fxRateReader,
    authService,
    commandBus,
    accountsService,
    transactionsService,
    recurringService,
  };
}

function cookiePair(setCookie: string | string[] | undefined): string {
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return raw?.split(";")[0] ?? "";
}

describe("Recurring REST routes integrated with CommandBus, FX, and Undo", () => {
  it("lists recurring rules with multicurrency parenthesized amounts, executes due rules, and isolates tenants", async () => {
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
        (await app.inject({ method: "GET", url: "/api/v1/recurring" }))
          .statusCode,
      ).toBe(401);
      expect(
        (await app.inject({ method: "POST", url: "/api/v1/recurring/run-due" }))
          .statusCode,
      ).toBe(401);

      const regA = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: {
          email: "rec-a@example.com",
          password: "correct-horse-battery-staple",
        },
      });
      const cookieA = cookiePair(regA.headers["set-cookie"]);

      const regB = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: {
          email: "rec-b@example.com",
          password: "correct-horse-battery-staple",
        },
      });
      const cookieB = cookiePair(regB.headers["set-cookie"]);

      const usdAccId = "40000000-0000-4000-8000-000000000001";
      await app.inject({
        method: "POST",
        url: "/api/v1/commands",
        headers: { cookie: cookieA },
        payload: {
          commandId: "41000000-0000-4000-8000-000000000001",
          actor: "manual",
          issuedAtUtc: "2026-11-19T10:00:00.000Z",
          type: "account.create",
          payload: {
            accountId: usdAccId,
            name: "Tarjeta USD",
            accountType: "credit",
            currency: "USD",
            initialBalance: "500",
          },
        },
      });

      const ruleId = "42000000-0000-4000-8000-000000000001";
      const upsertRes = await app.inject({
        method: "POST",
        url: "/api/v1/commands",
        headers: { cookie: cookieA },
        payload: {
          commandId: "41000000-0000-4000-8000-000000000002",
          actor: "manual",
          issuedAtUtc: "2026-11-19T10:00:00.000Z",
          type: "recurring.upsert",
          payload: {
            ruleId,
            kind: "expense",
            accountId: usdAccId,
            amount: "22",
            currency: "USD",
            frequency: "monthly",
            dayOfMonth: 19,
            description: "Suscripción IA",
            isActive: true,
          },
        },
      });
      expect(upsertRes.statusCode).toBe(201);

      const listA = await app.inject({
        method: "GET",
        url: "/api/v1/recurring",
        headers: { cookie: cookieA },
      });
      expect(listA.statusCode).toBe(200);
      const rulesA = listA.json().rules as Array<{
        id: string;
        formattedAmount: string;
        nextDueLocalDate: string;
      }>;
      expect(rulesA).toHaveLength(1);
      expect(rulesA[0]?.formattedAmount).toBe("22,00 $ (20,00 €)");
      expect(rulesA[0]?.nextDueLocalDate).toBe("2026-11-19");

      // Tenant isolation: User B sees 0 rules
      const listB = await app.inject({
        method: "GET",
        url: "/api/v1/recurring",
        headers: { cookie: cookieB },
      });
      expect(listB.json().rules).toHaveLength(0);

      // Run due recurring rules for User A -> creates recurring transaction and updates USD balance (500 - 22 = 478)
      const runDue = await app.inject({
        method: "POST",
        url: "/api/v1/recurring/run-due",
        headers: { cookie: cookieA },
      });
      expect(runDue.statusCode).toBe(200);
      expect(runDue.json().triggeredCount).toBe(1);

      const accRes = await app.inject({
        method: "GET",
        url: `/api/v1/accounts/${usdAccId}`,
        headers: { cookie: cookieA },
      });
      expect(accRes.json().account.balance).toBe("478");

      // Error mapping: deleting unknown rule -> 404 RECURRING_RULE_NOT_FOUND
      const missingRes = await app.inject({
        method: "POST",
        url: "/api/v1/commands",
        headers: { cookie: cookieA },
        payload: {
          commandId: "41000000-0000-4000-8000-000000000003",
          actor: "manual",
          issuedAtUtc: "2026-11-19T10:05:00.000Z",
          type: "recurring.delete",
          payload: {
            ruleId: "99999999-9999-4999-8999-999999999999",
          },
        },
      });
      expect(missingRes.statusCode).toBe(404);
      expect(missingRes.json().error).toBe("RECURRING_RULE_NOT_FOUND");
    } finally {
      await app.close();
    }
  });
});
