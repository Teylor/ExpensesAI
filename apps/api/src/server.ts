import {
  AccountsService,
  PostgresAccountsRepository,
  registerAccountCommandHandlers,
} from "./accounts/service.js";
import { buildApp } from "./app.js";
import { AuthService, PostgresAuthRepository } from "./auth/service.js";
import {
  CategoriesService,
  PostgresCategoriesRepository,
  registerCategoryCommandHandlers,
} from "./categories/service.js";
import { CommandBus, PostgresCommandLogRepository } from "./commands/bus.js";
import { loadEnvFilesIfPresent, parseEnv } from "./config/env.js";
import { createDbClient } from "./db/client.js";
import { createDefaultFxProvider } from "./fx/providers.js";
import { startFxDailyScheduler } from "./fx/scheduler.js";
import {
  FxService,
  PostgresAdvisoryLock,
  PostgresFxRatesRepository,
} from "./fx/service.js";
import {
  captureExceptionSafe,
  flushSentry,
  initSentry,
} from "./observability/sentry.js";
import { startRecurringScheduler } from "./recurring/scheduler.js";
import {
  PostgresRecurringAdvisoryLock,
  PostgresRecurringRepository,
  RecurringService,
  registerRecurringCommandHandlers,
} from "./recurring/service.js";
import {
  PostgresTransactionsRepository,
  registerTransactionCommandHandlers,
  TransactionsService,
} from "./transactions/service.js";
import {
  PostgresWealthRepository,
  registerWealthCommandHandlers,
  WealthService,
} from "./wealth/service.js";

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
  const authService = new AuthService({
    repository: new PostgresAuthRepository(dbClient),
  });
  const commandBus = new CommandBus({
    repository: new PostgresCommandLogRepository(dbClient),
  });
  const accountsRepository = new PostgresAccountsRepository(dbClient);
  const accountsService = new AccountsService({
    repository: accountsRepository,
  });
  const categoriesService = new CategoriesService({
    repository: new PostgresCategoriesRepository(dbClient),
  });
  const fxService = new FxService({
    repository: new PostgresFxRatesRepository(dbClient),
    provider: createDefaultFxProvider(),
    advisoryLock: new PostgresAdvisoryLock(dbClient),
  });
  const transactionsService = new TransactionsService({
    repository: new PostgresTransactionsRepository(dbClient),
    accountsRepository,
    getUserPreferences: (userId) => authService.getUserPreferences(userId),
    fxRateReader: fxService,
  });
  const recurringService = new RecurringService({
    repository: new PostgresRecurringRepository(dbClient),
    accountsRepository,
    getUserPreferences: (userId) => authService.getUserPreferences(userId),
    commandBus,
    advisoryLock: new PostgresRecurringAdvisoryLock(dbClient),
  });
  const wealthService = new WealthService({
    repository: new PostgresWealthRepository(dbClient),
  });
  registerAccountCommandHandlers(commandBus, accountsService);
  registerCategoryCommandHandlers(commandBus, categoriesService);
  registerTransactionCommandHandlers(commandBus, transactionsService);
  registerRecurringCommandHandlers(commandBus, recurringService);
  registerWealthCommandHandlers(commandBus, wealthService);
  const fxScheduler = startFxDailyScheduler({
    fxService,
    onError: captureExceptionSafe,
  });
  const recurringScheduler = startRecurringScheduler({
    recurringService,
    onError: captureExceptionSafe,
  });

  const app = await buildApp({
    corsOrigin: env.CORS_ORIGIN,
    logLevel: env.LOG_LEVEL,
    checkDatabase: dbClient.pingDatabase,
    fxRateReader: fxService,
    authService,
    commandBus,
    accountsService,
    categoriesService,
    transactionsService,
    recurringService,
    wealthService,
    secureCookies: env.NODE_ENV === "production",
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
      fxScheduler.stop();
      recurringScheduler.stop();
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
