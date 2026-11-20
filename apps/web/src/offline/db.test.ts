import "fake-indexeddb/auto";
import { DEFAULT_USER_PREFERENCES } from "@agenticf/domain";
import { describe, expect, it } from "vitest";
import { createOfflineDb } from "./db.js";

describe("AgenticfOfflineDb (Dexie.js local storage)", () => {
  it("persists accounts, categories, transactions, fxCache, preferences, outbox, and purges all data on logout", async () => {
    const db = createOfflineDb(`agenticf_test_${Date.now()}`);

    try {
      await db.accounts.put({
        id: "10000000-0000-4000-8000-000000000001",
        name: "Banco Principal",
        accountType: "bank",
        currency: "EUR",
        balance: "3000",
        isArchived: false,
        updatedAt: "2026-11-19T22:00:00.000Z",
      });

      await db.categories.put({
        id: "20000000-0000-4000-8000-000000000001",
        scope: "investment",
        name: "ETF",
        icon: "layers",
        color: null,
        deletedAt: null,
        updatedAt: "2026-11-19T22:00:00.000Z",
      });

      await db.transactions.put({
        id: "30000000-0000-4000-8000-000000000001",
        kind: "income",
        accountId: "10000000-0000-4000-8000-000000000001",
        destinationAccountId: null,
        categoryId: null,
        amount: "2000",
        currency: "EUR",
        destinationAmount: null,
        destinationCurrency: null,
        fxRateToBase: "1",
        occurredAtUtc: "2026-11-19T22:00:00.000Z",
        localDate: "2026-11-19",
        timezone: "Europe/Madrid",
        description: "Trabajo X",
        clientOrPayee: "Empresa Y",
        source: "manual",
        externalId: null,
        deletedAt: null,
      });

      await db.saveFxSnapshot({
        pivotCurrency: "EUR",
        rateDate: "2026-11-19",
        provider: "frankfurter",
        fetchedAt: "2026-11-19T16:30:00.000Z",
        rates: { USD: "1.1" },
      });

      await db.savePreferences(DEFAULT_USER_PREFERENCES);

      await db.outbox.put({
        commandId: "40000000-0000-4000-8000-000000000001",
        envelope: {
          commandId: "40000000-0000-4000-8000-000000000001",
          actor: "manual",
          issuedAtUtc: "2026-11-19T22:00:00.000Z",
          type: "account.create",
          payload: {
            name: "Efectivo",
            accountType: "cash",
            currency: "EUR",
            initialBalance: "100",
          },
        },
        status: "pending",
        attempts: 0,
        lastError: null,
        enqueuedAt: "2026-11-19T22:00:00.000Z",
        syncedAt: null,
      });

      expect(await db.accounts.count()).toBe(1);
      expect(await db.categories.count()).toBe(1);
      expect(await db.transactions.count()).toBe(1);
      expect((await db.getLatestFxSnapshot())?.rates.USD).toBe("1.1");
      expect((await db.getPreferences()).baseCurrency).toBe("EUR");
      expect(await db.outbox.count()).toBe(1);

      // Logout clears all local IndexedDB stores
      await db.clearLocalUserData();

      expect(await db.accounts.count()).toBe(0);
      expect(await db.categories.count()).toBe(0);
      expect(await db.transactions.count()).toBe(0);
      expect(await db.getLatestFxSnapshot()).toBeNull();
      expect(await db.outbox.count()).toBe(0);
    } finally {
      await db.delete();
    }
  });
});
