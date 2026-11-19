import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema/index.js";

export interface DbClient {
  db: PostgresJsDatabase<typeof schema>;
  sql: Sql;
  pingDatabase: () => Promise<boolean>;
  close: () => Promise<void>;
}

export function createDbClient(databaseUrl: string): DbClient {
  const client = postgres(databaseUrl, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  const db = drizzle(client, { schema });

  return {
    db,
    sql: client,
    async pingDatabase(): Promise<boolean> {
      try {
        await db.execute(sql`SELECT 1`);
        return true;
      } catch {
        return false;
      }
    },
    async close(): Promise<void> {
      await client.end({ timeout: 5 });
    },
  };
}
