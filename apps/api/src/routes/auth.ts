import {
  loginRequestSchema,
  registerRequestSchema,
  type UserPreferences,
  updateUserPreferencesSchema,
} from "@agenticf/domain";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { ZodError } from "zod";
import {
  type AuthenticatedContext,
  type AuthService,
  EmailAlreadyExistsError,
  InvalidCredentialsError,
} from "../auth/service.js";

export const SESSION_COOKIE_NAME = "agenticf_session";

export interface RegisterAuthRoutesOptions {
  authService: AuthService;
  secureCookies: boolean;
  onUserRegistered?: (
    userId: string,
    preferences: UserPreferences,
  ) => Promise<void>;
}

function setSessionCookie(
  reply: FastifyReply,
  sessionToken: string,
  expiresAt: Date,
  secure: boolean,
): void {
  reply.setCookie(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires: expiresAt,
  });
}

function clearSessionCookie(reply: FastifyReply, secure: boolean): void {
  reply.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
  });
}

export async function requireAuthenticatedUser(
  request: FastifyRequest,
  reply: FastifyReply,
  authService: AuthService,
): Promise<AuthenticatedContext | null> {
  const token = request.cookies[SESSION_COOKIE_NAME];
  const auth = await authService.authenticateSession(token);
  if (!auth) {
    await reply.code(401).send({
      error: "UNAUTHORIZED",
      message: "Authentication required",
    });
    return null;
  }
  return auth;
}

export function registerAuthRoutes(
  app: FastifyInstance,
  options: RegisterAuthRoutesOptions,
): void {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const { authService, secureCookies, onUserRegistered } = options;

  const authRateLimitConfig = {
    rateLimit: {
      max: 10,
      timeWindow: "1 minute",
    },
  };

  typedApp.post(
    "/api/v1/auth/register",
    {
      config: authRateLimitConfig,
      schema: {
        body: registerRequestSchema,
      },
    },
    async (request, reply) => {
      try {
        const result = await authService.register(request.body);
        if (onUserRegistered) {
          await onUserRegistered(result.user.id, result.preferences);
        }
        setSessionCookie(
          reply,
          result.sessionToken,
          result.expiresAt,
          secureCookies,
        );
        return reply.code(201).send({
          user: result.user,
          preferences: result.preferences,
        });
      } catch (error) {
        if (error instanceof EmailAlreadyExistsError) {
          return reply.code(409).send({
            error: "EMAIL_ALREADY_EXISTS",
            message: "An account with this email already exists",
          });
        }
        throw error;
      }
    },
  );

  typedApp.post(
    "/api/v1/auth/login",
    {
      config: authRateLimitConfig,
      schema: {
        body: loginRequestSchema,
      },
    },
    async (request, reply) => {
      try {
        const result = await authService.login(request.body);
        setSessionCookie(
          reply,
          result.sessionToken,
          result.expiresAt,
          secureCookies,
        );
        return reply.code(200).send({
          user: result.user,
          preferences: result.preferences,
        });
      } catch (error) {
        if (error instanceof InvalidCredentialsError) {
          return reply.code(401).send({
            error: "INVALID_CREDENTIALS",
            message: "Invalid email or password",
          });
        }
        throw error;
      }
    },
  );

  typedApp.post("/api/v1/auth/logout", async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE_NAME];
    await authService.logout(token);
    clearSessionCookie(reply, secureCookies);
    return reply.code(204).send();
  });

  typedApp.get("/api/v1/auth/me", async (request, reply) => {
    const auth = await requireAuthenticatedUser(request, reply, authService);
    if (!auth) {
      return;
    }

    return reply.code(200).send({
      user: auth.user,
      preferences: auth.preferences,
    });
  });

  typedApp.patch(
    "/api/v1/preferences",
    {
      schema: {
        body: updateUserPreferencesSchema,
      },
    },
    async (request, reply) => {
      const auth = await requireAuthenticatedUser(request, reply, authService);
      if (!auth) {
        return;
      }

      try {
        const updated = await authService.updatePreferences(
          auth.user.id,
          request.body,
        );
        return reply.code(200).send({ preferences: updated });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.code(400).send({
            error: "INVALID_PREFERENCES",
            message: error.issues.map((i) => i.message).join("; "),
          });
        }
        throw error;
      }
    },
  );
}
