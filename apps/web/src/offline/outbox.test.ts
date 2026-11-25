import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createOfflineDb } from "./db.js";
import {
  OutboxPermanentError,
  OutboxSyncEngine,
  OutboxTransientError,
  type OutboxTransport,
} from "./outbox.js";

const ACC_EUR_ID = "10000000-0000-4000-8000-000000000001";
const ACC_USD_ID = "10000000-0000-4000-8000-000000000002";
const TX_INCOME_ID = "30000000-0000-4000-8000-000000000001";
const TX_EXPENSE_ID = "30000000-0000-4000-8000-000000000002";
const TX_TRANSFER_ID = "30000000-0000-4000-8000-000000000003";

describe("OutboxSyncEngine (Optimistic decimal.js execution, FIFO sync, retry & Undo)", () => {
  it("applies optimistic mutations with decimal.js, deduplicates commandId, and supports offline Undo before sync", async () => {
    const db = createOfflineDb(`outbox_opt_${Date.now()}`);
    const transport: OutboxTransport = {
      async sendBatch(commands) {
        return commands.map((c) => ({
          commandId: c.commandId,
          status: "applied" as const,
        }));
      },
      async undoCommand() {
        // Not called for pending offline undo
      },
    };
    const engine = new OutboxSyncEngine({ db, transport });

    try {
      const createAccCmd = {
        commandId: "50000000-0000-4000-8000-000000000001",
        actor: "manual" as const,
        issuedAtUtc: "2026-11-19T10:00:00.000Z",
        type: "account.create" as const,
        payload: {
          accountId: ACC_EUR_ID,
          name: "Cuenta Principal",
          accountType: "bank" as const,
          currency: "EUR",
          initialBalance: "3000.10",
        },
      };

      await engine.enqueueCommand(createAccCmd);
      // Duplicate enqueue with same commandId must be idempotent
      await engine.enqueueCommand(createAccCmd);

      expect((await db.accounts.get(ACC_EUR_ID))?.balance).toBe("3000.1");
      expect(await engine.getPendingCount()).toBe(1);

      // Record income +2000.25 -> 5000.35
      const incomeCmdId = "50000000-0000-4000-8000-000000000002";
      await engine.enqueueCommand({
        commandId: incomeCmdId,
        actor: "manual",
        issuedAtUtc: "2026-11-19T11:00:00.000Z",
        type: "transaction.record",
        payload: {
          transactionId: TX_INCOME_ID,
          kind: "income",
          accountId: ACC_EUR_ID,
          amount: "2000.25",
          currency: "EUR",
          description: "Pago proyecto",
          source: "manual",
        },
      });

      expect((await db.accounts.get(ACC_EUR_ID))?.balance).toBe("5000.35");

      // Offline Undo of the pending income command reverts balance to 3000.1 and
      // retains the outbox row as status "undone" (never deleted)
      await engine.undoCommand(incomeCmdId);
      expect((await db.accounts.get(ACC_EUR_ID))?.balance).toBe("3000.1");
      expect(await db.transactions.get(TX_INCOME_ID)).toBeUndefined();
      expect(await engine.getPendingCount()).toBe(1);
      const undoneIncomeEntry = await db.outbox.get(incomeCmdId);
      expect(undoneIncomeEntry?.status).toBe("undone");
      expect(undoneIncomeEntry?.undoneAt).not.toBeNull();
    } finally {
      await db.delete();
    }
  });

  it("retries transient network failures, syncs FIFO batch idempotently, and supports online Undo after sync", async () => {
    const db = createOfflineDb(`outbox_sync_${Date.now()}`);
    let shouldFailNetwork = true;
    const undoneRemoteIds: string[] = [];

    const transport: OutboxTransport = {
      async sendBatch(commands) {
        if (shouldFailNetwork) {
          throw new OutboxTransientError("Network offline");
        }
        return commands.map((c, idx) => ({
          commandId: c.commandId,
          status: idx === 0 ? ("duplicate" as const) : ("applied" as const),
        }));
      },
      async undoCommand(commandId) {
        undoneRemoteIds.push(commandId);
      },
    };

    const engine = new OutboxSyncEngine({ db, transport });

    try {
      await engine.enqueueCommand({
        commandId: "60000000-0000-4000-8000-000000000001",
        actor: "manual",
        issuedAtUtc: "2026-11-19T10:00:00.000Z",
        type: "account.create",
        payload: {
          accountId: ACC_EUR_ID,
          name: "Banco EUR",
          accountType: "bank",
          currency: "EUR",
          initialBalance: "1000",
        },
      });

      await engine.enqueueCommand({
        commandId: "60000000-0000-4000-8000-000000000002",
        actor: "manual",
        issuedAtUtc: "2026-11-19T10:01:00.000Z",
        type: "account.create",
        payload: {
          accountId: ACC_USD_ID,
          name: "Cuenta USD",
          accountType: "bank",
          currency: "USD",
          initialBalance: "500",
        },
      });

      const expenseCmdId = "60000000-0000-4000-8000-000000000003";
      await engine.enqueueCommand({
        commandId: expenseCmdId,
        actor: "manual",
        issuedAtUtc: "2026-11-19T10:02:00.000Z",
        type: "transaction.record",
        payload: {
          transactionId: TX_EXPENSE_ID,
          kind: "expense",
          accountId: ACC_EUR_ID,
          amount: "150.40",
          currency: "EUR",
          description: "Cena equipo",
          source: "manual",
        },
      });

      await engine.enqueueCommand({
        commandId: "60000000-0000-4000-8000-000000000004",
        actor: "manual",
        issuedAtUtc: "2026-11-19T10:03:00.000Z",
        type: "transaction.transfer",
        payload: {
          transactionId: TX_TRANSFER_ID,
          fromAccountId: ACC_EUR_ID,
          toAccountId: ACC_USD_ID,
          amount: "200",
          currency: "EUR",
          destinationAmount: "220",
        },
      });

      expect((await db.accounts.get(ACC_EUR_ID))?.balance).toBe("649.6");
      expect((await db.accounts.get(ACC_USD_ID))?.balance).toBe("720");

      // First sync fails due to offline network -> items stay pending with attempts=1
      const failedSync = await engine.syncPending();
      expect(failedSync.syncedCount).toBe(0);
      expect(failedSync.pendingCount).toBe(4);
      const firstEntry = await db.outbox.get(
        "60000000-0000-4000-8000-000000000001",
      );
      expect(firstEntry?.status).toBe("pending");
      expect(firstEntry?.attempts).toBe(1);

      // Network recovers -> all 4 commands sync cleanly
      shouldFailNetwork = false;
      const okSync = await engine.syncPending();
      expect(okSync.syncedCount).toBe(4);
      expect(okSync.pendingCount).toBe(0);
      expect(await db.getLastSyncAt()).not.toBeNull();

      // Online Undo of already synced expense command calls transport.undoCommand and reverts local balance
      await engine.undoCommand(expenseCmdId);
      expect(undoneRemoteIds).toEqual([expenseCmdId]);
      expect((await db.accounts.get(ACC_EUR_ID))?.balance).toBe("800");
      const undoneExpenseEntry = await db.outbox.get(expenseCmdId);
      expect(undoneExpenseEntry?.status).toBe("undone");
      expect(undoneExpenseEntry?.undoneAt).not.toBeNull();
      expect(await engine.getPendingCount()).toBe(0);
    } finally {
      await db.delete();
    }
  });

  it("marks permanently rejected commands as 'failed' so they do not block future syncs", async () => {
    const db = createOfflineDb(`outbox_perm_${Date.now()}`);
    const transport: OutboxTransport = {
      async sendBatch() {
        throw new OutboxPermanentError("ACCOUNT_CURRENCY_MISMATCH");
      },
      async undoCommand() {},
    };
    const engine = new OutboxSyncEngine({ db, transport });

    try {
      const badCmdId = "70000000-0000-4000-8000-000000000001";
      await engine.enqueueCommand({
        commandId: badCmdId,
        actor: "manual",
        issuedAtUtc: "2026-11-19T12:00:00.000Z",
        type: "account.create",
        payload: {
          accountId: ACC_EUR_ID,
          name: "Cuenta",
          accountType: "bank",
          currency: "EUR",
          initialBalance: "0",
        },
      });

      const res = await engine.syncPending();
      expect(res.syncedCount).toBe(0);
      expect(res.pendingCount).toBe(0);
      const entry = await db.outbox.get(badCmdId);
      expect(entry?.status).toBe("failed");
      expect(entry?.lastError).toContain("ACCOUNT_CURRENCY_MISMATCH");
    } finally {
      await db.delete();
    }
  });

  it("treats undoing an already-undone outbox entry as a no-op and keeps undone rows out of sync", async () => {
    const db = createOfflineDb(`outbox_undone_${Date.now()}`);
    const undoneRemoteIds: string[] = [];
    const transport: OutboxTransport = {
      async sendBatch(commands) {
        return commands.map((c) => ({
          commandId: c.commandId,
          status: "applied" as const,
        }));
      },
      async undoCommand(commandId) {
        undoneRemoteIds.push(commandId);
      },
    };
    const engine = new OutboxSyncEngine({
      db,
      transport,
      now: () => new Date("2026-11-23T10:00:00.000Z"),
    });

    try {
      const cmdId = "80000000-0000-4000-8000-000000000001";
      await engine.enqueueCommand({
        commandId: cmdId,
        actor: "agent",
        issuedAtUtc: "2026-11-23T09:00:00.000Z",
        type: "account.create",
        payload: {
          accountId: ACC_USD_ID,
          name: "USD Cash",
          accountType: "bank",
          currency: "USD",
          initialBalance: "75",
        },
      });

      // Sync to the server first so the entry becomes "synced"
      const sync = await engine.syncPending();
      expect(sync.pendingCount).toBe(0);
      expect((await db.outbox.get(cmdId))?.status).toBe("synced");

      // Undoing a synced entry calls the remote transport and retains it as "undone"
      await engine.undoCommand(cmdId);
      expect(undoneRemoteIds).toEqual([cmdId]);
      let undoneEntry = await db.outbox.get(cmdId);
      expect(undoneEntry?.status).toBe("undone");
      expect(undoneEntry?.undoneAt).toBe("2026-11-23T10:00:00.000Z");

      // Undoing again is a no-op: no extra remote call, state untouched
      await engine.undoCommand(cmdId);
      expect(undoneRemoteIds).toEqual([cmdId]);
      undoneEntry = await db.outbox.get(cmdId);
      expect(undoneEntry?.status).toBe("undone");
      expect(undoneEntry?.undoneAt).toBe("2026-11-23T10:00:00.000Z");

      // Undone rows never join sync runs or count as pending
      const after = await engine.syncPending();
      expect(after.pendingCount).toBe(0);
      expect(after.syncedCount).toBe(0);
      expect(await engine.getPendingCount()).toBe(0);
    } finally {
      await db.delete();
    }
  });
});
