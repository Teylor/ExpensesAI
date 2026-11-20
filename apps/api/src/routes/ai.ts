import { randomUUID } from "node:crypto";
import type { UserPreferences } from "@agenticf/domain";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  type ChatGptOAuthService,
  InvalidOAuthStateError,
} from "../ai/oauth.js";
import type {
  AgentOrchestrator,
  AiConnectionRecord,
  AiConnectionsRepository,
} from "../ai/orchestrator.js";
import { maskSecretPreview, type SecretVault } from "../ai/vault.js";
import type { AuthService } from "../auth/service.js";
import { requireAuthenticatedUser, SESSION_COOKIE_NAME } from "./auth.js";

export interface RegisterAiRoutesOptions {
  authService: AuthService;
  aiConnectionsRepository: AiConnectionsRepository;
  secretVault: SecretVault;
  chatGptOAuthService: ChatGptOAuthService;
  agentOrchestrator: AgentOrchestrator;
  allowedOrigins?: string[];
  secureCookies?: boolean;
  onUserRegistered?: (
    userId: string,
    preferences: UserPreferences,
  ) => Promise<void>;
}

function resolveOAuthRedirectUri(
  originHeader: string | undefined,
  allowedOrigins?: string[],
): string | undefined {
  if (!originHeader || !allowedOrigins?.includes(originHeader)) {
    return undefined;
  }
  return `${originHeader.replace(/\/+$/, "")}/oauth/chatgpt/callback`;
}

const byokBodySchema = z.object({
  provider: z
    .enum(["openai", "anthropic", "openai_compatible"])
    .default("openai"),
  label: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(80).default("gpt-4o-mini"),
  baseUrl: z.url().optional(),
  apiKey: z.string().trim().min(8).max(400),
});

const connectionParamsSchema = z.object({
  connectionId: z.uuid(),
});

const oauthCallbackBodySchema = z.object({
  state: z.string().trim().min(10).max(200),
  code: z.string().trim().min(1).max(400),
});

const agentChatBodySchema = z.object({
  message: z.string().trim().min(1).max(2000),
});

function toPublicConnectionDto(conn: AiConnectionRecord) {
  return {
    id: conn.id,
    kind: conn.kind,
    provider: conn.provider,
    label: conn.label,
    model: conn.model,
    baseUrl: conn.baseUrl,
    maskedPreview: conn.maskedPreview,
    priority: conn.priority,
    isActive: conn.isActive,
    lastError: conn.lastError,
    createdAt: conn.createdAt.toISOString(),
    updatedAt: conn.updatedAt.toISOString(),
  };
}

export function registerAiRoutes(
  app: FastifyInstance,
  options: RegisterAiRoutesOptions,
): void {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const {
    authService,
    aiConnectionsRepository,
    secretVault,
    chatGptOAuthService,
    agentOrchestrator,
    secureCookies = true,
    onUserRegistered,
  } = options;

  typedApp.get("/api/v1/ai/connections", async (request, reply) => {
    const auth = await requireAuthenticatedUser(request, reply, authService);
    if (!auth) return;

    const list = await aiConnectionsRepository.listByUser(auth.user.id);
    return reply.code(200).send({
      connections: list.map(toPublicConnectionDto),
    });
  });

  typedApp.post(
    "/api/v1/ai/connections/byok",
    {
      schema: {
        body: byokBodySchema,
      },
    },
    async (request, reply) => {
      const auth = await requireAuthenticatedUser(request, reply, authService);
      if (!auth) return;

      const now = new Date();
      const record: AiConnectionRecord = {
        id: randomUUID(),
        userId: auth.user.id,
        kind: "byok",
        provider: request.body.provider,
        label: request.body.label,
        model: request.body.model,
        baseUrl: request.body.baseUrl ?? null,
        encryptedCredential: secretVault.encrypt(request.body.apiKey),
        maskedPreview: maskSecretPreview(request.body.apiKey),
        priority: 2,
        isActive: true,
        lastError: null,
        createdAt: now,
        updatedAt: now,
      };

      await aiConnectionsRepository.upsert(record);
      return reply.code(201).send({
        connection: toPublicConnectionDto(record),
      });
    },
  );

  typedApp.delete(
    "/api/v1/ai/connections/:connectionId",
    {
      schema: {
        params: connectionParamsSchema,
      },
    },
    async (request, reply) => {
      const auth = await requireAuthenticatedUser(request, reply, authService);
      if (!auth) return;

      const deleted = await aiConnectionsRepository.deleteById(
        auth.user.id,
        request.params.connectionId,
      );
      if (!deleted) {
        return reply.code(404).send({
          error: "AI_CONNECTION_NOT_FOUND",
          message: "AI connection not found",
        });
      }
      return reply.code(204).send();
    },
  );

  typedApp.post("/api/v1/ai/oauth/chatgpt/start", async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE_NAME];
    const auth = await authService.authenticateSession(token);
    const redirectUriOverride = resolveOAuthRedirectUri(
      request.headers.origin,
      options.allowedOrigins,
    );
    const result = await chatGptOAuthService.startAuthorization(
      auth?.user.id ?? null,
      redirectUriOverride,
    );
    return reply.code(200).send(result);
  });

  typedApp.post(
    "/api/v1/ai/oauth/chatgpt/callback",
    {
      schema: {
        body: oauthCallbackBodySchema,
      },
    },
    async (request, reply) => {
      try {
        const redirectUriOverride = resolveOAuthRedirectUri(
          request.headers.origin,
          options.allowedOrigins,
        );
        const exchanged = await chatGptOAuthService.completeAuthorization({
          ...request.body,
          ...(redirectUriOverride ? { redirectUri: redirectUriOverride } : {}),
        });

        const token = request.cookies[SESSION_COOKIE_NAME];
        const currentAuth = await authService.authenticateSession(token);

        let targetUserId = exchanged.userId ?? currentAuth?.user.id ?? null;
        let signedInUser = currentAuth?.user;
        let signedInPreferences = currentAuth?.preferences;

        if (!targetUserId) {
          const oauthAuth = await authService.findOrCreateOAuthUser({
            email: exchanged.email,
            displayName: exchanged.displayName,
          });
          if (oauthAuth.isNewUser && onUserRegistered) {
            await onUserRegistered(oauthAuth.user.id, oauthAuth.preferences);
          }
          reply.setCookie(SESSION_COOKIE_NAME, oauthAuth.sessionToken, {
            httpOnly: true,
            sameSite: "lax",
            secure: secureCookies,
            path: "/",
            expires: oauthAuth.expiresAt,
          });
          targetUserId = oauthAuth.user.id;
          signedInUser = oauthAuth.user;
          signedInPreferences = oauthAuth.preferences;
        }

        const now = new Date();
        const record: AiConnectionRecord = {
          id: randomUUID(),
          userId: targetUserId,
          kind: "chatgpt_oauth",
          provider: "openai",
          label: exchanged.displayName ?? "ChatGPT Plan Sharing",
          model: exchanged.model,
          baseUrl: null,
          encryptedCredential: secretVault.encrypt(exchanged.accessToken),
          maskedPreview: `ChatGPT (${exchanged.email})`,
          priority: 1,
          isActive: true,
          lastError: null,
          createdAt: now,
          updatedAt: now,
        };

        await aiConnectionsRepository.upsert(record);
        return reply.code(200).send({
          connection: toPublicConnectionDto(record),
          ...(signedInUser ? { user: signedInUser } : {}),
          ...(signedInPreferences ? { preferences: signedInPreferences } : {}),
        });
      } catch (error) {
        if (error instanceof InvalidOAuthStateError) {
          return reply.code(400).send({
            error: "INVALID_OAUTH_STATE",
            message: error.message,
          });
        }
        throw error;
      }
    },
  );

  typedApp.post(
    "/api/v1/ai/agent/chat",
    {
      schema: {
        body: agentChatBodySchema,
      },
    },
    async (request, reply) => {
      const auth = await requireAuthenticatedUser(request, reply, authService);
      if (!auth) return;

      const response = await agentOrchestrator.chat(
        auth.user.id,
        request.body.message,
      );
      return reply.code(200).send(response);
    },
  );
}
