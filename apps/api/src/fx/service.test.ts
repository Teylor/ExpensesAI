import type { FxRateSnapshot } from "@agenticf/domain";
import { describe, expect, it, vi } from "vitest";
import type { FxProvider } from "./providers.js";
import {
  type AdvisoryLock,
  type FxRatesRepository,
  FxService,
} from "./service.js";

const MOCK_SNAPSHOT: FxRateSnapshot = {
  pivotCurrency: "EUR",
  rateDate: "2026-11-19",
  provider: "frankfurter",
  fetchedAt: "2026-11-19T16:30:00.000Z",
  rates: {
    USD: "1.1",
    JPY: "165",
  },
};

function createMemoryRepo(
  initial: FxRateSnapshot | null = null,
): FxRatesRepository {
  let stored = initial;
  return {
    getLatestSnapshot: vi.fn(async () => stored),
    upsertSnapshot: vi.fn(async (snapshot) => {
      stored = snapshot;
    }),
  };
}

function createMockLock(acquired = true): AdvisoryLock & {
  tryAcquire: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
} {
  return {
    tryAcquire: vi.fn(async () => acquired),
    release: vi.fn(async () => {}),
  };
}

describe("FxService (cache, refresh, and PostgreSQL advisory lock coordination)", () => {
  it("returns cached snapshot from repository without calling upstream provider", async () => {
    const repo = createMemoryRepo(MOCK_SNAPSHOT);
    const provider: FxProvider = {
      name: "mock",
      fetchLatest: vi.fn(async () => MOCK_SNAPSHOT),
    };
    const service = new FxService({
      repository: repo,
      provider,
      advisoryLock: createMockLock(true),
    });

    const result = await service.getLatestSnapshot();

    expect(result).toEqual(MOCK_SNAPSHOT);
    expect(provider.fetchLatest).not.toHaveBeenCalled();
  });

  it("bootstraps rates on first call when cache is empty", async () => {
    const repo = createMemoryRepo(null);
    const provider: FxProvider = {
      name: "mock",
      fetchLatest: vi.fn(async () => MOCK_SNAPSHOT),
    };
    const lock = createMockLock(true);
    const service = new FxService({
      repository: repo,
      provider,
      advisoryLock: lock,
    });

    const result = await service.getLatestSnapshot();

    expect(result).toEqual(MOCK_SNAPSHOT);
    expect(provider.fetchLatest).toHaveBeenCalledWith("EUR");
    expect(repo.upsertSnapshot).toHaveBeenCalledWith(MOCK_SNAPSHOT);
    expect(lock.release).toHaveBeenCalledTimes(1);
  });

  it("skips upstream refresh when another replica holds the advisory lock", async () => {
    const repo = createMemoryRepo(MOCK_SNAPSHOT);
    const provider: FxProvider = {
      name: "mock",
      fetchLatest: vi.fn(async () => MOCK_SNAPSHOT),
    };
    const lock = createMockLock(false);
    const service = new FxService({
      repository: repo,
      provider,
      advisoryLock: lock,
    });

    const outcome = await service.refreshDailyRates();

    expect(outcome).toEqual({ refreshed: false, reason: "lock_busy" });
    expect(provider.fetchLatest).not.toHaveBeenCalled();
    expect(lock.release).not.toHaveBeenCalled();
  });

  it("always releases advisory lock even if provider throws", async () => {
    const repo = createMemoryRepo(null);
    const provider: FxProvider = {
      name: "mock",
      fetchLatest: vi.fn(async () => {
        throw new Error("upstream unavailable");
      }),
    };
    const lock = createMockLock(true);
    const service = new FxService({
      repository: repo,
      provider,
      advisoryLock: lock,
    });

    await expect(service.refreshDailyRates()).rejects.toThrow(
      "upstream unavailable",
    );
    expect(lock.tryAcquire).toHaveBeenCalledTimes(1);
    expect(lock.release).toHaveBeenCalledTimes(1);
  });
});
