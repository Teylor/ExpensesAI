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
import { SESSION_COOKIE_NAME } from "./auth.js";

function createTestAuthService(): AuthService {
  const usersById = new Map<string, StoredUser>();
  const usersByEmail = new Map<string, StoredUser>();
  const prefsByUser = new Map<string, UserPreferences>();
  const sessionsById = new Map<string, StoredSession>();

  const repository: AuthRepository = {
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

  return new AuthService({ repository });
}

function extractCookieHeader(
  setCookieHeader: string | string[] | undefined,
): string {
  const raw = Array.isArray(setCookieHeader)
    ? setCookieHeader[0]
    : setCookieHeader;
  if (!raw) throw new Error("Expected Set-Cookie header");
  return raw.split(";")[0] ?? "";
}

describe("Auth & Preferences REST routes", () => {
  it("supports register -> me -> preferences PATCH -> logout -> login lifecycle with HttpOnly cookie", async () => {
    const authService = createTestAuthService();
    const app = await buildApp({
      corsOrigin: "http://localhost:5173",
      logLevel: "silent",
      checkDatabase: async () => true,
      authService,
      secureCookies: false,
    });

    try {
      // Unauthenticated /me returns 401
      const anonMe = await app.inject({
        method: "GET",
        url: "/api/v1/auth/me",
      });
      expect(anonMe.statusCode).toBe(401);

      // Register
      const reg = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: {
          email: "alice@example.com",
          password: "correct-horse-battery-staple",
          displayName: "Alice",
        },
      });
      expect(reg.statusCode).toBe(201);
      const setCookie = String(reg.headers["set-cookie"]);
      expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("SameSite=Lax");
      expect(reg.json().user.email).toBe("alice@example.com");
      expect(reg.json().preferences.baseCurrency).toBe("EUR");

      const cookieHeader = extractCookieHeader(reg.headers["set-cookie"]);

      // Duplicate register returns 409
      const dup = await app.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        payload: {
          email: "alice@example.com",
          password: "another-valid-password-123",
        },
      });
      expect(dup.statusCode).toBe(409);
      expect(dup.json().error).toBe("EMAIL_ALREADY_EXISTS");

      // Authenticated /me
      const me = await app.inject({
        method: "GET",
        url: "/api/v1/auth/me",
        headers: { cookie: cookieHeader },
      });
      expect(me.statusCode).toBe(200);
      expect(me.json().user.email).toBe("alice@example.com");

      // PATCH preferences (valid)
      const patchOk = await app.inject({
        method: "PATCH",
        url: "/api/v1/preferences",
        headers: { cookie: cookieHeader },
        payload: {
          baseCurrency: "USD",
          thousandsSeparator: ",",
          decimalSeparator: ".",
          agentConfirmEnabled: false,
        },
      });
      expect(patchOk.statusCode).toBe(200);
      expect(patchOk.json().preferences.baseCurrency).toBe("USD");
      expect(patchOk.json().preferences.agentConfirmEnabled).toBe(false);

      // PATCH preferences (conflicting separator -> 400)
      const patchBad = await app.inject({
        method: "PATCH",
        url: "/api/v1/preferences",
        headers: { cookie: cookieHeader },
        payload: {
          thousandsSeparator: ".",
        },
      });
      expect(patchBad.statusCode).toBe(400);

      // Logout invalidates session
      const logout = await app.inject({
        method: "POST",
        url: "/api/v1/auth/logout",
        headers: { cookie: cookieHeader },
      });
      expect(logout.statusCode).toBe(204);

      const meAfterLogout = await app.inject({
        method: "GET",
        url: "/api/v1/auth/me",
        headers: { cookie: cookieHeader },
      });
      expect(meAfterLogout.statusCode).toBe(401);

      // Login with wrong password -> 401 generic
      const badLogin = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: {
          email: "alice@example.com",
          password: "wrong-password-attempt",
        },
      });
      expect(badLogin.statusCode).toBe(401);
      expect(badLogin.json().error).toBe("INVALID_CREDENTIALS");

      // Login with valid credentials -> 200 + fresh cookie
      const goodLogin = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: {
          email: "alice@example.com",
          password: "correct-horse-battery-staple",
        },
      });
      expect(goodLogin.statusCode).toBe(200);
      expect(String(goodLogin.headers["set-cookie"])).toContain(
        `${SESSION_COOKIE_NAME}=`,
      );
      expect(goodLogin.json().preferences.baseCurrency).toBe("USD");
    } finally {
      await app.close();
    }
  });
});
