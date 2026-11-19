import {
  type FxRateSnapshot,
  fxRateSnapshotSchema,
  normalizeCurrencyCode,
} from "@agenticf/domain";
import { and, desc, eq, sql } from "drizzle-orm";
import type { ReservedSql } from "postgres";
import type { DbClient } from "../db/client.js";
import { fxRates } from "../db/schema/fx.js";
import type { FxProvider } from "./providers.js";

export interface FxRatesRepository {
  getLatestSnapshot(pivotCurrency: string): Promise<FxRateSnapshot | null>;
  upsertSnapshot(snapshot: FxRateSnapshot): Promise<void>;
}

export interface AdvisoryLock {
  tryAcquire(): Promise<boolean>;
  release(): Promise<void>;
}

export type FxRefreshResult =
  | { readonly refreshed: true; readonly snapshot: FxRateSnapshot }
  | { readonly refreshed: false; readonly reason: "lock_busy" };

export interface FxServiceOptions {
  repository: FxRatesRepository;
  provider: FxProvider;
  advisoryLock: AdvisoryLock;
  pivotCurrency?: string;
}

export class FxService {
  private readonly repository: FxRatesRepository;
  private readonly provider: FxProvider;
  private readonly advisoryLock: AdvisoryLock;
  private readonly pivotCurrency: string;

  constructor(options: FxServiceOptions) {
    this.repository = options.repository;
    this.provider = options.provider;
    this.advisoryLock = options.advisoryLock;
    this.pivotCurrency = normalizeCurrencyCode(options.pivotCurrency ?? "EUR");
  }

  async getLatestSnapshot(): Promise<FxRateSnapshot | null> {
    const cached = await this.repository.getLatestSnapshot(this.pivotCurrency);
    if (cached) {
      return cached;
    }

    const refreshed = await this.refreshDailyRates();
    if (refreshed.refreshed) {
      return refreshed.snapshot;
    }

    return this.repository.getLatestSnapshot(this.pivotCurrency);
  }

  async refreshDailyRates(): Promise<FxRefreshResult> {
    const acquired = await this.advisoryLock.tryAcquire();
    if (!acquired) {
      return { refreshed: false, reason: "lock_busy" };
    }

    try {
      const snapshot = await this.provider.fetchLatest(this.pivotCurrency);
      await this.repository.upsertSnapshot(snapshot);
      return { refreshed: true, snapshot };
    } finally {
      await this.advisoryLock.release();
    }
  }
}

export class PostgresFxRatesRepository implements FxRatesRepository {
  constructor(private readonly dbClient: DbClient) {}

  async getLatestSnapshot(
    pivotCurrency: string,
  ): Promise<FxRateSnapshot | null> {
    const pivot = normalizeCurrencyCode(pivotCurrency);
    const latestDateRow = await this.dbClient.db
      .select({ rateDate: fxRates.rateDate })
      .from(fxRates)
      .where(eq(fxRates.pivotCurrency, pivot))
      .orderBy(desc(fxRates.rateDate))
      .limit(1);

    const latestDate = latestDateRow[0]?.rateDate;
    if (!latestDate) {
      return null;
    }

    const rows = await this.dbClient.db
      .select()
      .from(fxRates)
      .where(
        and(eq(fxRates.pivotCurrency, pivot), eq(fxRates.rateDate, latestDate)),
      );

    if (rows.length === 0) {
      return null;
    }

    const rates: Record<string, string> = {};
    let latestFetchedAt = rows[0]?.fetchedAt ?? new Date();
    const provider = rows[0]?.provider ?? "unknown";

    for (const row of rows) {
      rates[row.quoteCurrency] = row.rate.replace(
        /(\.\d*?[1-9])0+$|\.0+$/,
        "$1",
      );
      if (row.fetchedAt > latestFetchedAt) {
        latestFetchedAt = row.fetchedAt;
      }
    }

    return fxRateSnapshotSchema.parse({
      pivotCurrency: pivot,
      rateDate: latestDate,
      provider,
      fetchedAt: latestFetchedAt.toISOString(),
      rates,
    });
  }

  async upsertSnapshot(snapshot: FxRateSnapshot): Promise<void> {
    const fetchedAt = new Date(snapshot.fetchedAt);
    const entries = Object.entries(snapshot.rates).map(
      ([quoteCurrency, rate]) => ({
        pivotCurrency: snapshot.pivotCurrency,
        quoteCurrency,
        rate,
        rateDate: snapshot.rateDate,
        provider: snapshot.provider,
        fetchedAt,
      }),
    );

    if (entries.length === 0) {
      return;
    }

    await this.dbClient.db
      .insert(fxRates)
      .values(entries)
      .onConflictDoUpdate({
        target: [
          fxRates.pivotCurrency,
          fxRates.quoteCurrency,
          fxRates.rateDate,
        ],
        set: {
          rate: sql`excluded.rate`,
          provider: sql`excluded.provider`,
          fetchedAt: sql`excluded.fetched_at`,
        },
      });
  }
}

/** Stable 32-bit advisory lock ID reserved for daily FX refresh across stateless replicas. */
export const FX_REFRESH_ADVISORY_LOCK_KEY = 420_006;

export class PostgresAdvisoryLock implements AdvisoryLock {
  private reserved: ReservedSql | null = null;

  constructor(
    private readonly dbClient: DbClient,
    private readonly lockKey: number = FX_REFRESH_ADVISORY_LOCK_KEY,
  ) {}

  async tryAcquire(): Promise<boolean> {
    const connection = await this.dbClient.sql.reserve();
    try {
      const rows = await connection<{ locked: boolean }[]>`
        SELECT pg_try_advisory_lock(${this.lockKey}) AS locked
      `;
      const locked = Boolean(rows[0]?.locked);
      if (!locked) {
        connection.release();
        return false;
      }
      this.reserved = connection;
      return true;
    } catch (error) {
      connection.release();
      throw error;
    }
  }

  async release(): Promise<void> {
    if (!this.reserved) {
      return;
    }
    const connection = this.reserved;
    this.reserved = null;
    try {
      await connection`SELECT pg_advisory_unlock(${this.lockKey})`;
    } finally {
      connection.release();
    }
  }
}
