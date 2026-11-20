import { randomUUID } from "node:crypto";
import {
  addMoney,
  convertMoney,
  createMoney,
  normalizeCurrencyCode,
  resolveCrossRate,
  subtractMoney,
  type TransactionSource,
  toDbNumericString,
  toLocalDate,
  type UserPreferences,
} from "@agenticf/domain";
import { and, desc, eq, gte, isNull, lte, or } from "drizzle-orm";
import {
  AccountNotFoundError,
  type AccountsRepository,
} from "../accounts/service.js";
import type { CommandBus } from "../commands/bus.js";
import type { DbClient } from "../db/client.js";
import { transactions } from "../db/schema/transactions.js";
import type { FxRateReader } from "../routes/fx.js";

export type TransactionKind = "income" | "expense" | "transfer";

export interface StoredTransaction {
  readonly id: string;
  readonly userId: string;
  readonly kind: TransactionKind;
  readonly accountId: string;
  readonly destinationAccountId: string | null;
  readonly categoryId: string | null;
  readonly amount: string;
  readonly currency: string;
  readonly destinationAmount: string | null;
  readonly destinationCurrency: string | null;
  readonly fxRateToBase: string | null;
  readonly occurredAtUtc: Date;
  readonly localDate: string;
  readonly timezone: string;
  readonly description: string;
  readonly clientOrPayee: string | null;
  readonly source: TransactionSource;
  readonly externalId: string | null;
  readonly deletedAt: Date | null;
  readonly createdAt: Date;
}

export interface TransactionListFilters {
  readonly accountId?: string;
  readonly kind?: TransactionKind;
  readonly categoryId?: string;
  readonly fromDate?: string;
  readonly toDate?: string;
  readonly limit: number;
}

export interface TransactionsRepository {
  insert(tx: StoredTransaction): Promise<void>;
  findById(
    userId: string,
    txId: string,
    includeDeleted?: boolean,
  ): Promise<StoredTransaction | null>;
  setDeletedAt(
    userId: string,
    txId: string,
    deletedAt: Date | null,
  ): Promise<StoredTransaction | null>;
  listByUser(
    userId: string,
    filters: TransactionListFilters,
  ): Promise<StoredTransaction[]>;
}

export class TransactionNotFoundError extends Error {
  constructor(txId: string) {
    super(`Transaction "${txId}" not found`);
    this.name = "TransactionNotFoundError";
  }
}

export class AccountCurrencyMismatchError extends Error {
  constructor(expectedCurrency: string, actualCurrency: string) {
    super(
      `Transaction currency (${actualCurrency}) does not match account currency (${expectedCurrency})`,
    );
    this.name = "AccountCurrencyMismatchError";
  }
}

export interface TransactionsServiceOptions {
  repository: TransactionsRepository;
  accountsRepository: AccountsRepository;
  getUserPreferences: (userId: string) => Promise<UserPreferences>;
  fxRateReader?: FxRateReader;
  now?: () => Date;
}

function normalizeStoredAmount(raw: string): string {
  const trimmed = raw.replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
  return trimmed === "-0" ? "0" : trimmed;
}

export class TransactionsService {
  private readonly repository: TransactionsRepository;
  private readonly accountsRepository: AccountsRepository;
  private readonly getUserPreferences: (
    userId: string,
  ) => Promise<UserPreferences>;
  private readonly fxRateReader?: FxRateReader;
  private readonly now: () => Date;

  constructor(options: TransactionsServiceOptions) {
    this.repository = options.repository;
    this.accountsRepository = options.accountsRepository;
    this.getUserPreferences = options.getUserPreferences;
    if (options.fxRateReader) {
      this.fxRateReader = options.fxRateReader;
    }
    this.now = options.now ?? (() => new Date());
  }

  async listTransactions(
    userId: string,
    filters: TransactionListFilters,
  ): Promise<StoredTransaction[]> {
    return this.repository.listByUser(userId, filters);
  }

  async recordTransaction(
    userId: string,
    input: {
      transactionId?: string;
      kind: "income" | "expense";
      accountId: string;
      amount: string;
      currency: string;
      categoryId?: string;
      description: string;
      clientOrPayee?: string;
      occurredAtUtc?: string;
      fxRateToBaseOverride?: string;
      source: TransactionSource;
      externalId?: string;
    },
  ): Promise<{ transaction: StoredTransaction; newBalance: string }> {
    const account = await this.accountsRepository.findById(
      userId,
      input.accountId,
    );
    if (!account) {
      throw new AccountNotFoundError(input.accountId);
    }

    const currency = normalizeCurrencyCode(input.currency);
    if (currency !== account.currency) {
      throw new AccountCurrencyMismatchError(account.currency, currency);
    }

    const prefs = await this.getUserPreferences(userId);
    const now = this.now();
    const occurredAtUtc = input.occurredAtUtc
      ? new Date(input.occurredAtUtc)
      : now;
    const localDate = toLocalDate(occurredAtUtc, prefs.timezone);

    const amountMoney = createMoney(input.amount, currency);
    const fxRateToBase = await this.resolveFxRateToBase(
      currency,
      prefs.baseCurrency,
      input.fxRateToBaseOverride,
    );

    const tx: StoredTransaction = {
      id: input.transactionId ?? randomUUID(),
      userId,
      kind: input.kind,
      accountId: account.id,
      destinationAccountId: null,
      categoryId: input.categoryId ?? null,
      amount: amountMoney.amount,
      currency,
      destinationAmount: null,
      destinationCurrency: null,
      fxRateToBase,
      occurredAtUtc,
      localDate,
      timezone: prefs.timezone,
      description: input.description.trim(),
      clientOrPayee: input.clientOrPayee?.trim() ?? null,
      source: input.source,
      externalId: input.externalId ?? null,
      deletedAt: null,
      createdAt: now,
    };

    await this.repository.insert(tx);
    const newBalance = await this.applyAccountDelta(
      userId,
      account.id,
      amountMoney.amount,
      currency,
      input.kind === "income" ? "add" : "subtract",
    );

    return { transaction: tx, newBalance };
  }

  async transferBetweenAccounts(
    userId: string,
    input: {
      transactionId?: string;
      fromAccountId: string;
      toAccountId: string;
      amount: string;
      currency: string;
      destinationAmount?: string;
      description?: string;
      occurredAtUtc?: string;
    },
  ): Promise<{
    transaction: StoredTransaction;
    fromBalance: string;
    toBalance: string;
  }> {
    const fromAccount = await this.accountsRepository.findById(
      userId,
      input.fromAccountId,
    );
    if (!fromAccount) {
      throw new AccountNotFoundError(input.fromAccountId);
    }
    const toAccount = await this.accountsRepository.findById(
      userId,
      input.toAccountId,
    );
    if (!toAccount) {
      throw new AccountNotFoundError(input.toAccountId);
    }

    const currency = normalizeCurrencyCode(input.currency);
    if (currency !== fromAccount.currency) {
      throw new AccountCurrencyMismatchError(fromAccount.currency, currency);
    }

    const outMoney = createMoney(input.amount, currency);
    let destinationAmount: string;

    if (fromAccount.currency === toAccount.currency) {
      destinationAmount = outMoney.amount;
    } else if (input.destinationAmount) {
      destinationAmount = createMoney(
        input.destinationAmount,
        toAccount.currency,
      ).amount;
    } else {
      const snapshot = await this.getOptionalFxSnapshot();
      if (!snapshot) {
        throw new AccountCurrencyMismatchError(
          toAccount.currency,
          fromAccount.currency,
        );
      }
      const pairRate = resolveCrossRate(
        snapshot,
        fromAccount.currency,
        toAccount.currency,
      );
      destinationAmount = convertMoney(
        outMoney,
        toAccount.currency,
        pairRate,
      ).amount;
    }

    const prefs = await this.getUserPreferences(userId);
    const now = this.now();
    const occurredAtUtc = input.occurredAtUtc
      ? new Date(input.occurredAtUtc)
      : now;
    const localDate = toLocalDate(occurredAtUtc, prefs.timezone);
    const fxRateToBase = await this.resolveFxRateToBase(
      currency,
      prefs.baseCurrency,
      undefined,
    );

    const tx: StoredTransaction = {
      id: input.transactionId ?? randomUUID(),
      userId,
      kind: "transfer",
      accountId: fromAccount.id,
      destinationAccountId: toAccount.id,
      categoryId: null,
      amount: outMoney.amount,
      currency: fromAccount.currency,
      destinationAmount,
      destinationCurrency: toAccount.currency,
      fxRateToBase,
      occurredAtUtc,
      localDate,
      timezone: prefs.timezone,
      description:
        input.description?.trim() ?? `${fromAccount.name} → ${toAccount.name}`,
      clientOrPayee: null,
      source: "manual",
      externalId: null,
      deletedAt: null,
      createdAt: now,
    };

    await this.repository.insert(tx);
    const fromBalance = await this.applyAccountDelta(
      userId,
      fromAccount.id,
      outMoney.amount,
      fromAccount.currency,
      "subtract",
    );
    const toBalance = await this.applyAccountDelta(
      userId,
      toAccount.id,
      destinationAmount,
      toAccount.currency,
      "add",
    );

    return { transaction: tx, fromBalance, toBalance };
  }

  async softDeleteTransaction(
    userId: string,
    transactionId: string,
  ): Promise<StoredTransaction> {
    const tx = await this.repository.findById(userId, transactionId, false);
    if (!tx) {
      throw new TransactionNotFoundError(transactionId);
    }

    await this.repository.setDeletedAt(userId, transactionId, this.now());
    await this.reverseTransactionBalanceEffect(userId, tx);
    return tx;
  }

  async restoreTransaction(
    userId: string,
    transactionId: string,
  ): Promise<StoredTransaction> {
    const tx = await this.repository.findById(userId, transactionId, true);
    if (!tx) {
      throw new TransactionNotFoundError(transactionId);
    }

    await this.repository.setDeletedAt(userId, transactionId, null);
    await this.applyTransactionBalanceEffect(userId, tx);
    return tx;
  }

  private async applyTransactionBalanceEffect(
    userId: string,
    tx: StoredTransaction,
  ): Promise<void> {
    if (tx.kind === "income") {
      await this.applyAccountDelta(
        userId,
        tx.accountId,
        tx.amount,
        tx.currency,
        "add",
      );
    } else if (tx.kind === "expense") {
      await this.applyAccountDelta(
        userId,
        tx.accountId,
        tx.amount,
        tx.currency,
        "subtract",
      );
    } else if (tx.kind === "transfer" && tx.destinationAccountId) {
      await this.applyAccountDelta(
        userId,
        tx.accountId,
        tx.amount,
        tx.currency,
        "subtract",
      );
      await this.applyAccountDelta(
        userId,
        tx.destinationAccountId,
        tx.destinationAmount ?? tx.amount,
        tx.destinationCurrency ?? tx.currency,
        "add",
      );
    }
  }

  private async reverseTransactionBalanceEffect(
    userId: string,
    tx: StoredTransaction,
  ): Promise<void> {
    if (tx.kind === "income") {
      await this.applyAccountDelta(
        userId,
        tx.accountId,
        tx.amount,
        tx.currency,
        "subtract",
      );
    } else if (tx.kind === "expense") {
      await this.applyAccountDelta(
        userId,
        tx.accountId,
        tx.amount,
        tx.currency,
        "add",
      );
    } else if (tx.kind === "transfer" && tx.destinationAccountId) {
      await this.applyAccountDelta(
        userId,
        tx.accountId,
        tx.amount,
        tx.currency,
        "add",
      );
      await this.applyAccountDelta(
        userId,
        tx.destinationAccountId,
        tx.destinationAmount ?? tx.amount,
        tx.destinationCurrency ?? tx.currency,
        "subtract",
      );
    }
  }

  private async applyAccountDelta(
    userId: string,
    accountId: string,
    deltaAmount: string,
    currency: string,
    mode: "add" | "subtract",
  ): Promise<string> {
    const account = await this.accountsRepository.findById(userId, accountId);
    if (!account) {
      throw new AccountNotFoundError(accountId);
    }

    const current = createMoney(account.currentBalance, currency);
    const delta = createMoney(deltaAmount, currency);
    const next =
      mode === "add" ? addMoney(current, delta) : subtractMoney(current, delta);

    await this.accountsRepository.update(userId, accountId, {
      currentBalance: next.amount,
      updatedAt: this.now(),
    });
    return next.amount;
  }

  private async getOptionalFxSnapshot() {
    if (!this.fxRateReader) return undefined;
    try {
      return (await this.fxRateReader.getLatestSnapshot()) ?? undefined;
    } catch {
      return undefined;
    }
  }

  private async resolveFxRateToBase(
    currency: string,
    baseCurrency: string,
    override?: string,
  ): Promise<string | null> {
    if (currency === normalizeCurrencyCode(baseCurrency)) {
      return "1";
    }
    if (override) {
      return override;
    }
    const snapshot = await this.getOptionalFxSnapshot();
    if (!snapshot) return null;
    try {
      return resolveCrossRate(snapshot, currency, baseCurrency);
    } catch {
      return null;
    }
  }
}

export function registerTransactionCommandHandlers(
  commandBus: CommandBus,
  transactionsService: TransactionsService,
): void {
  commandBus.registerHandler("transaction.record", {
    async execute(userId, payload) {
      const { transaction, newBalance } =
        await transactionsService.recordTransaction(userId, {
          ...(payload.transactionId
            ? { transactionId: payload.transactionId }
            : {}),
          kind: payload.kind,
          accountId: payload.accountId,
          amount: payload.amount,
          currency: payload.currency,
          ...(payload.categoryId ? { categoryId: payload.categoryId } : {}),
          description: payload.description,
          ...(payload.clientOrPayee
            ? { clientOrPayee: payload.clientOrPayee }
            : {}),
          ...(payload.occurredAtUtc
            ? { occurredAtUtc: payload.occurredAtUtc }
            : {}),
          ...(payload.fxRateToBaseOverride
            ? { fxRateToBaseOverride: payload.fxRateToBaseOverride }
            : {}),
          source: payload.source,
          ...(payload.externalId ? { externalId: payload.externalId } : {}),
        });

      return {
        result: {
          transactionId: transaction.id,
          kind: transaction.kind,
          amount: transaction.amount,
          currency: transaction.currency,
          localDate: transaction.localDate,
          newBalance,
        },
        inversePayload: {
          transactionId: transaction.id,
        },
      };
    },
    async undo(userId, inversePayload) {
      const transactionId = String(inversePayload.transactionId);
      await transactionsService.softDeleteTransaction(userId, transactionId);
      return { transactionId, undone: true };
    },
  });

  commandBus.registerHandler("transaction.transfer", {
    async execute(userId, payload) {
      const { transaction, fromBalance, toBalance } =
        await transactionsService.transferBetweenAccounts(userId, {
          ...(payload.transactionId
            ? { transactionId: payload.transactionId }
            : {}),
          fromAccountId: payload.fromAccountId,
          toAccountId: payload.toAccountId,
          amount: payload.amount,
          currency: payload.currency,
          ...(payload.destinationAmount
            ? { destinationAmount: payload.destinationAmount }
            : {}),
          ...(payload.description ? { description: payload.description } : {}),
          ...(payload.occurredAtUtc
            ? { occurredAtUtc: payload.occurredAtUtc }
            : {}),
        });

      return {
        result: {
          transactionId: transaction.id,
          fromAccountId: transaction.accountId,
          toAccountId: transaction.destinationAccountId,
          fromBalance,
          toBalance,
        },
        inversePayload: {
          transactionId: transaction.id,
        },
      };
    },
    async undo(userId, inversePayload) {
      const transactionId = String(inversePayload.transactionId);
      await transactionsService.softDeleteTransaction(userId, transactionId);
      return { transactionId, undone: true };
    },
  });

  commandBus.registerHandler("transaction.delete", {
    async execute(userId, payload) {
      const deleted = await transactionsService.softDeleteTransaction(
        userId,
        payload.transactionId,
      );
      return {
        result: { transactionId: deleted.id, deleted: true },
        inversePayload: { transactionId: deleted.id },
      };
    },
    async undo(userId, inversePayload) {
      const transactionId = String(inversePayload.transactionId);
      const restored = await transactionsService.restoreTransaction(
        userId,
        transactionId,
      );
      return { transactionId: restored.id, restored: true };
    },
  });
}

export class PostgresTransactionsRepository implements TransactionsRepository {
  constructor(private readonly dbClient: DbClient) {}

  async insert(tx: StoredTransaction): Promise<void> {
    await this.dbClient.db.insert(transactions).values({
      id: tx.id,
      userId: tx.userId,
      kind: tx.kind,
      accountId: tx.accountId,
      destinationAccountId: tx.destinationAccountId,
      categoryId: tx.categoryId,
      amount: toDbNumericString(createMoney(tx.amount, tx.currency)),
      currency: tx.currency,
      destinationAmount:
        tx.destinationAmount && tx.destinationCurrency
          ? toDbNumericString(
              createMoney(tx.destinationAmount, tx.destinationCurrency),
            )
          : null,
      destinationCurrency: tx.destinationCurrency,
      fxRateToBase: tx.fxRateToBase
        ? toDbNumericString(createMoney(tx.fxRateToBase, tx.currency))
        : null,
      occurredAtUtc: tx.occurredAtUtc,
      localDate: tx.localDate,
      timezone: tx.timezone,
      description: tx.description,
      clientOrPayee: tx.clientOrPayee,
      source: tx.source,
      externalId: tx.externalId,
      deletedAt: tx.deletedAt,
      createdAt: tx.createdAt,
    });
  }

  async findById(
    userId: string,
    txId: string,
    includeDeleted = false,
  ): Promise<StoredTransaction | null> {
    const condition = includeDeleted
      ? and(eq(transactions.userId, userId), eq(transactions.id, txId))
      : and(
          eq(transactions.userId, userId),
          eq(transactions.id, txId),
          isNull(transactions.deletedAt),
        );

    const rows = await this.dbClient.db
      .select()
      .from(transactions)
      .where(condition)
      .limit(1);

    const row = rows[0];
    return row ? this.mapRow(row) : null;
  }

  async setDeletedAt(
    userId: string,
    txId: string,
    deletedAt: Date | null,
  ): Promise<StoredTransaction | null> {
    const rows = await this.dbClient.db
      .update(transactions)
      .set({ deletedAt })
      .where(and(eq(transactions.userId, userId), eq(transactions.id, txId)))
      .returning();

    const row = rows[0];
    return row ? this.mapRow(row) : null;
  }

  async listByUser(
    userId: string,
    filters: TransactionListFilters,
  ): Promise<StoredTransaction[]> {
    const conditions = [
      eq(transactions.userId, userId),
      isNull(transactions.deletedAt),
    ];

    if (filters.accountId) {
      const accountMatch = or(
        eq(transactions.accountId, filters.accountId),
        eq(transactions.destinationAccountId, filters.accountId),
      );
      if (accountMatch) conditions.push(accountMatch);
    }
    if (filters.kind) {
      conditions.push(eq(transactions.kind, filters.kind));
    }
    if (filters.categoryId) {
      conditions.push(eq(transactions.categoryId, filters.categoryId));
    }
    if (filters.fromDate) {
      conditions.push(gte(transactions.localDate, filters.fromDate));
    }
    if (filters.toDate) {
      conditions.push(lte(transactions.localDate, filters.toDate));
    }

    const rows = await this.dbClient.db
      .select()
      .from(transactions)
      .where(and(...conditions))
      .orderBy(desc(transactions.occurredAtUtc))
      .limit(filters.limit);

    return rows.map((row) => this.mapRow(row));
  }

  private mapRow(row: typeof transactions.$inferSelect): StoredTransaction {
    return {
      id: row.id,
      userId: row.userId,
      kind: row.kind as TransactionKind,
      accountId: row.accountId,
      destinationAccountId: row.destinationAccountId,
      categoryId: row.categoryId,
      amount: normalizeStoredAmount(row.amount),
      currency: row.currency,
      destinationAmount: row.destinationAmount
        ? normalizeStoredAmount(row.destinationAmount)
        : null,
      destinationCurrency: row.destinationCurrency,
      fxRateToBase: row.fxRateToBase
        ? normalizeStoredAmount(row.fxRateToBase)
        : null,
      occurredAtUtc: row.occurredAtUtc,
      localDate: row.localDate,
      timezone: row.timezone,
      description: row.description,
      clientOrPayee: row.clientOrPayee,
      source: row.source as TransactionSource,
      externalId: row.externalId,
      deletedAt: row.deletedAt,
      createdAt: row.createdAt,
    };
  }
}
