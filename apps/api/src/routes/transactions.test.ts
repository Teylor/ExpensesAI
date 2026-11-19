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
  rateDate: "2026-11-19",
  provider: "frankfurter",
  fetchedAt: "2026-11-19T16:30:00.000Z",
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
      for (const item of items) {
        catStore.set(item.id, item);
      }
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
          if (
            filters.accountId &&
            tx.accountId !== filters.accountId &&
            tx.destinationAccountId !== filters.accountId
          ) {
            return false;
          }
          if (filters.kind && tx.kind !== filters.kind) return false;
          if (filters.categoryId && tx.categoryId !== filters.categoryId) {
            return false;
          }
          if (filters.fromDate && tx.localDate < filters.fromDate) return false;
          if (filters.toDate && tx.localDate > filters.toDate) return false;
          return true;
        })
        .sort((a, b) => b.occurredAtUtc.getTime() - a.occurredAtUtc.getTime())
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

describe("Categories & Transactions REST routes integrated with CommandBus, FX, and Undo", () => {
  it("requires authentication, seeds editable categories on register without 'other', and supports delete + undo", async () => {
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
        (await app.inject({ method: "GET", url: "/api/v1/categories" }))
          .statusCode,
      ).toBe(401);
      expect(
        (await app.inject({ method: "GET", url: "/api/v1/transactions" }))
          .statusCode,
      ).toBe(401);

      const regA = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: {
          email: "cat-a@example.com",
          password: "correct-horse-battery-staple",
        },
      });
      expect(regA.statusCode).toBe(201);
      const cookieA = cookiePair(regA.headers["set-cookie"]);

      const allCats = await app.inject({
        method: "GET",
        url: "/api/v1/categories",
        headers: { cookie: cookieA },
      });
      expect(allCats.statusCode).toBe(200);
      const allItems = allCats.json().categories as Array<{
        id: string;
        scope: string;
        name: string;
      }>;
      expect(allItems.length).toBeGreaterThan(10);
      expect(
        allItems.some(
          (c) =>
            c.name.toLowerCase() === "otros" ||
            c.name.toLowerCase() === "other",
        ),
      ).toBe(false);

      const invCats = await app.inject({
        method: "GET",
        url: "/api/v1/categories?scope=investment",
        headers: { cookie: cookieA },
      });
      expect(invCats.statusCode).toBe(200);
      const invItems = invCats.json().categories as Array<{
        id: string;
        scope: string;
        name: string;
      }>;
      const etf = invItems.find((c) => c.name === "ETF");
      expect(etf).toBeDefined();

      // Delete ETF via CommandBus
      const deleteCmdId = "20000000-0000-4000-8000-000000000001";
      const delRes = await app.inject({
        method: "POST",
        url: "/api/v1/commands",
        headers: { cookie: cookieA },
        payload: {
          commandId: deleteCmdId,
          actor: "manual",
          issuedAtUtc: "2026-11-19T21:00:00.000Z",
          type: "category.delete",
          payload: { categoryId: etf?.id },
        },
      });
      expect(delRes.statusCode).toBe(201);

      const afterDelete = await app.inject({
        method: "GET",
        url: "/api/v1/categories?scope=investment",
        headers: { cookie: cookieA },
      });
      expect(
        (afterDelete.json().categories as Array<{ name: string }>).some(
          (c) => c.name === "ETF",
        ),
      ).toBe(false);

      // Undo restores ETF
      const undoRes = await app.inject({
        method: "POST",
        url: `/api/v1/commands/${deleteCmdId}/undo`,
        headers: { cookie: cookieA },
      });
      expect(undoRes.statusCode).toBe(200);

      const afterUndo = await app.inject({
        method: "GET",
        url: "/api/v1/categories?scope=investment",
        headers: { cookie: cookieA },
      });
      expect(
        (afterUndo.json().categories as Array<{ name: string }>).some(
          (c) => c.name === "ETF",
        ),
      ).toBe(true);
    } finally {
      await app.close();
    }
  });

  it("lists filtered multicurrency transactions, updates balances, maps domain errors, and isolates tenants", async () => {
    const wiring = createTestWiring();
    const app = await buildApp({
      corsOrigin: "http://localhost:5173",
      logLevel: "silent",
      checkDatabase: async () => true,
      ...wiring,
      secureCookies: false,
    });

    try {
      const regA = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: {
          email: "tx-a@example.com",
          password: "correct-horse-battery-staple",
        },
      });
      const cookieA = cookiePair(regA.headers["set-cookie"]);

      const regB = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: {
          email: "tx-b@example.com",
          password: "correct-horse-battery-staple",
        },
      });
      const cookieB = cookiePair(regB.headers["set-cookie"]);

      const eurAccId = "30000000-0000-4000-8000-000000000001";
      const usdAccId = "30000000-0000-4000-8000-000000000002";

      await app.inject({
        method: "POST",
        url: "/api/v1/commands/batch",
        headers: { cookie: cookieA },
        payload: {
          commands: [
            {
              commandId: "31000000-0000-4000-8000-000000000001",
              actor: "manual",
              issuedAtUtc: "2026-11-19T10:00:00.000Z",
              type: "account.create",
              payload: {
                accountId: eurAccId,
                name: "Banco EUR",
                accountType: "bank",
                currency: "EUR",
                initialBalance: "3000",
              },
            },
            {
              commandId: "31000000-0000-4000-8000-000000000002",
              actor: "manual",
              issuedAtUtc: "2026-11-19T10:01:00.000Z",
              type: "account.create",
              payload: {
                accountId: usdAccId,
                name: "Cuenta USD",
                accountType: "bank",
                currency: "USD",
                initialBalance: "1000",
              },
            },
          ],
        },
      });

      const incomeCmdId = "31000000-0000-4000-8000-000000000003";
      const usdExpenseCmdId = "31000000-0000-4000-8000-000000000004";
      const transferCmdId = "31000000-0000-4000-8000-000000000005";

      const batchRes = await app.inject({
        method: "POST",
        url: "/api/v1/commands/batch",
        headers: { cookie: cookieA },
        payload: {
          commands: [
            {
              commandId: incomeCmdId,
              actor: "agent",
              issuedAtUtc: "2026-11-19T11:00:00.000Z",
              type: "transaction.record",
              payload: {
                kind: "income",
                accountId: eurAccId,
                amount: "2000",
                currency: "EUR",
                description: "Trabajo X",
                clientOrPayee: "Empresa Y",
                occurredAtUtc: "2026-11-19T11:00:00.000Z",
                source: "agent",
              },
            },
            {
              commandId: usdExpenseCmdId,
              actor: "manual",
              issuedAtUtc: "2026-11-19T12:00:00.000Z",
              type: "transaction.record",
              payload: {
                kind: "expense",
                accountId: usdAccId,
                amount: "110",
                currency: "USD",
                description: "Software SaaS",
                occurredAtUtc: "2026-11-19T12:00:00.000Z",
                source: "manual",
              },
            },
            {
              commandId: transferCmdId,
              actor: "manual",
              issuedAtUtc: "2026-11-19T13:00:00.000Z",
              type: "transaction.transfer",
              payload: {
                fromAccountId: eurAccId,
                toAccountId: usdAccId,
                amount: "500",
                currency: "EUR",
                destinationAmount: "550",
                occurredAtUtc: "2026-11-19T13:00:00.000Z",
              },
            },
          ],
        },
      });
      expect(batchRes.statusCode).toBe(200);

      // List all transactions for A
      const listAll = await app.inject({
        method: "GET",
        url: "/api/v1/transactions",
        headers: { cookie: cookieA },
      });
      expect(listAll.statusCode).toBe(200);
      const txs = listAll.json().transactions as Array<{
        id: string;
        kind: string;
        currency: string;
        formattedAmount: string;
      }>;
      expect(txs).toHaveLength(3);

      // Filter by kind=expense -> USD expense formatted with parenthesized EUR equivalent
      const expensesRes = await app.inject({
        method: "GET",
        url: "/api/v1/transactions?kind=expense",
        headers: { cookie: cookieA },
      });
      expect(expensesRes.statusCode).toBe(200);
      const expenses = expensesRes.json().transactions as Array<{
        formattedAmount: string;
      }>;
      expect(expenses).toHaveLength(1);
      expect(expenses[0]?.formattedAmount).toBe("110,00 $ (100,00 €)");

      // Tenant isolation: User B sees 0 transactions
      const listB = await app.inject({
        method: "GET",
        url: "/api/v1/transactions",
        headers: { cookie: cookieB },
      });
      expect(listB.statusCode).toBe(200);
      expect(listB.json().transactions).toHaveLength(0);

      // Error mapping: currency mismatch -> 400
      const mismatchRes = await app.inject({
        method: "POST",
        url: "/api/v1/commands",
        headers: { cookie: cookieA },
        payload: {
          commandId: "31000000-0000-4000-8000-000000000006",
          actor: "manual",
          issuedAtUtc: "2026-11-19T14:00:00.000Z",
          type: "transaction.record",
          payload: {
            kind: "expense",
            accountId: eurAccId,
            amount: "50",
            currency: "USD",
            description: "Wrong currency",
            source: "manual",
          },
        },
      });
      expect(mismatchRes.statusCode).toBe(400);
      expect(mismatchRes.json().error).toBe("ACCOUNT_CURRENCY_MISMATCH");

      // Error mapping: unknown category -> 404
      const missingCatRes = await app.inject({
        method: "POST",
        url: "/api/v1/commands",
        headers: { cookie: cookieA },
        payload: {
          commandId: "31000000-0000-4000-8000-000000000007",
          actor: "manual",
          issuedAtUtc: "2026-11-19T14:01:00.000Z",
          type: "category.delete",
          payload: {
            categoryId: "99999999-9999-4999-8999-999999999999",
          },
        },
      });
      expect(missingCatRes.statusCode).toBe(404);
      expect(missingCatRes.json().error).toBe("CATEGORY_NOT_FOUND");

      // Error mapping: unknown transaction -> 404
      const missingTxRes = await app.inject({
        method: "POST",
        url: "/api/v1/commands",
        headers: { cookie: cookieA },
        payload: {
          commandId: "31000000-0000-4000-8000-000000000008",
          actor: "manual",
          issuedAtUtc: "2026-11-19T14:02:00.000Z",
          type: "transaction.delete",
          payload: {
            transactionId: "99999999-9999-4999-8999-999999999999",
          },
        },
      });
      expect(missingTxRes.statusCode).toBe(404);
      expect(missingTxRes.json().error).toBe("TRANSACTION_NOT_FOUND");

      // Undo USD expense -> balance reverts from 1440 (1000 - 110 + 550) to 1550
      await app.inject({
        method: "POST",
        url: `/api/v1/commands/${usdExpenseCmdId}/undo`,
        headers: { cookie: cookieA },
      });

      const usdAccAfterUndo = await app.inject({
        method: "GET",
        url: `/api/v1/accounts/${usdAccId}`,
        headers: { cookie: cookieA },
      });
      expect(usdAccAfterUndo.json().account.balance).toBe("1550");
    } finally {
      await app.close();
    }
  });
});
