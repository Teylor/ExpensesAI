import type { UserPreferences } from "@agenticf/domain";
import { describe, expect, it } from "vitest";
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

function createTestServices() {
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

  const entries = new Map<string, CommandLogEntry>();
  const commandRepo: CommandLogRepository = {
    async findByCommandId(userId, commandId) {
      const entry = entries.get(commandId);
      if (!entry || entry.userId !== userId) return null;
      return entry;
    },
    async insert(entry) {
      entries.set(entry.commandId, entry);
    },
    async markUndone(userId, commandId, undoneByCommandId, undoneAt) {
      const entry = entries.get(commandId);
      if (!entry || entry.userId !== userId) return false;
      entries.set(commandId, { ...entry, undoneAt, undoneByCommandId });
      return true;
    },
    async listByUser(userId, limit) {
      return [...entries.values()]
        .filter((e) => e.userId === userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit);
    },
  };

  const authService = new AuthService({ repository: authRepo });
  const commandBus = new CommandBus({ repository: commandRepo });
  commandBus.registerHandler("account.create", {
    execute: async (_userId, payload) => ({
      result: { createdName: payload.name },
      inversePayload: { removeName: payload.name },
    }),
    undo: async (_userId, inverse) => ({ removed: inverse.removeName }),
  });

  return { authService, commandBus };
}

function cookiePair(setCookie: string | string[] | undefined): string {
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return raw?.split(";")[0] ?? "";
}

const CMD_1 = "11111111-1111-4111-8111-111111111111";
const CMD_2 = "22222222-2222-4222-8222-222222222222";

describe("CommandBus protected REST routes (/api/v1/commands*)", () => {
  it("enforces authentication, idempotency, batch sync, history, and tenant-isolated undo", async () => {
    const { authService, commandBus } = createTestServices();
    const app = await buildApp({
      corsOrigin: "http://localhost:5173",
      logLevel: "silent",
      checkDatabase: async () => true,
      authService,
      commandBus,
      secureCookies: false,
    });

    try {
      // Unauthenticated request -> 401
      const anon = await app.inject({
        method: "GET",
        url: "/api/v1/commands/history",
      });
      expect(anon.statusCode).toBe(401);

      // Register User A & User B
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

      // Dispatch command 1 (applied -> 201)
      const cmdPayload = {
        commandId: CMD_1,
        actor: "agent",
        issuedAtUtc: "2026-11-19T20:00:00.000Z",
        type: "account.create",
        payload: {
          name: "Banco Principal",
          accountType: "bank",
          currency: "EUR",
          initialBalance: "3000",
        },
      };

      const first = await app.inject({
        method: "POST",
        url: "/api/v1/commands",
        headers: { cookie: cookieA },
        payload: cmdPayload,
      });
      expect(first.statusCode).toBe(201);
      expect(first.json().status).toBe("applied");

      // Idempotent retry -> 200 duplicate
      const retry = await app.inject({
        method: "POST",
        url: "/api/v1/commands",
        headers: { cookie: cookieA },
        payload: cmdPayload,
      });
      expect(retry.statusCode).toBe(200);
      expect(retry.json().status).toBe("duplicate");

      // Batch sync (offline outbox)
      const batch = await app.inject({
        method: "POST",
        url: "/api/v1/commands/batch",
        headers: { cookie: cookieA },
        payload: {
          commands: [
            cmdPayload,
            {
              commandId: CMD_2,
              actor: "manual",
              issuedAtUtc: "2026-11-19T20:05:00.000Z",
              type: "account.create",
              payload: {
                name: "Efectivo",
                accountType: "cash",
                currency: "EUR",
                initialBalance: "150",
              },
            },
          ],
        },
      });
      expect(batch.statusCode).toBe(200);
      expect(
        batch.json().results.map((r: { status: string }) => r.status),
      ).toEqual(["duplicate", "applied"]);

      // History for User A
      const history = await app.inject({
        method: "GET",
        url: "/api/v1/commands/history",
        headers: { cookie: cookieA },
      });
      expect(history.statusCode).toBe(200);
      expect(history.json().items).toHaveLength(2);

      // User B cannot undo User A's command -> 404
      const foreignUndo = await app.inject({
        method: "POST",
        url: `/api/v1/commands/${CMD_1}/undo`,
        headers: { cookie: cookieB },
      });
      expect(foreignUndo.statusCode).toBe(404);

      // User A undoes CMD_1 -> 200, second undo -> 409
      const undoOk = await app.inject({
        method: "POST",
        url: `/api/v1/commands/${CMD_1}/undo`,
        headers: { cookie: cookieA },
      });
      expect(undoOk.statusCode).toBe(200);
      expect(undoOk.json().undoneCommandId).toBe(CMD_1);

      const undoAgain = await app.inject({
        method: "POST",
        url: `/api/v1/commands/${CMD_1}/undo`,
        headers: { cookie: cookieA },
      });
      expect(undoAgain.statusCode).toBe(409);
      expect(undoAgain.json().error).toBe("COMMAND_ALREADY_UNDONE");
    } finally {
      await app.close();
    }
  });
});
