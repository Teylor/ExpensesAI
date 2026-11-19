import { randomUUID } from "node:crypto";
import {
  type AccountType,
  createMoney,
  normalizeCurrencyCode,
  toDbNumericString,
} from "@agenticf/domain";
import { and, asc, eq } from "drizzle-orm";
import type { CommandBus } from "../commands/bus.js";
import type { DbClient } from "../db/client.js";
import { accounts } from "../db/schema/accounts.js";

export interface StoredAccount {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly accountType: AccountType;
  readonly currency: string;
  readonly initialBalance: string;
  readonly currentBalance: string;
  readonly isArchived: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface AccountUpdatePatch {
  readonly name?: string;
  readonly accountType?: AccountType;
  readonly currentBalance?: string;
  readonly isArchived?: boolean;
  readonly updatedAt?: Date;
}

export interface AccountsRepository {
  listByUser(
    userId: string,
    includeArchived: boolean,
  ): Promise<StoredAccount[]>;
  findById(userId: string, accountId: string): Promise<StoredAccount | null>;
  insert(account: StoredAccount): Promise<void>;
  update(
    userId: string,
    accountId: string,
    patch: AccountUpdatePatch,
  ): Promise<StoredAccount | null>;
  deleteById(userId: string, accountId: string): Promise<boolean>;
}

export class AccountNotFoundError extends Error {
  constructor(accountId: string) {
    super(`Account "${accountId}" not found`);
    this.name = "AccountNotFoundError";
  }
}

export interface AccountsServiceOptions {
  repository: AccountsRepository;
  now?: () => Date;
}

function normalizeStoredAmount(raw: string): string {
  const trimmed = raw.replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
  return trimmed === "-0" ? "0" : trimmed;
}

export class AccountsService {
  private readonly repository: AccountsRepository;
  private readonly now: () => Date;

  constructor(options: AccountsServiceOptions) {
    this.repository = options.repository;
    this.now = options.now ?? (() => new Date());
  }

  async listAccounts(
    userId: string,
    includeArchived = false,
  ): Promise<StoredAccount[]> {
    return this.repository.listByUser(userId, includeArchived);
  }

  async getAccount(
    userId: string,
    accountId: string,
  ): Promise<StoredAccount | null> {
    return this.repository.findById(userId, accountId);
  }

  async createAccount(
    userId: string,
    input: {
      accountId?: string;
      name: string;
      accountType: AccountType;
      currency: string;
      initialBalance: string;
    },
  ): Promise<StoredAccount> {
    const now = this.now();
    const currency = normalizeCurrencyCode(input.currency);
    const money = createMoney(input.initialBalance, currency);
    const account: StoredAccount = {
      id: input.accountId ?? randomUUID(),
      userId,
      name: input.name.trim(),
      accountType: input.accountType,
      currency,
      initialBalance: money.amount,
      currentBalance: money.amount,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    };
    await this.repository.insert(account);
    return account;
  }

  async updateAccount(
    userId: string,
    accountId: string,
    patch: { name?: string; accountType?: AccountType; isArchived?: boolean },
  ): Promise<{ previous: StoredAccount; updated: StoredAccount }> {
    const previous = await this.repository.findById(userId, accountId);
    if (!previous) {
      throw new AccountNotFoundError(accountId);
    }

    const updated = await this.repository.update(userId, accountId, {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.accountType !== undefined
        ? { accountType: patch.accountType }
        : {}),
      ...(patch.isArchived !== undefined
        ? { isArchived: patch.isArchived }
        : {}),
      updatedAt: this.now(),
    });

    if (!updated) {
      throw new AccountNotFoundError(accountId);
    }

    return { previous, updated };
  }

  async deleteAccount(userId: string, accountId: string): Promise<boolean> {
    return this.repository.deleteById(userId, accountId);
  }
}

export function registerAccountCommandHandlers(
  commandBus: CommandBus,
  accountsService: AccountsService,
): void {
  commandBus.registerHandler("account.create", {
    async execute(userId, payload) {
      const account = await accountsService.createAccount(userId, {
        ...(payload.accountId ? { accountId: payload.accountId } : {}),
        name: payload.name,
        accountType: payload.accountType,
        currency: payload.currency,
        initialBalance: payload.initialBalance,
      });

      return {
        result: {
          accountId: account.id,
          name: account.name,
          accountType: account.accountType,
          currency: account.currency,
          balance: account.currentBalance,
        },
        inversePayload: {
          accountId: account.id,
        },
      };
    },
    async undo(userId, inversePayload) {
      const accountId = String(inversePayload.accountId);
      const deleted = await accountsService.deleteAccount(userId, accountId);
      return { accountId, deleted };
    },
  });

  commandBus.registerHandler("account.update", {
    async execute(userId, payload) {
      const { previous, updated } = await accountsService.updateAccount(
        userId,
        payload.accountId,
        {
          ...(payload.name !== undefined ? { name: payload.name } : {}),
          ...(payload.accountType !== undefined
            ? { accountType: payload.accountType }
            : {}),
        },
      );

      return {
        result: {
          accountId: updated.id,
          name: updated.name,
          accountType: updated.accountType,
        },
        inversePayload: {
          accountId: previous.id,
          previousName: previous.name,
          previousAccountType: previous.accountType,
        },
      };
    },
    async undo(userId, inversePayload) {
      const accountId = String(inversePayload.accountId);
      const { updated } = await accountsService.updateAccount(
        userId,
        accountId,
        {
          name: String(inversePayload.previousName),
          accountType: inversePayload.previousAccountType as AccountType,
        },
      );
      return {
        accountId: updated.id,
        restoredName: updated.name,
        restoredAccountType: updated.accountType,
      };
    },
  });

  commandBus.registerHandler("account.archive", {
    async execute(userId, payload) {
      const { previous, updated } = await accountsService.updateAccount(
        userId,
        payload.accountId,
        { isArchived: true },
      );

      return {
        result: {
          accountId: updated.id,
          isArchived: updated.isArchived,
        },
        inversePayload: {
          accountId: previous.id,
          previousIsArchived: previous.isArchived,
        },
      };
    },
    async undo(userId, inversePayload) {
      const accountId = String(inversePayload.accountId);
      const { updated } = await accountsService.updateAccount(
        userId,
        accountId,
        { isArchived: Boolean(inversePayload.previousIsArchived) },
      );
      return {
        accountId: updated.id,
        isArchived: updated.isArchived,
      };
    },
  });
}

export class PostgresAccountsRepository implements AccountsRepository {
  constructor(private readonly dbClient: DbClient) {}

  async listByUser(
    userId: string,
    includeArchived: boolean,
  ): Promise<StoredAccount[]> {
    const condition = includeArchived
      ? eq(accounts.userId, userId)
      : and(eq(accounts.userId, userId), eq(accounts.isArchived, false));

    const rows = await this.dbClient.db
      .select()
      .from(accounts)
      .where(condition)
      .orderBy(asc(accounts.createdAt));

    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      name: row.name,
      accountType: row.accountType as AccountType,
      currency: row.currency,
      initialBalance: normalizeStoredAmount(row.initialBalance),
      currentBalance: normalizeStoredAmount(row.currentBalance),
      isArchived: row.isArchived,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async findById(
    userId: string,
    accountId: string,
  ): Promise<StoredAccount | null> {
    const rows = await this.dbClient.db
      .select()
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.id, accountId)))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
      accountType: row.accountType as AccountType,
      currency: row.currency,
      initialBalance: normalizeStoredAmount(row.initialBalance),
      currentBalance: normalizeStoredAmount(row.currentBalance),
      isArchived: row.isArchived,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async insert(account: StoredAccount): Promise<void> {
    await this.dbClient.db.insert(accounts).values({
      id: account.id,
      userId: account.userId,
      name: account.name,
      accountType: account.accountType,
      currency: account.currency,
      initialBalance: toDbNumericString(
        createMoney(account.initialBalance, account.currency),
      ),
      currentBalance: toDbNumericString(
        createMoney(account.currentBalance, account.currency),
      ),
      isArchived: account.isArchived,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    });
  }

  async update(
    userId: string,
    accountId: string,
    patch: AccountUpdatePatch,
  ): Promise<StoredAccount | null> {
    const existing = await this.findById(userId, accountId);
    if (!existing) return null;

    const updatedRows = await this.dbClient.db
      .update(accounts)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.accountType !== undefined
          ? { accountType: patch.accountType }
          : {}),
        ...(patch.currentBalance !== undefined
          ? {
              currentBalance: toDbNumericString(
                createMoney(patch.currentBalance, existing.currency),
              ),
            }
          : {}),
        ...(patch.isArchived !== undefined
          ? { isArchived: patch.isArchived }
          : {}),
        updatedAt: patch.updatedAt ?? new Date(),
      })
      .where(and(eq(accounts.userId, userId), eq(accounts.id, accountId)))
      .returning();

    const row = updatedRows[0];
    if (!row) return null;

    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
      accountType: row.accountType as AccountType,
      currency: row.currency,
      initialBalance: normalizeStoredAmount(row.initialBalance),
      currentBalance: normalizeStoredAmount(row.currentBalance),
      isArchived: row.isArchived,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async deleteById(userId: string, accountId: string): Promise<boolean> {
    const deleted = await this.dbClient.db
      .delete(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.id, accountId)))
      .returning({ id: accounts.id });
    return deleted.length > 0;
  }
}
