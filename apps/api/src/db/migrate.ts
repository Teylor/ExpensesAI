import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { loadEnvFilesIfPresent, parseEnv } from "../config/env.js";
import { createDbClient, type DbClient } from "./client.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

/** Default absolute path to compiled/source Drizzle SQL migrations folder. */
export const DEFAULT_MIGRATIONS_FOLDER = path.resolve(
  currentDir,
  "../../drizzle",
);

/** Stable 32-bit PostgreSQL advisory lock key serializing migrations across replicas. */
export const DB_MIGRATIONS_LOCK_KEY = 420_008;

export type MigrateRunner = (
  db: DbClient["db"],
  config: { migrationsFolder: string },
) => Promise<void>;

export interface RunDatabaseMigrationsOptions {
  migrationsFolder?: string;
  lockKey?: number;
  migrateFn?: MigrateRunner;
}

/**
 * Applies pending Drizzle migrations under a blocking PostgreSQL session advisory lock
 * so concurrent stateless API replicas never race on schema changes.
 */
export async function runDatabaseMigrations(
  client: DbClient,
  options: RunDatabaseMigrationsOptions = {},
): Promise<void> {
  const migrationsFolder =
    options.migrationsFolder ?? DEFAULT_MIGRATIONS_FOLDER;
  const lockKey = options.lockKey ?? DB_MIGRATIONS_LOCK_KEY;
  const migrateFn = options.migrateFn ?? migrate;

  const reserved = await client.sql.reserve();
  let lockAcquired = false;

  try {
    await reserved`SELECT pg_advisory_lock(${lockKey})`;
    lockAcquired = true;
    await migrateFn(client.db, { migrationsFolder });
  } finally {
    try {
      if (lockAcquired) {
        await reserved`SELECT pg_advisory_unlock(${lockKey})`;
      }
    } finally {
      reserved.release();
    }
  }
}

/**
 * Runs database migrations during API startup unless explicitly disabled via `AUTO_MIGRATE=false`.
 */
export async function applyStartupMigrationsIfEnabled(
  client: DbClient,
  autoMigrate: boolean,
  options: RunDatabaseMigrationsOptions = {},
): Promise<boolean> {
  if (!autoMigrate) {
    return false;
  }
  await runDatabaseMigrations(client, options);
  return true;
}

async function runMigrationsCli(): Promise<void> {
  loadEnvFilesIfPresent();
  const env = parseEnv(process.env);
  const client = createDbClient(env.DATABASE_URL);

  try {
    await runDatabaseMigrations(client);
    console.log("Database migrations applied successfully.");
  } finally {
    await client.close();
  }
}

const entryScript = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entryScript === fileURLToPath(import.meta.url)) {
  runMigrationsCli().catch((error: unknown) => {
    console.error("Failed to run database migrations:", error);
    process.exitCode = 1;
  });
}
