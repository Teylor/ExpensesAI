import { buildApp } from "./app.js";
import { loadEnvFilesIfPresent, parseEnv } from "./config/env.js";
import { createDbClient } from "./db/client.js";
import {
  captureExceptionSafe,
  flushSentry,
  initSentry,
} from "./observability/sentry.js";

async function start(): Promise<void> {
  loadEnvFilesIfPresent();
  const env = parseEnv(process.env);

  initSentry({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT,
    release: env.SENTRY_RELEASE,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
  });

  const dbClient = createDbClient(env.DATABASE_URL);
  const app = await buildApp({
    corsOrigin: env.CORS_ORIGIN,
    logLevel: env.LOG_LEVEL,
    checkDatabase: dbClient.pingDatabase,
    onError: captureExceptionSafe,
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    app.log.info({ signal }, "Graceful shutdown initiated");
    try {
      await app.close();
      await dbClient.close();
      await flushSentry();
      process.exit(0);
    } catch (error) {
      captureExceptionSafe(error, { phase: "shutdown", signal });
      await flushSentry();
      process.exit(1);
    }
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  await app.listen({
    host: env.HOST,
    port: env.PORT,
  });
}

start().catch(async (error: unknown) => {
  captureExceptionSafe(error, { phase: "startup" });
  await flushSentry();
  console.error("Fatal error starting AgenticF API:", error);
  process.exit(1);
});
