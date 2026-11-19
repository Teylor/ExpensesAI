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
import type { AuthService } from "./auth/service.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { type FxRateReader, registerFxRoutes } from "./routes/fx.js";

export interface BuildAppOptions {
  corsOrigin: string;
  logLevel?: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  checkDatabase: () => Promise<boolean>;
  fxRateReader?: FxRateReader;
  authService?: AuthService;
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
    registerAuthRoutes(app, {
      authService: options.authService,
      secureCookies: options.secureCookies ?? true,
    });
  }

  return app;
}
