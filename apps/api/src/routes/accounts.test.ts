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
      if (usersByEmail.has(user.email))
        throw new EmailAlreadyExistsError(user.email);
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

  const authService = new AuthService({ repository: authRepo });
  const commandBus = new CommandBus({ repository: cmdRepo });
  const accountsService = new AccountsService({ repository: accRepo });
  registerAccountCommandHandlers(commandBus, accountsService);

  return { authService, commandBus, accountsService };
}

function cookiePair(setCookie: string | string[] | undefined): string {
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return raw?.split(";")[0] ?? "";
}

describe("Accounts REST routes integrated with CommandBus, FX, and Undo", () => {
  it("lists consolidated multicurrency balances, isolates tenants, and reflects archive + undo", async () => {
    const { authService, commandBus, accountsService } = createTestWiring();
    const app = await buildApp({
      corsOrigin: "http://localhost:5173",
      logLevel: "silent",
      checkDatabase: async () => true,
      fxRateReader: { getLatestSnapshot: async () => FX_SNAPSHOT },
      authService,
      commandBus,
      accountsService,
      secureCookies: false,
    });

    try {
      expect(
        (await app.inject({ method: "GET", url: "/api/v1/accounts" }))
          .statusCode,
      ).toBe(401);

      const regA = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: {
          email: "a@example.com",
          password: "correct-horse-battery-staple",
        },
      });
      const cookieA = cookiePair(regA.headers["set-cookie"]);

      const regB = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: {
          email: "b@example.com",
          password: "correct-horse-battery-staple",
        },
      });
      const cookieB = cookiePair(regB.headers["set-cookie"]);

      const amexId = "11111111-1111-4111-8111-111111111111";

      // Create 3 accounts via CommandBus
      const batch = await app.inject({
        method: "POST",
        url: "/api/v1/commands/batch",
        headers: { cookie: cookieA },
        payload: {
          commands: [
            {
              commandId: "10000000-0000-4000-8000-000000000001",
              actor: "manual",
              issuedAtUtc: "2026-11-19T21:00:00.000Z",
              type: "account.create",
              payload: {
                name: "Banco Principal",
                accountType: "bank",
                currency: "EUR",
                initialBalance: "3000",
              },
            },
            {
              commandId: "10000000-0000-4000-8000-000000000002",
              actor: "manual",
              issuedAtUtc: "2026-11-19T21:01:00.000Z",
              type: "account.create",
              payload: {
                name: "Efectivo",
                accountType: "cash",
                currency: "EUR",
                initialBalance: "250",
              },
            },
            {
              commandId: "10000000-0000-4000-8000-000000000003",
              actor: "agent",
              issuedAtUtc: "2026-11-19T21:02:00.000Z",
              type: "account.create",
              payload: {
                accountId: amexId,
                name: "American Express",
                accountType: "credit",
                currency: "USD",
                initialBalance: "2200",
              },
            },
          ],
        },
      });
      expect(batch.statusCode).toBe(200);

      // GET /api/v1/accounts -> consolidated EUR totals + USD parenthesized balance
      const listRes = await app.inject({
        method: "GET",
        url: "/api/v1/accounts",
        headers: { cookie: cookieA },
      });
      expect(listRes.statusCode).toBe(200);
      const summary = listRes.json();
      expect(summary.totalBalance).toBe("5250");
      expect(summary.formattedTotalBalance).toBe("5.250,00 €");
      expect(summary.cashBalance).toBe("250");
      expect(summary.formattedCashBalance).toBe("250,00 €");

      const amex = summary.accounts.find(
        (a: { id: string }) => a.id === amexId,
      );
      expect(amex.formattedBalance).toBe("2.200,00 $ (2.000,00 €)");

      // Tenant isolation on single account read
      expect(
        (
          await app.inject({
            method: "GET",
            url: `/api/v1/accounts/${amexId}`,
            headers: { cookie: cookieA },
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await app.inject({
            method: "GET",
            url: `/api/v1/accounts/${amexId}`,
            headers: { cookie: cookieB },
          })
        ).statusCode,
      ).toBe(404);

      // Archive Amex via CommandBus -> totalBalance drops to 3250; Undo restores 5250
      const archiveCmdId = "10000000-0000-4000-8000-000000000004";
      await app.inject({
        method: "POST",
        url: "/api/v1/commands",
        headers: { cookie: cookieA },
        payload: {
          commandId: archiveCmdId,
          actor: "manual",
          issuedAtUtc: "2026-11-19T21:05:00.000Z",
          type: "account.archive",
          payload: { accountId: amexId },
        },
      });

      const afterArchive = await app.inject({
        method: "GET",
        url: "/api/v1/accounts",
        headers: { cookie: cookieA },
      });
      expect(afterArchive.json().totalBalance).toBe("3250");

      await app.inject({
        method: "POST",
        url: `/api/v1/commands/${archiveCmdId}/undo`,
        headers: { cookie: cookieA },
      });

      const afterUndo = await app.inject({
        method: "GET",
        url: "/api/v1/accounts",
        headers: { cookie: cookieA },
      });
      expect(afterUndo.json().totalBalance).toBe("5250");
    } finally {
      await app.close();
    }
  });
});
