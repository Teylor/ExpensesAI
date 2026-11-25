import { DEFAULT_USER_PREFERENCES } from "@agenticf/domain";
import { describe, expect, it } from "vitest";
import type { CommandHistoryItemDto } from "../api/client.js";
import type { OutboxEntry } from "../offline/db.js";
import { projectHistory } from "./actions.js";

const localPending: OutboxEntry = {
  commandId: "cmd-local-pending",
  envelope: {
    commandId: "cmd-local-pending",
    actor: "manual",
    issuedAtUtc: "2026-11-23T10:00:00.000Z",
    type: "account.create",
    payload: {
      accountId: "10000000-0000-4000-8000-000000000002",
      name: "USD Cash",
      accountType: "bank",
      currency: "USD",
      initialBalance: "75",
    },
  },
  status: "pending",
  attempts: 0,
  lastError: null,
  enqueuedAt: "2026-11-23T10:00:00.000Z",
  syncedAt: null,
};

const localSynced: OutboxEntry = {
  commandId: "cmd-local-synced",
  envelope: {
    commandId: "cmd-local-synced",
    actor: "agent",
    issuedAtUtc: "2026-11-23T09:00:00.000Z",
    type: "transaction.record",
    payload: {
      transactionId: "30000000-0000-4000-8000-000000000001",
      kind: "income",
      accountId: "10000000-0000-4000-8000-000000000001",
      amount: "2000.25",
      currency: "EUR",
      description: "Pago proyecto",
      source: "manual",
    },
  },
  status: "synced",
  attempts: 1,
  lastError: null,
  enqueuedAt: "2026-11-23T09:00:00.000Z",
  syncedAt: "2026-11-23T09:00:00.000Z",
};

const localFailed: OutboxEntry = {
  commandId: "cmd-local-failed",
  envelope: {
    commandId: "cmd-local-failed",
    actor: "system",
    issuedAtUtc: "2026-11-23T08:00:00.000Z",
    type: "account.create",
    payload: {
      accountId: "10000000-0000-4000-8000-000000000003",
      name: "Caja",
      accountType: "cash",
      currency: "EUR",
      initialBalance: "0",
    },
  },
  status: "failed",
  attempts: 3,
  lastError: "ACCOUNT_CURRENCY_MISMATCH",
  enqueuedAt: "2026-11-23T08:00:00.000Z",
  syncedAt: null,
};

const localUndone: OutboxEntry = {
  commandId: "cmd-local-undone",
  envelope: {
    commandId: "cmd-local-undone",
    actor: "manual",
    issuedAtUtc: "2026-11-23T07:00:00.000Z",
    type: "category.upsert",
    payload: {
      scope: "expense",
      name: "Cenas",
    },
  },
  status: "undone",
  attempts: 0,
  lastError: null,
  enqueuedAt: "2026-11-23T07:00:00.000Z",
  syncedAt: null,
  undoneAt: "2026-11-23T07:30:00.000Z",
};

const serverItems: CommandHistoryItemDto[] = [
  {
    commandId: "cmd-local-pending",
    actor: "agent",
    commandType: "account.create",
    createdAt: "2026-11-23T10:00:00.000Z",
    undoneAt: null,
    canUndo: true,
    payload: {
      accountId: "10000000-0000-4000-8000-000000000002",
      name: "USD Cash",
      accountType: "bank",
      currency: "USD",
      initialBalance: "75",
    },
    result: {},
  },
  {
    commandId: "cmd-server-newest",
    actor: "system",
    commandType: "transaction.delete",
    createdAt: "2026-11-23T11:00:00.000Z",
    undoneAt: null,
    canUndo: true,
    payload: {
      transactionId: "30000000-0000-4000-8000-000000000009",
    },
    result: {},
  },
  {
    commandId: "cmd-server-undone",
    actor: "manual",
    commandType: "category.delete",
    createdAt: "2026-11-23T06:00:00.000Z",
    undoneAt: "2026-11-23T06:30:00.000Z",
    canUndo: false,
    payload: {
      categoryId: "20000000-0000-4000-8000-000000000009",
    },
    result: {},
  },
];

describe("projectHistory (unified local outbox + server history projection)", () => {
  it("deduplicates by commandId with local entries winning, newest first", () => {
    const result = projectHistory({
      localEntries: [localPending, localSynced, localFailed, localUndone],
      serverItems,
      preferences: DEFAULT_USER_PREFERENCES,
      filter: "all",
    });

    expect(result.items.map((i) => i.commandId)).toEqual([
      "cmd-server-newest",
      "cmd-local-pending",
      "cmd-local-synced",
      "cmd-local-failed",
      "cmd-local-undone",
      "cmd-server-undone",
    ]);
    expect(result.items.map((i) => i.source)).toEqual([
      "server",
      "local",
      "local",
      "local",
      "local",
      "server",
    ]);
    expect(result.counts).toEqual({ all: 6, active: 4, undone: 2 });
  });

  it("resolves localized summaries and undo flags per lifecycle state", () => {
    const result = projectHistory({
      localEntries: [localPending, localSynced, localFailed, localUndone],
      serverItems,
      preferences: DEFAULT_USER_PREFERENCES,
      filter: "all",
    });
    const byId = new Map(result.items.map((i) => [i.commandId, i]));

    const pending = byId.get("cmd-local-pending");
    expect(pending?.status).toBe("pending");
    expect(pending?.actor).toBe("manual");
    expect(pending?.summary).toBe("Cuenta USD Cash (Banco) creada");
    expect(pending?.canUndo).toBe(true);
    expect(pending?.requiresOnlineToUndo).toBe(false);
    expect(pending?.undoneAt).toBeNull();

    const synced = byId.get("cmd-local-synced");
    expect(synced?.status).toBe("synced");
    expect(synced?.summary).toBe("Nuevo ingreso de 2.000,25 € (Pago proyecto)");
    expect(synced?.canUndo).toBe(true);
    expect(synced?.requiresOnlineToUndo).toBe(true);

    const failed = byId.get("cmd-local-failed");
    expect(failed?.status).toBe("failed");
    expect(failed?.canUndo).toBe(false);
    expect(failed?.requiresOnlineToUndo).toBe(false);

    const undoneLocal = byId.get("cmd-local-undone");
    expect(undoneLocal?.status).toBe("undone");
    expect(undoneLocal?.undoneAt).toBe("2026-11-23T07:30:00.000Z");
    expect(undoneLocal?.canUndo).toBe(false);

    const serverNewest = byId.get("cmd-server-newest");
    expect(serverNewest?.source).toBe("server");
    expect(serverNewest?.status).toBe("synced");
    expect(serverNewest?.summary).toBe("Movimiento eliminado");
    expect(serverNewest?.canUndo).toBe(true);
    expect(serverNewest?.requiresOnlineToUndo).toBe(true);

    const serverUndone = byId.get("cmd-server-undone");
    expect(serverUndone?.status).toBe("undone");
    expect(serverUndone?.undoneAt).toBe("2026-11-23T06:30:00.000Z");
    expect(serverUndone?.canUndo).toBe(false);
    expect(serverUndone?.requiresOnlineToUndo).toBe(false);
  });

  it("filters by all / active / undone while counts always reflect the full set", () => {
    const input = {
      localEntries: [localPending, localSynced, localFailed, localUndone],
      serverItems,
      preferences: DEFAULT_USER_PREFERENCES,
    } as const;

    const active = projectHistory({ ...input, filter: "active" });
    expect(active.items.map((i) => i.commandId)).toEqual([
      "cmd-server-newest",
      "cmd-local-pending",
      "cmd-local-synced",
      "cmd-local-failed",
    ]);
    expect(active.counts).toEqual({ all: 6, active: 4, undone: 2 });

    const undone = projectHistory({ ...input, filter: "undone" });
    expect(undone.items.map((i) => i.commandId)).toEqual([
      "cmd-local-undone",
      "cmd-server-undone",
    ]);
    expect(undone.counts).toEqual({ all: 6, active: 4, undone: 2 });
  });

  it("returns empty projection with zero counts when there is no history", () => {
    const result = projectHistory({
      localEntries: [],
      serverItems: [],
      preferences: DEFAULT_USER_PREFERENCES,
      filter: "all",
    });
    expect(result.items).toEqual([]);
    expect(result.counts).toEqual({ all: 0, active: 0, undone: 0 });
  });
});
