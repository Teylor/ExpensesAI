import { describe, expect, it, vi } from "vitest";
import type { DbClient } from "./client.js";
import {
  applyStartupMigrationsIfEnabled,
  DB_MIGRATIONS_LOCK_KEY,
  DEFAULT_MIGRATIONS_FOLDER,
  runDatabaseMigrations,
} from "./migrate.js";

function createMockDbClient() {
  const queries: string[] = [];
  const release = vi.fn(() => {
    queries.push("release");
  });

  const reservedSql = Object.assign(
    vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const rendered = strings.reduce(
        (acc, part, idx) =>
          acc + part + (idx < values.length ? String(values[idx]) : ""),
        "",
      );
      queries.push(rendered.trim());
      return [];
    }),
    { release },
  );

  const client = {
    db: { __mockDb: true } as unknown as DbClient["db"],
    sql: {
      reserve: vi.fn(async () => reservedSql),
    } as unknown as DbClient["sql"],
    pingDatabase: vi.fn(async () => true),
    close: vi.fn(async () => {}),
  } satisfies DbClient;

  return { client, queries, reservedSql, release };
}

describe("runDatabaseMigrations", () => {
  it("acquires a PostgreSQL advisory lock, runs Drizzle migrations, and always releases the lock", async () => {
    const { client, queries, release } = createMockDbClient();
    const migrateFn = vi.fn(async () => {
      queries.push("migrate");
    });

    await runDatabaseMigrations(client, { migrateFn });

    expect(migrateFn).toHaveBeenCalledTimes(1);
    expect(migrateFn).toHaveBeenCalledWith(client.db, {
      migrationsFolder: DEFAULT_MIGRATIONS_FOLDER,
    });
    expect(queries).toEqual([
      `SELECT pg_advisory_lock(${DB_MIGRATIONS_LOCK_KEY})`,
      "migrate",
      `SELECT pg_advisory_unlock(${DB_MIGRATIONS_LOCK_KEY})`,
      "release",
    ]);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("unlocks and releases the reserved connection even when migrations fail", async () => {
    const { client, queries, release } = createMockDbClient();
    const migrateFn = vi.fn(async () => {
      queries.push("migrate-fail");
      throw new Error("boom migration");
    });

    await expect(
      runDatabaseMigrations(client, {
        migrationsFolder: "/custom/drizzle",
        lockKey: 999,
        migrateFn,
      }),
    ).rejects.toThrow("boom migration");

    expect(migrateFn).toHaveBeenCalledWith(client.db, {
      migrationsFolder: "/custom/drizzle",
    });
    expect(queries).toEqual([
      "SELECT pg_advisory_lock(999)",
      "migrate-fail",
      "SELECT pg_advisory_unlock(999)",
      "release",
    ]);
    expect(release).toHaveBeenCalledTimes(1);
  });
});

describe("applyStartupMigrationsIfEnabled", () => {
  it("runs migrations when enabled and skips them when disabled", async () => {
    const { client } = createMockDbClient();
    const migrateFn = vi.fn(async () => {});

    const skipped = await applyStartupMigrationsIfEnabled(client, false, {
      migrateFn,
    });
    expect(skipped).toBe(false);
    expect(migrateFn).not.toHaveBeenCalled();

    const applied = await applyStartupMigrationsIfEnabled(client, true, {
      migrateFn,
    });
    expect(applied).toBe(true);
    expect(migrateFn).toHaveBeenCalledTimes(1);
  });
});
