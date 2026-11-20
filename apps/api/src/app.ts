import { DOMAIN_CONTRACT_VERSION } from "@agenticf/domain";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import type { AccountsService } from "./accounts/service.js";
import type { ChatGptOAuthService } from "./ai/oauth.js";
import type {
  AgentOrchestrator,
  AiConnectionsRepository,
} from "./ai/orchestrator.js";
import type { SecretVault } from "./ai/vault.js";
import type { AuthService } from "./auth/service.js";
import type { CategoriesService } from "./categories/service.js";
import type { CommandBus } from "./commands/bus.js";
import type { RecurringService } from "./recurring/service.js";
import { registerAccountRoutes } from "./routes/accounts.js";
import { registerAiRoutes } from "./routes/ai.js";
import { registerAnalyticsRoutes } from "./routes/analytics.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerCommandRoutes } from "./routes/commands.js";
import { type FxRateReader, registerFxRoutes } from "./routes/fx.js";
import { registerRecurringRoutes } from "./routes/recurring.js";
import { registerCategoryAndTransactionRoutes } from "./routes/transactions.js";
import { registerWealthRoutes } from "./routes/wealth.js";
import type { TransactionsService } from "./transactions/service.js";
import type { WealthService } from "./wealth/service.js";

export interface BuildAppOptions {
  corsOrigin: string;
  logLevel?: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  checkDatabase: () => Promise<boolean>;
  fxRateReader?: FxRateReader;
  authService?: AuthService;
  commandBus?: CommandBus;
  accountsService?: AccountsService;
  categoriesService?: CategoriesService;
  transactionsService?: TransactionsService;
  recurringService?: RecurringService;
  wealthService?: WealthService;
  aiConnectionsRepository?: AiConnectionsRepository;
  secretVault?: SecretVault;
  chatGptOAuthService?: ChatGptOAuthService;
  agentOrchestrator?: AgentOrchestrator;
  secureCookies?: boolean;
  onError?: (error: unknown, context: Record<string, unknown>) => void;
}

export async function buildApp(
  options: BuildAppOptions,
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: options.logLevel ?? "info",
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers['x-api-key']",
      ],
    },
    trustProxy: true,
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cookie);

  await app.register(helmet, {
    contentSecurityPolicy: false,
  });

  await app.register(cors, {
    origin: options.corsOrigin,
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute",
  });

  app.setNotFoundHandler((_request, reply) => {
    return reply.code(404).send({
      error: "NOT_FOUND",
      message: "Resource not found",
    });
  });

  app.setErrorHandler((error, request, reply) => {
    const statusCode =
      typeof (error as { statusCode?: unknown }).statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : 500;

    if (statusCode >= 500) {
      request.log.error(
        { err: error, route: request.url },
        "Unhandled server error",
      );
      options.onError?.(error, {
        method: request.method,
        route: request.url,
        requestId: request.id,
      });

      return reply.code(500).send({
        error: "INTERNAL_SERVER_ERROR",
        message: "Unexpected internal error",
      });
    }

    return reply.code(statusCode).send({
      error: "REQUEST_ERROR",
      message: error instanceof Error ? error.message : "Bad request",
    });
  });

  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get("/health", async () => {
    return {
      status: "ok",
      service: "agenticf-api",
      stateless: true,
      domainVersion: DOMAIN_CONTRACT_VERSION,
      timestamp: new Date().toISOString(),
    };
  });

  typedApp.get("/ready", async (_request, reply) => {
    let dbUp = false;
    try {
      dbUp = await options.checkDatabase();
    } catch {
      dbUp = false;
    }

    if (!dbUp) {
      return reply.code(503).send({
        status: "not_ready",
        database: "down",
      });
    }

    return reply.code(200).send({
      status: "ready",
      database: "up",
    });
  });

  if (options.fxRateReader) {
    registerFxRoutes(app, options.fxRateReader);
  }

  if (options.authService) {
    const categoriesService = options.categoriesService;
    registerAuthRoutes(app, {
      authService: options.authService,
      secureCookies: options.secureCookies ?? true,
      ...(categoriesService
        ? {
            onUserRegistered: async (userId, preferences) => {
              await categoriesService.seedDefaultCategories(
                userId,
                preferences.locale,
              );
            },
          }
        : {}),
    });

    if (options.commandBus) {
      registerCommandRoutes(app, {
        authService: options.authService,
        commandBus: options.commandBus,
      });
    }

    if (options.accountsService) {
      registerAccountRoutes(app, {
        authService: options.authService,
        accountsService: options.accountsService,
        ...(options.fxRateReader ? { fxRateReader: options.fxRateReader } : {}),
      });
    }

    if (options.categoriesService || options.transactionsService) {
      registerCategoryAndTransactionRoutes(app, {
        authService: options.authService,
        ...(options.categoriesService
          ? { categoriesService: options.categoriesService }
          : {}),
        ...(options.transactionsService
          ? { transactionsService: options.transactionsService }
          : {}),
        ...(options.fxRateReader ? { fxRateReader: options.fxRateReader } : {}),
      });
    }

    if (options.recurringService) {
      registerRecurringRoutes(app, {
        authService: options.authService,
        recurringService: options.recurringService,
        ...(options.fxRateReader ? { fxRateReader: options.fxRateReader } : {}),
      });
    }

    if (options.transactionsService) {
      registerAnalyticsRoutes(app, {
        authService: options.authService,
        transactionsService: options.transactionsService,
        ...(options.categoriesService
          ? { categoriesService: options.categoriesService }
          : {}),
        ...(options.fxRateReader ? { fxRateReader: options.fxRateReader } : {}),
      });
    }

    if (options.wealthService) {
      registerWealthRoutes(app, {
        authService: options.authService,
        wealthService: options.wealthService,
        ...(options.accountsService
          ? { accountsService: options.accountsService }
          : {}),
        ...(options.transactionsService
          ? { transactionsService: options.transactionsService }
          : {}),
        ...(options.fxRateReader ? { fxRateReader: options.fxRateReader } : {}),
      });
    }

    if (
      options.aiConnectionsRepository &&
      options.secretVault &&
      options.chatGptOAuthService &&
      options.agentOrchestrator
    ) {
      registerAiRoutes(app, {
        authService: options.authService,
        aiConnectionsRepository: options.aiConnectionsRepository,
        secretVault: options.secretVault,
        chatGptOAuthService: options.chatGptOAuthService,
        agentOrchestrator: options.agentOrchestrator,
        secureCookies: options.secureCookies ?? true,
        ...(categoriesService
          ? {
              onUserRegistered: async (userId, preferences) => {
                await categoriesService.seedDefaultCategories(
                  userId,
                  preferences.locale,
                );
              },
            }
          : {}),
      });
    }
  }

  return app;
}
