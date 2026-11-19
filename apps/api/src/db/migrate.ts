import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { loadEnvFilesIfPresent, parseEnv } from "../config/env.js";
import { createDbClient } from "./client.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(currentDir, "../../drizzle");

async function runMigrations(): Promise<void> {
  loadEnvFilesIfPresent();
  const env = parseEnv(process.env);
  const client = createDbClient(env.DATABASE_URL);

  try {
    await migrate(client.db, { migrationsFolder });
    console.log("Database migrations applied successfully.");
  } finally {
    await client.close();
  }
}

runMigrations().catch((error: unknown) => {
  console.error("Failed to run database migrations:", error);
  process.exitCode = 1;
});
