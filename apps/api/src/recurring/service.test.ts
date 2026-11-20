import {
  DEFAULT_USER_PREFERENCES,
  type UserPreferences,
} from "@agenticf/domain";
import { describe, expect, it } from "vitest";
import {
  AccountNotFoundError,
  type AccountsRepository,
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
} from "../transactions/service.js";
import {
  type RecurringRepository,
  RecurringRuleNotFoundError,
  RecurringService,
  registerRecurringCommandHandlers,
  type StoredRecurringRule,
} from "./service.js";

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ACC_EUR_ID = "10000000-0000-4000-8000-000000000001";

function createTestHarness(initialNowIso = "2026-11-19T08:00:00.000Z") {
  let currentNow = new Date(initialNowIso);
  const now = () => currentNow;
  const setNow = (iso: string) => {
    currentNow = new Date(iso);
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

  const accStore = new Map<string, StoredAccount>();
  accStore.set(ACC_EUR_ID, {
    id: ACC_EUR_ID,
    userId: USER_A,
    name: "Banco Principal",
    accountType: "bank",
    currency: "EUR",
    initialBalance: "3000",
    currentBalance: "3000",
    isArchived: false,
    createdAt: currentNow,
    updatedAt: currentNow,
  });

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
      const updated: StoredAccount = { ...a, ...patch };
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
      const updated: StoredTransaction = { ...tx, deletedAt };
      txStore.set(txId, updated);
      return updated;
    },
    async listByUser(userId) {
      return [...txStore.values()].filter(
        (tx) => tx.userId === userId && tx.deletedAt === null,
      );
    },
  };

  const ruleStore = new Map<string, StoredRecurringRule>();
  const ruleRepo: RecurringRepository = {
    async listByUser(userId) {
      return [...ruleStore.values()].filter(
        (r) => r.userId === userId && r.deletedAt === null,
      );
    },
    async listAllActive() {
      return [...ruleStore.values()].filter(
        (r) => r.isActive && r.deletedAt === null,
      );
    },
    async findById(userId, ruleId, includeDeleted = false) {
      const r = ruleStore.get(ruleId);
      if (!r || r.userId !== userId) return null;
      if (!includeDeleted && r.deletedAt !== null) return null;
      return r;
    },
    async upsert(rule) {
      ruleStore.set(rule.id, rule);
    },
    async setDeletedAt(userId, ruleId, deletedAt) {
      const r = ruleStore.get(ruleId);
      if (!r || r.userId !== userId) return null;
      const updated: StoredRecurringRule = {
        ...r,
        deletedAt,
        updatedAt: currentNow,
      };
      ruleStore.set(ruleId, updated);
      return updated;
    },
  };

  let lockAvailable = true;
  const advisoryLock = {
    async withLock<T>(
      _lockKey: number,
      fn: () => Promise<T>,
    ): Promise<{ acquired: boolean; result?: T }> {
      if (!lockAvailable) {
        return { acquired: false };
      }
      const result = await fn();
      return { acquired: true, result };
    },
  };

  const getUserPreferences = async (
    _userId: string,
  ): Promise<UserPreferences> => DEFAULT_USER_PREFERENCES;

  const commandBus = new CommandBus({ repository: cmdRepo, now });
  const transactionsService = new TransactionsService({
    repository: txRepo,
    accountsRepository: accRepo,
    getUserPreferences,
    now,
  });
  const recurringService = new RecurringService({
    repository: ruleRepo,
    accountsRepository: accRepo,
    getUserPreferences,
    commandBus,
    advisoryLock,
    now,
  });

  registerTransactionCommandHandlers(commandBus, transactionsService);
  registerRecurringCommandHandlers(commandBus, recurringService);

  return {
    commandBus,
    accountsRepository: accRepo,
    transactionsService,
    recurringService,
    setNow,
    setLockAvailable: (v: boolean) => {
      lockAvailable = v;
    },
  };
}

describe("RecurringService + CommandBus handlers + AdvisoryLock worker", () => {
  it("creates, updates, deletes, and undoes recurring rules while validating account & currency", async () => {
    const { commandBus, recurringService } = createTestHarness();
    const ruleId = "90000000-0000-4000-8000-000000000001";

    // Reject unknown account or wrong currency
    await expect(
      commandBus.dispatch(USER_A, {
        commandId: "91000000-0000-4000-8000-000000000001",
        actor: "manual",
        issuedAtUtc: "2026-11-19T08:00:00.000Z",
        type: "recurring.upsert",
        payload: {
          kind: "income",
          accountId: "99999999-9999-4999-8999-999999999999",
          amount: "2500",
          currency: "EUR",
          frequency: "monthly",
          dayOfMonth: 25,
          description: "Nómina",
          isActive: true,
        },
      }),
    ).rejects.toThrow(AccountNotFoundError);

    await expect(
      commandBus.dispatch(USER_A, {
        commandId: "91000000-0000-4000-8000-000000000002",
        actor: "manual",
        issuedAtUtc: "2026-11-19T08:00:00.000Z",
        type: "recurring.upsert",
        payload: {
          kind: "income",
          accountId: ACC_EUR_ID,
          amount: "2500",
          currency: "USD",
          frequency: "monthly",
          dayOfMonth: 25,
          description: "Nómina USD",
          isActive: true,
        },
      }),
    ).rejects.toThrow(AccountCurrencyMismatchError);

    // Create rule due on the 25th -> nextDueLocalDate = 2026-11-25
    const createCmdId = "91000000-0000-4000-8000-000000000003";
    await commandBus.dispatch(USER_A, {
      commandId: createCmdId,
      actor: "manual",
      issuedAtUtc: "2026-11-19T08:00:00.000Z",
      type: "recurring.upsert",
      payload: {
        ruleId,
        kind: "income",
        accountId: ACC_EUR_ID,
        amount: "2500",
        currency: "EUR",
        frequency: "monthly",
        dayOfMonth: 25,
        description: "Nómina Mensual",
        isActive: true,
      },
    });

    const rules = await recurringService.listRules(USER_A);
    expect(rules).toHaveLength(1);
    expect(rules[0]?.nextDueLocalDate).toBe("2026-11-25");

    // Delete rule & Undo
    const delCmdId = "91000000-0000-4000-8000-000000000004";
    await commandBus.dispatch(USER_A, {
      commandId: delCmdId,
      actor: "manual",
      issuedAtUtc: "2026-11-19T08:05:00.000Z",
      type: "recurring.delete",
      payload: { ruleId },
    });
    expect(await recurringService.listRules(USER_A)).toHaveLength(0);

    await commandBus.undo(USER_A, delCmdId, "manual");
    expect(await recurringService.listRules(USER_A)).toHaveLength(1);

    // Tenant isolation: User B cannot delete User A's rule
    await expect(
      commandBus.dispatch(USER_B, {
        commandId: "91000000-0000-4000-8000-000000000005",
        actor: "manual",
        issuedAtUtc: "2026-11-19T08:06:00.000Z",
        type: "recurring.delete",
        payload: { ruleId },
      }),
    ).rejects.toThrow(RecurringRuleNotFoundError);
  });

  it("executes due recurring rules via PostgreSQL advisory lock & CommandBus without duplicating on the same localDate", async () => {
    const {
      commandBus,
      accountsRepository,
      transactionsService,
      recurringService,
      setNow,
      setLockAvailable,
    } = createTestHarness("2026-11-19T09:00:00.000Z");

    const rentRuleId = "92000000-0000-4000-8000-000000000001";
    await commandBus.dispatch(USER_A, {
      commandId: "92000000-0000-4000-8000-000000000002",
      actor: "manual",
      issuedAtUtc: "2026-11-19T09:00:00.000Z",
      type: "recurring.upsert",
      payload: {
        ruleId: rentRuleId,
        kind: "expense",
        accountId: ACC_EUR_ID,
        amount: "850",
        currency: "EUR",
        frequency: "monthly",
        dayOfMonth: 19,
        description: "Alquiler Piso",
        isActive: true,
      },
    });

    // If advisory lock is held by another container -> skipped
    setLockAvailable(false);
    const skippedRun = await recurringService.processDueRecurringRules();
    expect(skippedRun.skipped).toBe(true);
    expect(skippedRun.triggeredCount).toBe(0);

    // Lock available -> rule is due on 2026-11-19 -> dispatches transaction.record (source: recurring)
    setLockAvailable(true);
    const firstRun = await recurringService.processDueRecurringRules();
    expect(firstRun.skipped).toBe(false);
    expect(firstRun.triggeredCount).toBe(1);

    // Account balance dropped from 3000 to 2150 and transaction has source="recurring"
    expect(
      (await accountsRepository.findById(USER_A, ACC_EUR_ID))?.currentBalance,
    ).toBe("2150");
    const txs = await transactionsService.listTransactions(USER_A, {
      limit: 10,
    });
    expect(txs).toHaveLength(1);
    expect(txs[0]?.source).toBe("recurring");
    expect(txs[0]?.description).toBe("Alquiler Piso");

    // Rule advanced nextDueLocalDate to 2026-12-19 and recorded lastTriggeredLocalDate = 2026-11-19
    const updatedRule = (await recurringService.listRules(USER_A))[0];
    expect(updatedRule?.lastTriggeredLocalDate).toBe("2026-11-19");
    expect(updatedRule?.nextDueLocalDate).toBe("2026-12-19");

    // Running again on the same localDate does not duplicate
    const secondRun = await recurringService.processDueRecurringRules();
    expect(secondRun.triggeredCount).toBe(0);

    // Advance clock to 2026-12-19 -> triggers next month's rent (2150 - 850 = 1300)
    setNow("2026-12-19T09:00:00.000Z");
    const decRun = await recurringService.processDueRecurringRules();
    expect(decRun.triggeredCount).toBe(1);
    expect(
      (await accountsRepository.findById(USER_A, ACC_EUR_ID))?.currentBalance,
    ).toBe("1300");
  });
});
