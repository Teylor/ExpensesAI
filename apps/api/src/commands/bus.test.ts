import type { CommandEnvelope } from "@agenticf/domain";
import { describe, expect, it, vi } from "vitest";
import {
  CommandAlreadyUndoneError,
  CommandBus,
  CommandHandlerNotFoundError,
  type CommandLogEntry,
  type CommandLogRepository,
  CommandNotFoundError,
} from "./bus.js";

function createInMemoryCommandLogRepo(): CommandLogRepository {
  const entries = new Map<string, CommandLogEntry>();

  return {
    async findByCommandId(userId, commandId) {
      const entry = entries.get(commandId);
      if (!entry || entry.userId !== userId) {
        return null;
      }
      return entry;
    },
    async insert(entry) {
      entries.set(entry.commandId, entry);
    },
    async markUndone(userId, commandId, undoneByCommandId, undoneAt) {
      const entry = entries.get(commandId);
      if (!entry || entry.userId !== userId) {
        return false;
      }
      entries.set(commandId, {
        ...entry,
        undoneAt,
        undoneByCommandId,
      });
      return true;
    },
    async listByUser(userId, limit) {
      return [...entries.values()]
        .filter((entry) => entry.userId === userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit);
    },
  };
}

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CMD_1 = "11111111-1111-4111-8111-111111111111";
const CMD_2 = "22222222-2222-4222-8222-222222222222";
const ACCOUNT_ID = "33333333-3333-4333-8333-333333333333";

describe("CommandBus (idempotency, batch sync, global undo, tenant isolation)", () => {
  it("executes commands once and deduplicates retries with the same commandId", async () => {
    const repo = createInMemoryCommandLogRepo();
    const bus = new CommandBus({ repository: repo });
    const executeSpy = vi.fn(async () => ({
      result: { transactionId: "tx-1", appliedBalance: "5000" },
      inversePayload: { transactionId: "tx-1" },
    }));
    const undoSpy = vi.fn(async () => ({ reverted: true }));

    bus.registerHandler("transaction.record", {
      execute: executeSpy,
      undo: undoSpy,
    });

    const command: CommandEnvelope = {
      commandId: CMD_1,
      actor: "agent",
      issuedAtUtc: "2026-11-19T20:00:00.000Z",
      type: "transaction.record",
      payload: {
        kind: "income",
        accountId: ACCOUNT_ID,
        amount: "2000",
        currency: "EUR",
        description: "Pago de Y",
        source: "agent",
      },
    };

    const first = await bus.dispatch(USER_A, command);
    expect(first.status).toBe("applied");
    expect(first.result).toEqual({
      transactionId: "tx-1",
      appliedBalance: "5000",
    });

    // Re-dispatch same commandId (offline retry) -> duplicate, handler NOT called again
    const retry = await bus.dispatch(USER_A, command);
    expect(retry.status).toBe("duplicate");
    expect(retry.result).toEqual(first.result);
    expect(executeSpy).toHaveBeenCalledTimes(1);
  });

  it("undoes both manual and agent commands, blocks double-undo, and enforces userId isolation", async () => {
    const repo = createInMemoryCommandLogRepo();
    const bus = new CommandBus({ repository: repo });
    const undoSpy = vi.fn(async (_userId, inversePayload) => ({
      revertedPayload: inversePayload,
    }));

    bus.registerHandler("account.create", {
      execute: async () => ({
        result: { accountId: ACCOUNT_ID },
        inversePayload: { deleteAccountId: ACCOUNT_ID },
      }),
      undo: undoSpy,
    });

    const createCmd: CommandEnvelope = {
      commandId: CMD_1,
      actor: "manual",
      issuedAtUtc: "2026-11-19T20:00:00.000Z",
      type: "account.create",
      payload: {
        name: "Efectivo",
        accountType: "cash",
        currency: "EUR",
        initialBalance: "200",
      },
    };

    await bus.dispatch(USER_A, createCmd);

    // Another user cannot undo USER_A's command
    await expect(bus.undo(USER_B, CMD_1, "manual")).rejects.toThrow(
      CommandNotFoundError,
    );

    // USER_A undoes their own command
    const undone = await bus.undo(USER_A, CMD_1, "manual");
    expect(undone.undoneCommandId).toBe(CMD_1);
    expect(undoSpy).toHaveBeenCalledWith(USER_A, {
      deleteAccountId: ACCOUNT_ID,
    });

    // Second undo is blocked
    await expect(bus.undo(USER_A, CMD_1, "manual")).rejects.toThrow(
      CommandAlreadyUndoneError,
    );

    const history = await bus.listHistory(USER_A, 10);
    expect(history).toHaveLength(1);
    expect(history[0]?.canUndo).toBe(false);
    expect(history[0]?.undoneAt).not.toBeNull();
  });

  it("supports command.undo through dispatch and processes ordered offline batches", async () => {
    const repo = createInMemoryCommandLogRepo();
    const bus = new CommandBus({ repository: repo });

    bus.registerHandler("account.create", {
      execute: async () => ({
        result: { accountId: ACCOUNT_ID },
        inversePayload: { accountId: ACCOUNT_ID },
      }),
      undo: async () => ({ ok: true }),
    });

    const results = await bus.dispatchBatch(USER_A, [
      {
        commandId: CMD_1,
        actor: "manual",
        issuedAtUtc: "2026-11-19T20:00:00.000Z",
        type: "account.create",
        payload: {
          name: "Ahorro",
          accountType: "savings",
          currency: "EUR",
          initialBalance: "1000",
        },
      },
      {
        commandId: CMD_2,
        actor: "manual",
        issuedAtUtc: "2026-11-19T20:01:00.000Z",
        type: "command.undo",
        payload: {
          targetCommandId: CMD_1,
        },
      },
    ]);

    expect(results).toHaveLength(2);
    expect(results[0]?.status).toBe("applied");
    expect(results[1]?.status).toBe("applied");
  });

  it("exposes the persisted payload on history items so clients can render localized summaries", async () => {
    const repo = createInMemoryCommandLogRepo();
    const bus = new CommandBus({ repository: repo });

    bus.registerHandler("account.create", {
      execute: async () => ({
        result: { accountId: ACCOUNT_ID },
        inversePayload: { deleteAccountId: ACCOUNT_ID },
      }),
      undo: async () => ({ ok: true }),
    });

    await bus.dispatch(USER_A, {
      commandId: CMD_1,
      actor: "agent",
      issuedAtUtc: "2026-11-19T20:00:00.000Z",
      type: "account.create",
      payload: {
        name: "Efectivo",
        accountType: "cash",
        currency: "EUR",
        initialBalance: "200",
      },
    });

    const history = await bus.listHistory(USER_A, 10);
    expect(history).toHaveLength(1);
    expect(history[0]?.commandId).toBe(CMD_1);
    expect(history[0]?.actor).toBe("agent");
    expect(history[0]?.commandType).toBe("account.create");
    expect(history[0]?.canUndo).toBe(true);
    expect(history[0]?.payload).toEqual({
      name: "Efectivo",
      accountType: "cash",
      currency: "EUR",
      initialBalance: "200",
    });
  });

  it("throws CommandHandlerNotFoundError when no handler is registered for a command type", async () => {
    const bus = new CommandBus({ repository: createInMemoryCommandLogRepo() });

    await expect(
      bus.dispatch(USER_A, {
        commandId: CMD_1,
        actor: "manual",
        issuedAtUtc: "2026-11-19T20:00:00.000Z",
        type: "account.archive",
        payload: { accountId: ACCOUNT_ID },
      }),
    ).rejects.toThrow(CommandHandlerNotFoundError);
  });
});
