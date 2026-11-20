import {
  DEFAULT_USER_PREFERENCES,
  type FxRateSnapshot,
} from "@agenticf/domain";
import { describe, expect, it } from "vitest";
import {
  AccountNotFoundError,
  type AccountsRepository,
  AccountsService,
  type StoredAccount,
} from "../accounts/service.js";
import {
  CommandBus,
  type CommandLogEntry,
  type CommandLogRepository,
} from "../commands/bus.js";
import {
  AccountCurrencyMismatchError,
  registerTransactionCommandHandlers,
  type StoredTransaction,
  type TransactionsRepository,
  TransactionsService,
} from "./service.js";

const FX_SNAPSHOT: FxRateSnapshot = {
  pivotCurrency: "EUR",
  rateDate: "2026-11-19",
  provider: "frankfurter",
  fetchedAt: "2026-11-19T16:30:00.000Z",
  rates: {
    USD: "1.1",
  },
};

function createTestHarness() {
  const accStore = new Map<string, StoredAccount>();
  const accRepo: AccountsRepository = {
    async listByUser(userId, includeArchived) {
      return [...accStore.values()].filter(
        (a) => a.userId === userId && (includeArchived || !a.isArchived),
      );
    },
    async findById(userId, accountId) {
      const a = accStore.get(accountId);
      return a && a.userId === userId ? a : null;
    },
    async insert(account) {
      accStore.set(account.id, account);
    },
    async update(userId, accountId, patch) {
      const a = accStore.get(accountId);
      if (!a || a.userId !== userId) return null;
      const updated = { ...a, ...patch };
      accStore.set(accountId, updated);
      return updated;
    },
    async deleteById(userId, accountId) {
      const a = accStore.get(accountId);
      if (!a || a.userId !== userId) return false;
      accStore.delete(accountId);
      return true;
    },
  };

  const txStore = new Map<string, StoredTransaction>();
  const txRepo: TransactionsRepository = {
    async insert(tx) {
      txStore.set(tx.id, tx);
    },
    async findById(userId, txId, includeDeleted = false) {
      const tx = txStore.get(txId);
      if (!tx || tx.userId !== userId) return null;
      if (!includeDeleted && tx.deletedAt !== null) return null;
      return tx;
    },
    async setDeletedAt(userId, txId, deletedAt) {
      const tx = txStore.get(txId);
      if (!tx || tx.userId !== userId) return null;
      const updated = { ...tx, deletedAt };
      txStore.set(txId, updated);
      return updated;
    },
    async listByUser(userId, filters) {
      return [...txStore.values()]
        .filter((tx) => {
          if (tx.userId !== userId || tx.deletedAt !== null) return false;
          if (
            filters.accountId &&
            tx.accountId !== filters.accountId &&
            tx.destinationAccountId !== filters.accountId
          ) {
            return false;
          }
          if (filters.kind && tx.kind !== filters.kind) return false;
          if (filters.categoryId && tx.categoryId !== filters.categoryId) {
            return false;
          }
          if (filters.fromDate && tx.localDate < filters.fromDate) return false;
          if (filters.toDate && tx.localDate > filters.toDate) return false;
          return true;
        })
        .slice(0, filters.limit);
    },
  };

  const cmdEntries = new Map<string, CommandLogEntry>();
  const cmdRepo: CommandLogRepository = {
    async findByCommandId(userId, commandId) {
      const e = cmdEntries.get(commandId);
      return e && e.userId === userId ? e : null;
    },
    async insert(entry) {
      cmdEntries.set(entry.commandId, entry);
    },
    async markUndone(userId, commandId, undoneByCommandId, undoneAt) {
      const e = cmdEntries.get(commandId);
      if (!e || e.userId !== userId) return false;
      cmdEntries.set(commandId, { ...e, undoneAt, undoneByCommandId });
      return true;
    },
    async listByUser(userId, limit) {
      return [...cmdEntries.values()]
        .filter((e) => e.userId === userId)
        .slice(0, limit);
    },
  };

  const accountsService = new AccountsService({ repository: accRepo });
  const commandBus = new CommandBus({ repository: cmdRepo });
  const transactionsService = new TransactionsService({
    repository: txRepo,
    accountsRepository: accRepo,
    getUserPreferences: async () => DEFAULT_USER_PREFERENCES,
    fxRateReader: { getLatestSnapshot: async () => FX_SNAPSHOT },
  });

  registerTransactionCommandHandlers(commandBus, transactionsService);

  return { accountsService, transactionsService, commandBus };
}

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("TransactionsService + CommandBus handlers (income, expense, transfer, delete, undo)", () => {
  it("records income/expense updating balances accurately with timezone localDate, V2 hooks, and exact Undo", async () => {
    const { accountsService, transactionsService, commandBus } =
      createTestHarness();
    const bank = await accountsService.createAccount(USER_A, {
      name: "Banco Principal",
      accountType: "bank",
      currency: "EUR",
      initialBalance: "3000",
    });

    // Record income at 23:30 UTC -> 00:30 next day in Europe/Madrid!
    const incomeCmdId = "10000000-0000-4000-8000-000000000001";
    const incRes = await commandBus.dispatch(USER_A, {
      commandId: incomeCmdId,
      actor: "agent",
      issuedAtUtc: "2026-03-15T23:30:00.000Z",
      type: "transaction.record",
      payload: {
        kind: "income",
        accountId: bank.id,
        amount: "2000",
        currency: "EUR",
        description: "Pago de Y por trabajo X",
        clientOrPayee: "Cliente Y",
        occurredAtUtc: "2026-03-15T23:30:00.000Z",
        source: "agent",
        externalId: "ext-payroll-001",
      },
    });

    expect(
      (await accountsService.getAccount(USER_A, bank.id))?.currentBalance,
    ).toBe("5000");

    const list = await transactionsService.listTransactions(USER_A, {
      limit: 10,
    });
    expect(list).toHaveLength(1);
    expect(list[0]?.localDate).toBe("2026-03-16");
    expect(list[0]?.source).toBe("agent");
    expect(list[0]?.externalId).toBe("ext-payroll-001");

    // Record expense
    const expCmdId = "10000000-0000-4000-8000-000000000002";
    await commandBus.dispatch(USER_A, {
      commandId: expCmdId,
      actor: "manual",
      issuedAtUtc: "2026-03-16T10:00:00.000Z",
      type: "transaction.record",
      payload: {
        kind: "expense",
        accountId: bank.id,
        amount: "45.5",
        currency: "EUR",
        description: "Supermercado",
        source: "manual",
      },
    });
    expect(
      (await accountsService.getAccount(USER_A, bank.id))?.currentBalance,
    ).toBe("4954.5");

    // Delete income via transaction.delete -> reverses 2000; Undo delete -> restores 2000
    const delCmdId = "10000000-0000-4000-8000-000000000003";
    const txId = String(incRes.result.transactionId);
    await commandBus.dispatch(USER_A, {
      commandId: delCmdId,
      actor: "manual",
      issuedAtUtc: "2026-03-16T11:00:00.000Z",
      type: "transaction.delete",
      payload: { transactionId: txId },
    });
    expect(
      (await accountsService.getAccount(USER_A, bank.id))?.currentBalance,
    ).toBe("2954.5");

    await commandBus.undo(USER_A, delCmdId, "manual");
    expect(
      (await accountsService.getAccount(USER_A, bank.id))?.currentBalance,
    ).toBe("4954.5");

    // Undo expense and undo income -> returns to exact 3000
    await commandBus.undo(USER_A, expCmdId, "manual");
    await commandBus.undo(USER_A, incomeCmdId, "manual");
    expect(
      (await accountsService.getAccount(USER_A, bank.id))?.currentBalance,
    ).toBe("3000");
    expect(
      await transactionsService.listTransactions(USER_A, { limit: 10 }),
    ).toEqual([]);
  });

  it("handles same-currency and cross-currency transfers with exact reversible Undo", async () => {
    const { accountsService, commandBus } = createTestHarness();
    const bankEur = await accountsService.createAccount(USER_A, {
      name: "Banco EUR",
      accountType: "bank",
      currency: "EUR",
      initialBalance: "3000",
    });
    const amexUsd = await accountsService.createAccount(USER_A, {
      name: "Amex USD",
      accountType: "credit",
      currency: "USD",
      initialBalance: "1000",
    });

    // Transfer 1000 EUR -> auto-converted to 1100 USD via FX snapshot (1 EUR = 1.1 USD)
    const transferCmdId = "20000000-0000-4000-8000-000000000001";
    await commandBus.dispatch(USER_A, {
      commandId: transferCmdId,
      actor: "manual",
      issuedAtUtc: "2026-11-19T12:00:00.000Z",
      type: "transaction.transfer",
      payload: {
        fromAccountId: bankEur.id,
        toAccountId: amexUsd.id,
        amount: "1000",
        currency: "EUR",
        description: "Pago tarjeta USD",
      },
    });

    expect(
      (await accountsService.getAccount(USER_A, bankEur.id))?.currentBalance,
    ).toBe("2000");
    expect(
      (await accountsService.getAccount(USER_A, amexUsd.id))?.currentBalance,
    ).toBe("2100");

    // Undo transfer reverses both accounts accurately
    await commandBus.undo(USER_A, transferCmdId, "manual");
    expect(
      (await accountsService.getAccount(USER_A, bankEur.id))?.currentBalance,
    ).toBe("3000");
    expect(
      (await accountsService.getAccount(USER_A, amexUsd.id))?.currentBalance,
    ).toBe("1000");
  });

  it("rejects currency mismatch with account and enforces tenant isolation", async () => {
    const { accountsService, commandBus } = createTestHarness();
    const bankEur = await accountsService.createAccount(USER_A, {
      name: "Banco EUR",
      accountType: "bank",
      currency: "EUR",
      initialBalance: "1000",
    });

    await expect(
      commandBus.dispatch(USER_A, {
        commandId: "30000000-0000-4000-8000-000000000001",
        actor: "manual",
        issuedAtUtc: "2026-11-19T12:00:00.000Z",
        type: "transaction.record",
        payload: {
          kind: "expense",
          accountId: bankEur.id,
          amount: "50",
          currency: "USD",
          description: "Wrong currency",
          source: "manual",
        },
      }),
    ).rejects.toThrow(AccountCurrencyMismatchError);

    await expect(
      commandBus.dispatch(USER_B, {
        commandId: "30000000-0000-4000-8000-000000000002",
        actor: "manual",
        issuedAtUtc: "2026-11-19T12:00:00.000Z",
        type: "transaction.record",
        payload: {
          kind: "expense",
          accountId: bankEur.id,
          amount: "50",
          currency: "EUR",
          description: "Unauthorized account access",
          source: "manual",
        },
      }),
    ).rejects.toThrow(AccountNotFoundError);
  });
});
