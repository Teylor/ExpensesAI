import { describe, expect, it } from "vitest";
import {
  CommandBus,
  type CommandLogEntry,
  type CommandLogRepository,
} from "../commands/bus.js";
import {
  AccountNotFoundError,
  type AccountsRepository,
  AccountsService,
  registerAccountCommandHandlers,
  type StoredAccount,
} from "./service.js";

function createInMemoryAccountsRepo(): AccountsRepository {
  const store = new Map<string, StoredAccount>();

  return {
    async listByUser(userId, includeArchived) {
      return [...store.values()].filter(
        (acc) => acc.userId === userId && (includeArchived || !acc.isArchived),
      );
    },
    async findById(userId, accountId) {
      const acc = store.get(accountId);
      if (!acc || acc.userId !== userId) return null;
      return acc;
    },
    async insert(account) {
      store.set(account.id, account);
    },
    async update(userId, accountId, patch) {
      const acc = store.get(accountId);
      if (!acc || acc.userId !== userId) return null;
      const updated: StoredAccount = { ...acc, ...patch };
      store.set(accountId, updated);
      return updated;
    },
    async deleteById(userId, accountId) {
      const acc = store.get(accountId);
      if (!acc || acc.userId !== userId) return false;
      store.delete(accountId);
      return true;
    },
  };
}

function createInMemoryCommandRepo(): CommandLogRepository {
  const entries = new Map<string, CommandLogEntry>();
  return {
    async findByCommandId(userId, commandId) {
      const entry = entries.get(commandId);
      return entry && entry.userId === userId ? entry : null;
    },
    async insert(entry) {
      entries.set(entry.commandId, entry);
    },
    async markUndone(userId, commandId, undoneByCommandId, undoneAt) {
      const entry = entries.get(commandId);
      if (!entry || entry.userId !== userId) return false;
      entries.set(commandId, { ...entry, undoneAt, undoneByCommandId });
      return true;
    },
    async listByUser(userId, limit) {
      return [...entries.values()]
        .filter((e) => e.userId === userId)
        .slice(0, limit);
    },
  };
}

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ACC_1 = "11111111-1111-4111-8111-111111111111";

describe("AccountsService + CommandBus handlers (create, update, archive, undo)", () => {
  it("creates, updates, archives, and reverses every account command via CommandBus Undo", async () => {
    const accountsService = new AccountsService({
      repository: createInMemoryAccountsRepo(),
    });
    const commandBus = new CommandBus({
      repository: createInMemoryCommandRepo(),
    });
    registerAccountCommandHandlers(commandBus, accountsService);

    // 1. Create account
    const createCmdId = "10000000-0000-4000-8000-000000000001";
    const created = await commandBus.dispatch(USER_A, {
      commandId: createCmdId,
      actor: "manual",
      issuedAtUtc: "2026-11-19T21:00:00.000Z",
      type: "account.create",
      payload: {
        accountId: ACC_1,
        name: "American Express",
        accountType: "credit",
        currency: "USD",
        initialBalance: "2000",
      },
    });
    expect(created.status).toBe("applied");

    const fetched = await accountsService.getAccount(USER_A, ACC_1);
    expect(fetched?.name).toBe("American Express");
    expect(fetched?.currentBalance).toBe("2000");

    // 2. Update account + Undo restores original name/type
    const updateCmdId = "10000000-0000-4000-8000-000000000002";
    await commandBus.dispatch(USER_A, {
      commandId: updateCmdId,
      actor: "agent",
      issuedAtUtc: "2026-11-19T21:01:00.000Z",
      type: "account.update",
      payload: {
        accountId: ACC_1,
        name: "Amex Platinum",
        accountType: "bank",
      },
    });
    expect((await accountsService.getAccount(USER_A, ACC_1))?.name).toBe(
      "Amex Platinum",
    );

    await commandBus.undo(USER_A, updateCmdId, "manual");
    const restored = await accountsService.getAccount(USER_A, ACC_1);
    expect(restored?.name).toBe("American Express");
    expect(restored?.accountType).toBe("credit");

    // 3. Archive account + Undo unarchives
    const archiveCmdId = "10000000-0000-4000-8000-000000000003";
    await commandBus.dispatch(USER_A, {
      commandId: archiveCmdId,
      actor: "manual",
      issuedAtUtc: "2026-11-19T21:02:00.000Z",
      type: "account.archive",
      payload: { accountId: ACC_1 },
    });
    expect((await accountsService.getAccount(USER_A, ACC_1))?.isArchived).toBe(
      true,
    );

    await commandBus.undo(USER_A, archiveCmdId, "manual");
    expect((await accountsService.getAccount(USER_A, ACC_1))?.isArchived).toBe(
      false,
    );

    // 4. Undo create deletes the account cleanly
    await commandBus.undo(USER_A, createCmdId, "manual");
    expect(await accountsService.getAccount(USER_A, ACC_1)).toBeNull();
  });

  it("enforces strict tenant isolation across users", async () => {
    const accountsService = new AccountsService({
      repository: createInMemoryAccountsRepo(),
    });
    const commandBus = new CommandBus({
      repository: createInMemoryCommandRepo(),
    });
    registerAccountCommandHandlers(commandBus, accountsService);

    await commandBus.dispatch(USER_A, {
      commandId: "20000000-0000-4000-8000-000000000001",
      actor: "manual",
      issuedAtUtc: "2026-11-19T21:00:00.000Z",
      type: "account.create",
      payload: {
        accountId: ACC_1,
        name: "Cuenta Privada",
        accountType: "bank",
        currency: "EUR",
        initialBalance: "5000",
      },
    });

    expect(await accountsService.getAccount(USER_B, ACC_1)).toBeNull();
    expect(await accountsService.listAccounts(USER_B, true)).toEqual([]);

    await expect(
      commandBus.dispatch(USER_B, {
        commandId: "20000000-0000-4000-8000-000000000002",
        actor: "manual",
        issuedAtUtc: "2026-11-19T21:01:00.000Z",
        type: "account.archive",
        payload: { accountId: ACC_1 },
      }),
    ).rejects.toThrow(AccountNotFoundError);
  });
});
