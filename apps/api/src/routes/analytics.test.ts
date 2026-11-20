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
  type CategoriesRepository,
  CategoriesService,
  registerCategoryCommandHandlers,
  type StoredCategory,
} from "../categories/service.js";
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

const FX_SNAPSHOT: FxRateSnapshot = {
  pivotCurrency: "EUR",
  rateDate: "2026-11-20",
  provider: "frankfurter",
  fetchedAt: "2026-11-20T05:00:00.000Z",
  rates: {
    USD: "1.1",
  },
};

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

  const catStore = new Map<string, StoredCategory>();
  const catRepo: CategoriesRepository = {
    async listByUser(userId, scope) {
      return [...catStore.values()].filter(
        (c) =>
          c.userId === userId &&
          c.deletedAt === null &&
          (!scope || c.scope === scope),
      );
    },
    async countAllByUser(userId) {
      return [...catStore.values()].filter((c) => c.userId === userId).length;
    },
    async findById(userId, categoryId, includeDeleted = false) {
      const c = catStore.get(categoryId);
      if (!c || c.userId !== userId) return null;
      if (!includeDeleted && c.deletedAt !== null) return null;
      return c;
    },
    async insertMany(items) {
      for (const item of items) catStore.set(item.id, item);
    },
    async upsert(item) {
      catStore.set(item.id, item);
    },
    async setDeletedAt(userId, categoryId, deletedAt) {
      const c = catStore.get(categoryId);
      if (!c || c.userId !== userId) return null;
      const updated: StoredCategory = {
        ...c,
        deletedAt,
        updatedAt: new Date(),
      };
      catStore.set(categoryId, updated);
      return updated;
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
    async listByUser(userId, filters) {
      return [...txStore.values()]
        .filter((tx) => {
          if (tx.userId !== userId || tx.deletedAt !== null) return false;
          if (filters.fromDate && tx.localDate < filters.fromDate) return false;
          if (filters.toDate && tx.localDate > filters.toDate) return false;
          return true;
        })
        .slice(0, filters.limit);
    },
  };

  const fxRateReader = { getLatestSnapshot: async () => FX_SNAPSHOT };
  const authService = new AuthService({ repository: authRepo });
  const commandBus = new CommandBus({ repository: cmdRepo });
  const accountsService = new AccountsService({ repository: accRepo });
  const categoriesService = new CategoriesService({ repository: catRepo });
  const transactionsService = new TransactionsService({
    repository: txRepo,
    accountsRepository: accRepo,
    getUserPreferences: (userId) => authService.getUserPreferences(userId),
    fxRateReader,
  });

  registerAccountCommandHandlers(commandBus, accountsService);
  registerCategoryCommandHandlers(commandBus, categoriesService);
  registerTransactionCommandHandlers(commandBus, transactionsService);

  return {
    fxRateReader,
    authService,
    commandBus,
    accountsService,
    categoriesService,
    transactionsService,
  };
}

function cookiePair(setCookie: string | string[] | undefined): string {
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return raw?.split(";")[0] ?? "";
}

describe("Analytics REST route (GET /api/v1/analytics/summary)", () => {
  it("requires authentication, computes multicurrency period analytics & savings rate, and isolates tenants", async () => {
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
        (
          await app.inject({
            method: "GET",
            url: "/api/v1/analytics/summary?period=monthly",
          })
        ).statusCode,
      ).toBe(401);

      const regA = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: {
          email: "ana-a@example.com",
          password: "correct-horse-battery-staple",
        },
      });
      const cookieA = cookiePair(regA.headers["set-cookie"]);

      const regB = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: {
          email: "ana-b@example.com",
          password: "correct-horse-battery-staple",
        },
      });
      const cookieB = cookiePair(regB.headers["set-cookie"]);

      const eurAccId = "50000000-0000-4000-8000-000000000001";
      const usdAccId = "50000000-0000-4000-8000-000000000002";

      await app.inject({
        method: "POST",
        url: "/api/v1/commands/batch",
        headers: { cookie: cookieA },
        payload: {
          commands: [
            {
              commandId: "51000000-0000-4000-8000-000000000001",
              actor: "manual",
              issuedAtUtc: "2026-11-20T05:00:00.000Z",
              type: "account.create",
              payload: {
                accountId: eurAccId,
                name: "Banco EUR",
                accountType: "bank",
                currency: "EUR",
                initialBalance: "0",
              },
            },
            {
              commandId: "51000000-0000-4000-8000-000000000002",
              actor: "manual",
              issuedAtUtc: "2026-11-20T05:01:00.000Z",
              type: "account.create",
              payload: {
                accountId: usdAccId,
                name: "Cuenta USD",
                accountType: "bank",
                currency: "USD",
                initialBalance: "500",
              },
            },
            {
              commandId: "51000000-0000-4000-8000-000000000003",
              actor: "manual",
              issuedAtUtc: "2026-11-20T05:02:00.000Z",
              type: "transaction.record",
              payload: {
                kind: "income",
                accountId: eurAccId,
                amount: "2000",
                currency: "EUR",
                description: "Nómina",
                occurredAtUtc: "2026-11-10T10:00:00.000Z",
                source: "manual",
              },
            },
            {
              commandId: "51000000-0000-4000-8000-000000000004",
              actor: "manual",
              issuedAtUtc: "2026-11-20T05:03:00.000Z",
              type: "transaction.record",
              payload: {
                kind: "expense",
                accountId: usdAccId,
                amount: "550",
                currency: "USD",
                description: "Viaje USD",
                occurredAtUtc: "2026-11-12T10:00:00.000Z",
                source: "manual",
              },
            },
            {
              commandId: "51000000-0000-4000-8000-000000000005",
              actor: "manual",
              issuedAtUtc: "2026-11-20T05:04:00.000Z",
              type: "transaction.transfer",
              payload: {
                fromAccountId: eurAccId,
                toAccountId: usdAccId,
                amount: "100",
                currency: "EUR",
                destinationAmount: "110",
                occurredAtUtc: "2026-11-15T10:00:00.000Z",
              },
            },
          ],
        },
      });

      const resA = await app.inject({
        method: "GET",
        url: "/api/v1/analytics/summary?period=monthly&referenceDate=2026-11-20",
        headers: { cookie: cookieA },
      });
      expect(resA.statusCode).toBe(200);
      const bodyA = resA.json();
      // Income 2000 EUR, Expense 550 USD = 500 EUR, Transfer ignored -> Net 1500 EUR, Savings rate 75%
      expect(bodyA.totalIncome).toBe("2000");
      expect(bodyA.totalExpense).toBe("500");
      expect(bodyA.netSavings).toBe("1500");
      expect(bodyA.savingsRatePercent).toBe("75");

      // Tenant isolation: User B has 0 income & 0 expense
      const resB = await app.inject({
        method: "GET",
        url: "/api/v1/analytics/summary?period=monthly&referenceDate=2026-11-20",
        headers: { cookie: cookieB },
      });
      expect(resB.statusCode).toBe(200);
      expect(resB.json().totalIncome).toBe("0");
      expect(resB.json().totalExpense).toBe("0");
    } finally {
      await app.close();
    }
  });
});
