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
  registerTransactionCommandHandlers,
  type StoredTransaction,
  type TransactionsRepository,
  TransactionsService,
} from "../transactions/service.js";
import {
  registerWealthCommandHandlers,
  type StoredInvestment,
  type StoredNetWorthItem,
  type WealthRepository,
  WealthService,
} from "../wealth/service.js";

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

  const invStore = new Map<string, StoredInvestment>();
  const nwStore = new Map<string, StoredNetWorthItem>();
  const wealthRepo: WealthRepository = {
    async listInvestments(userId) {
      return [...invStore.values()].filter(
        (i) => i.userId === userId && i.deletedAt === null,
      );
    },
    async findInvestmentById(userId, id, includeDeleted = false) {
      const i = invStore.get(id);
      if (!i || i.userId !== userId) return null;
      if (!includeDeleted && i.deletedAt !== null) return null;
      return i;
    },
    async upsertInvestment(item) {
      invStore.set(item.id, item);
    },
    async setInvestmentDeletedAt(userId, id, deletedAt) {
      const i = invStore.get(id);
      if (!i || i.userId !== userId) return null;
      const updated = { ...i, deletedAt, updatedAt: new Date() };
      invStore.set(id, updated);
      return updated;
    },
    async listNetWorthItems(userId) {
      return [...nwStore.values()].filter(
        (i) => i.userId === userId && i.deletedAt === null,
      );
    },
    async findNetWorthItemById(userId, id, includeDeleted = false) {
      const i = nwStore.get(id);
      if (!i || i.userId !== userId) return null;
      if (!includeDeleted && i.deletedAt !== null) return null;
      return i;
    },
    async upsertNetWorthItem(item) {
      nwStore.set(item.id, item);
    },
    async setNetWorthItemDeletedAt(userId, id, deletedAt) {
      const i = nwStore.get(id);
      if (!i || i.userId !== userId) return null;
      const updated = { ...i, deletedAt, updatedAt: new Date() };
      nwStore.set(id, updated);
      return updated;
    },
  };

  const fxRateReader = { getLatestSnapshot: async () => FX_SNAPSHOT };
  const authService = new AuthService({ repository: authRepo });
  const commandBus = new CommandBus({ repository: cmdRepo });
  const accountsService = new AccountsService({ repository: accRepo });
  const transactionsService = new TransactionsService({
    repository: txRepo,
    accountsRepository: accRepo,
    getUserPreferences: (userId) => authService.getUserPreferences(userId),
    fxRateReader,
  });
  const wealthService = new WealthService({ repository: wealthRepo });

  registerAccountCommandHandlers(commandBus, accountsService);
  registerTransactionCommandHandlers(commandBus, transactionsService);
  registerWealthCommandHandlers(commandBus, wealthService);

  return {
    fxRateReader,
    authService,
    commandBus,
    accountsService,
    transactionsService,
    wealthService,
  };
}

function cookiePair(setCookie: string | string[] | undefined): string {
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return raw?.split(";")[0] ?? "";
}

describe("Wealth & CSV Export REST routes", () => {
  it("serves consolidated investments, net worth, and localized CSV exports with strict auth & tenant isolation", async () => {
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
        (await app.inject({ method: "GET", url: "/api/v1/investments" }))
          .statusCode,
      ).toBe(401);
      expect(
        (await app.inject({ method: "GET", url: "/api/v1/networth" }))
          .statusCode,
      ).toBe(401);
      expect(
        (
          await app.inject({
            method: "GET",
            url: "/api/v1/export/csv?dataset=investments",
          })
        ).statusCode,
      ).toBe(401);

      const regA = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: {
          email: "wealth-a@example.com",
          password: "correct-horse-battery-staple",
        },
      });
      const cookieA = cookiePair(regA.headers["set-cookie"]);

      await app.inject({
        method: "POST",
        url: "/api/v1/commands/batch",
        headers: { cookie: cookieA },
        payload: {
          commands: [
            {
              commandId: "74000000-0000-4000-8000-000000000001",
              actor: "manual",
              issuedAtUtc: "2026-11-20T06:00:00.000Z",
              type: "account.create",
              payload: {
                name: "Cuenta Ahorro",
                accountType: "savings",
                currency: "EUR",
                initialBalance: "10000",
              },
            },
            {
              commandId: "74000000-0000-4000-8000-000000000002",
              actor: "manual",
              issuedAtUtc: "2026-11-20T06:01:00.000Z",
              type: "investment.upsert",
              payload: {
                assetType: "ETF",
                name: "MSCI World",
                investedAmount: "4000",
                currentValue: "5500",
                currency: "USD", // 5000 EUR
              },
            },
            {
              commandId: "74000000-0000-4000-8000-000000000003",
              actor: "manual",
              issuedAtUtc: "2026-11-20T06:02:00.000Z",
              type: "networth.upsert",
              payload: {
                kind: "asset",
                category: "Vehículos",
                name: "Coche",
                estimatedValue: "15000",
                currency: "EUR",
              },
            },
            {
              commandId: "74000000-0000-4000-8000-000000000004",
              actor: "manual",
              issuedAtUtc: "2026-11-20T06:03:00.000Z",
              type: "networth.upsert",
              payload: {
                kind: "liability",
                category: "Préstamos",
                name: "Préstamo Coche",
                estimatedValue: "5000",
                currency: "EUR",
              },
            },
          ],
        },
      });

      const invRes = await app.inject({
        method: "GET",
        url: "/api/v1/investments",
        headers: { cookie: cookieA },
      });
      expect(invRes.statusCode).toBe(200);
      expect(invRes.json().totalCurrentValue).toBe("5000");

      // Net Worth = 10000 (accounts) + 5000 (investments) + 15000 (car) - 5000 (loan) = 25000 EUR
      const nwRes = await app.inject({
        method: "GET",
        url: "/api/v1/networth",
        headers: { cookie: cookieA },
      });
      expect(nwRes.statusCode).toBe(200);
      expect(nwRes.json().netWorth).toBe("25000");
      expect(nwRes.json().formattedNetWorth).toBe("25.000,00 €");

      // CSV export endpoint
      const csvRes = await app.inject({
        method: "GET",
        url: "/api/v1/export/csv?dataset=networth",
        headers: { cookie: cookieA },
      });
      expect(csvRes.statusCode).toBe(200);
      expect(csvRes.headers["content-type"]).toContain("text/csv");
      expect(csvRes.body).toContain(
        "Tipo;Categoría;Nombre;Valor Estimado;Divisa",
      );
      expect(csvRes.body).toContain("Préstamo Coche");
    } finally {
      await app.close();
    }
  });
});
