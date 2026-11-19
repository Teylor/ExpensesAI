import {
  DEFAULT_USER_PREFERENCES,
  type UserPreferences,
} from "@agenticf/domain";
import { describe, expect, it } from "vitest";
import {
  type AuthRepository,
  AuthService,
  EmailAlreadyExistsError,
  InvalidCredentialsError,
  type StoredSession,
  type StoredUser,
} from "./service.js";

function createInMemoryAuthRepo(): AuthRepository {
  const usersById = new Map<string, StoredUser>();
  const usersByEmail = new Map<string, StoredUser>();
  const prefsByUser = new Map<string, UserPreferences>();
  const sessionsById = new Map<string, StoredSession>();

  return {
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
}

describe("AuthService (register, login, stateless sessions, preferences)", () => {
  it("registers a new user with default preferences and creates a valid session", async () => {
    const repo = createInMemoryAuthRepo();
    const service = new AuthService({ repository: repo });

    const created = await service.register({
      email: "Alice@Example.com",
      password: "correct-horse-battery-staple",
      displayName: "Alice",
    });

    expect(created.user.email).toBe("alice@example.com");
    expect(created.user.displayName).toBe("Alice");
    expect("passwordHash" in created.user).toBe(false);
    expect(created.preferences).toEqual(DEFAULT_USER_PREFERENCES);
    expect(created.sessionToken.length).toBeGreaterThanOrEqual(43);

    const auth = await service.authenticateSession(created.sessionToken);
    expect(auth?.user.id).toBe(created.user.id);
    expect(auth?.preferences).toEqual(DEFAULT_USER_PREFERENCES);
  });

  it("rejects duplicate email registration", async () => {
    const repo = createInMemoryAuthRepo();
    const service = new AuthService({ repository: repo });

    await service.register({
      email: "dup@example.com",
      password: "correct-horse-battery-staple",
    });

    await expect(
      service.register({
        email: "DUP@example.com",
        password: "another-valid-password-123",
      }),
    ).rejects.toThrow(EmailAlreadyExistsError);
  });

  it("authenticates valid credentials and throws generic InvalidCredentialsError on failures", async () => {
    const repo = createInMemoryAuthRepo();
    const service = new AuthService({ repository: repo });

    await service.register({
      email: "user@example.com",
      password: "correct-horse-battery-staple",
    });

    const loggedIn = await service.login({
      email: "USER@example.com",
      password: "correct-horse-battery-staple",
    });
    expect(loggedIn.user.email).toBe("user@example.com");

    await expect(
      service.login({
        email: "user@example.com",
        password: "wrong-password-123",
      }),
    ).rejects.toThrow(InvalidCredentialsError);

    await expect(
      service.login({
        email: "nonexistent@example.com",
        password: "correct-horse-battery-staple",
      }),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it("invalidates sessions on logout and rejects expired sessions", async () => {
    let nowMs = new Date("2026-11-19T12:00:00.000Z").getTime();
    const repo = createInMemoryAuthRepo();
    const service = new AuthService({
      repository: repo,
      sessionTtlMs: 60_000,
      now: () => new Date(nowMs),
    });

    const first = await service.register({
      email: "session@example.com",
      password: "correct-horse-battery-staple",
    });

    await service.logout(first.sessionToken);
    expect(await service.authenticateSession(first.sessionToken)).toBeNull();

    const second = await service.login({
      email: "session@example.com",
      password: "correct-horse-battery-staple",
    });
    expect(
      await service.authenticateSession(second.sessionToken),
    ).not.toBeNull();

    // Advance past expiration
    nowMs += 61_000;
    expect(await service.authenticateSession(second.sessionToken)).toBeNull();
  });

  it("updates user preferences with validation against conflicting separators", async () => {
    const repo = createInMemoryAuthRepo();
    const service = new AuthService({ repository: repo });

    const created = await service.register({
      email: "prefs@example.com",
      password: "correct-horse-battery-staple",
    });

    const updated = await service.updatePreferences(created.user.id, {
      baseCurrency: "USD",
      timezone: "America/New_York",
      locale: "en",
      thousandsSeparator: ",",
      decimalSeparator: ".",
      symbolPosition: "before",
      agentConfirmEnabled: false,
    });

    expect(updated).toEqual({
      baseCurrency: "USD",
      timezone: "America/New_York",
      locale: "en",
      thousandsSeparator: ",",
      decimalSeparator: ".",
      symbolPosition: "before",
      agentConfirmEnabled: false,
    });

    await expect(
      service.updatePreferences(created.user.id, {
        thousandsSeparator: ".",
      }),
    ).rejects.toThrow(/different/i);
  });
});
