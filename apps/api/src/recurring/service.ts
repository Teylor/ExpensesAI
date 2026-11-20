import { randomUUID } from "node:crypto";
import {
  advanceNextDueLocalDate,
  computeInitialNextDueLocalDate,
  createMoney,
  type FinancialPeriod,
  isRecurringRuleDue,
  normalizeCurrencyCode,
  toDbNumericString,
  toLocalDate,
  type UserPreferences,
} from "@agenticf/domain";
import { and, asc, eq, isNull } from "drizzle-orm";
import {
  AccountNotFoundError,
  type AccountsRepository,
} from "../accounts/service.js";
import type { CommandBus } from "../commands/bus.js";
import type { DbClient } from "../db/client.js";
import { recurringRules } from "../db/schema/recurring.js";
import { PostgresAdvisoryLock } from "../fx/service.js";
import { AccountCurrencyMismatchError } from "../transactions/service.js";

export type RecurringKind = "income" | "expense";

export interface StoredRecurringRule {
  readonly id: string;
  readonly userId: string;
  readonly kind: RecurringKind;
  readonly accountId: string;
  readonly categoryId: string | null;
  readonly amount: string;
  readonly currency: string;
  readonly frequency: FinancialPeriod;
  readonly dayOfMonth: number | null;
  readonly dayOfWeek: number | null;
  readonly description: string;
  readonly isActive: boolean;
  readonly lastTriggeredLocalDate: string | null;
  readonly nextDueLocalDate: string;
  readonly deletedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface RecurringRepository {
  listByUser(userId: string): Promise<StoredRecurringRule[]>;
  listAllActive(): Promise<StoredRecurringRule[]>;
  findById(
    userId: string,
    ruleId: string,
    includeDeleted?: boolean,
  ): Promise<StoredRecurringRule | null>;
  upsert(rule: StoredRecurringRule): Promise<void>;
  setDeletedAt(
    userId: string,
    ruleId: string,
    deletedAt: Date | null,
  ): Promise<StoredRecurringRule | null>;
}

export interface RecurringAdvisoryLockRunner {
  withLock<T>(
    lockKey: number,
    fn: () => Promise<T>,
  ): Promise<{ acquired: boolean; result?: T }>;
}

export class RecurringRuleNotFoundError extends Error {
  constructor(ruleId: string) {
    super(`Recurring rule "${ruleId}" not found`);
    this.name = "RecurringRuleNotFoundError";
  }
}

export const RECURRING_SYNC_LOCK_KEY = 48151624;

export interface RecurringServiceOptions {
  repository: RecurringRepository;
  accountsRepository: AccountsRepository;
  getUserPreferences: (userId: string) => Promise<UserPreferences>;
  commandBus: CommandBus;
  advisoryLock: RecurringAdvisoryLockRunner;
  now?: () => Date;
}

function normalizeStoredAmount(raw: string): string {
  const trimmed = raw.replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
  return trimmed === "-0" ? "0" : trimmed;
}

export class RecurringService {
  private readonly repository: RecurringRepository;
  private readonly accountsRepository: AccountsRepository;
  private readonly getUserPreferences: (
    userId: string,
  ) => Promise<UserPreferences>;
  private readonly commandBus: CommandBus;
  private readonly advisoryLock: RecurringAdvisoryLockRunner;
  private readonly now: () => Date;

  constructor(options: RecurringServiceOptions) {
    this.repository = options.repository;
    this.accountsRepository = options.accountsRepository;
    this.getUserPreferences = options.getUserPreferences;
    this.commandBus = options.commandBus;
    this.advisoryLock = options.advisoryLock;
    this.now = options.now ?? (() => new Date());
  }

  async listRules(userId: string): Promise<StoredRecurringRule[]> {
    return this.repository.listByUser(userId);
  }

  async upsertRule(
    userId: string,
    input: {
      ruleId?: string;
      kind: RecurringKind;
      accountId: string;
      categoryId?: string | null;
      amount: string;
      currency: string;
      frequency: FinancialPeriod;
      dayOfMonth?: number | null;
      dayOfWeek?: number | null;
      description: string;
      isActive?: boolean;
      lastTriggeredLocalDate?: string | null;
      nextDueLocalDate?: string;
    },
  ): Promise<{
    previous: StoredRecurringRule | null;
    current: StoredRecurringRule;
  }> {
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
    const todayLocalDate = toLocalDate(now, prefs.timezone);
    const ruleId = input.ruleId ?? randomUUID();
    const previous = await this.repository.findById(userId, ruleId, false);

    const amountMoney = createMoney(input.amount, currency);
    const dayOfMonth =
      input.dayOfMonth !== undefined
        ? input.dayOfMonth
        : (previous?.dayOfMonth ?? null);
    const dayOfWeek =
      input.dayOfWeek !== undefined
        ? input.dayOfWeek
        : (previous?.dayOfWeek ?? null);

    const nextDueLocalDate =
      input.nextDueLocalDate ??
      computeInitialNextDueLocalDate(
        {
          frequency: input.frequency,
          ...(dayOfMonth !== null ? { dayOfMonth } : {}),
          ...(dayOfWeek !== null ? { dayOfWeek } : {}),
        },
        todayLocalDate,
      );

    const current: StoredRecurringRule = {
      id: ruleId,
      userId,
      kind: input.kind,
      accountId: account.id,
      categoryId:
        input.categoryId !== undefined
          ? input.categoryId
          : (previous?.categoryId ?? null),
      amount: amountMoney.amount,
      currency,
      frequency: input.frequency,
      dayOfMonth,
      dayOfWeek,
      description: input.description.trim(),
      isActive: input.isActive ?? true,
      lastTriggeredLocalDate:
        input.lastTriggeredLocalDate !== undefined
          ? input.lastTriggeredLocalDate
          : (previous?.lastTriggeredLocalDate ?? null),
      nextDueLocalDate,
      deletedAt: null,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };

    await this.repository.upsert(current);
    return { previous, current };
  }

  async softDeleteRule(
    userId: string,
    ruleId: string,
  ): Promise<StoredRecurringRule> {
    const existing = await this.repository.findById(userId, ruleId, false);
    if (!existing) {
      throw new RecurringRuleNotFoundError(ruleId);
    }
    const deleted = await this.repository.setDeletedAt(
      userId,
      ruleId,
      this.now(),
    );
    if (!deleted) {
      throw new RecurringRuleNotFoundError(ruleId);
    }
    return deleted;
  }

  async restoreRule(
    userId: string,
    ruleId: string,
  ): Promise<StoredRecurringRule> {
    const restored = await this.repository.setDeletedAt(userId, ruleId, null);
    if (!restored) {
      throw new RecurringRuleNotFoundError(ruleId);
    }
    return restored;
  }

  async processDueRecurringRules(targetUserId?: string): Promise<{
    skipped: boolean;
    triggeredCount: number;
  }> {
    const lockRun = await this.advisoryLock.withLock(
      RECURRING_SYNC_LOCK_KEY,
      async () => {
        const activeRules = targetUserId
          ? (await this.repository.listByUser(targetUserId)).filter(
              (r) => r.isActive,
            )
          : await this.repository.listAllActive();

        const now = this.now();
        let triggeredCount = 0;

        for (const rule of activeRules) {
          const prefs = await this.getUserPreferences(rule.userId);
          const currentLocalDate = toLocalDate(now, prefs.timezone);

          if (
            !isRecurringRuleDue(
              {
                isActive: rule.isActive,
                nextDueLocalDate: rule.nextDueLocalDate,
                lastTriggeredLocalDate: rule.lastTriggeredLocalDate,
              },
              currentLocalDate,
            )
          ) {
            continue;
          }

          await this.commandBus.dispatch(rule.userId, {
            commandId: randomUUID(),
            actor: "system",
            issuedAtUtc: now.toISOString(),
            type: "transaction.record",
            payload: {
              kind: rule.kind,
              accountId: rule.accountId,
              amount: rule.amount,
              currency: rule.currency,
              ...(rule.categoryId ? { categoryId: rule.categoryId } : {}),
              description: rule.description,
              occurredAtUtc: now.toISOString(),
              source: "recurring",
            },
          });

          const nextDueLocalDate = advanceNextDueLocalDate(
            {
              frequency: rule.frequency,
              ...(rule.dayOfMonth !== null
                ? { dayOfMonth: rule.dayOfMonth }
                : {}),
              ...(rule.dayOfWeek !== null ? { dayOfWeek: rule.dayOfWeek } : {}),
            },
            currentLocalDate,
          );

          await this.repository.upsert({
            ...rule,
            lastTriggeredLocalDate: currentLocalDate,
            nextDueLocalDate,
            updatedAt: now,
          });

          triggeredCount += 1;
        }

        return triggeredCount;
      },
    );

    if (!lockRun.acquired) {
      return { skipped: true, triggeredCount: 0 };
    }
    return {
      skipped: false,
      triggeredCount: lockRun.result ?? 0,
    };
  }
}

export function registerRecurringCommandHandlers(
  commandBus: CommandBus,
  recurringService: RecurringService,
): void {
  commandBus.registerHandler("recurring.upsert", {
    async execute(userId, payload) {
      const { previous, current } = await recurringService.upsertRule(userId, {
        ...(payload.ruleId ? { ruleId: payload.ruleId } : {}),
        kind: payload.kind,
        accountId: payload.accountId,
        ...(payload.categoryId ? { categoryId: payload.categoryId } : {}),
        amount: payload.amount,
        currency: payload.currency,
        frequency: payload.frequency,
        ...(payload.dayOfMonth !== undefined
          ? { dayOfMonth: payload.dayOfMonth }
          : {}),
        ...(payload.dayOfWeek !== undefined
          ? { dayOfWeek: payload.dayOfWeek }
          : {}),
        description: payload.description,
        isActive: payload.isActive,
      });

      return {
        result: {
          ruleId: current.id,
          nextDueLocalDate: current.nextDueLocalDate,
          isActive: current.isActive,
        },
        inversePayload: previous
          ? {
              mode: "restore_previous",
              rule: previous,
            }
          : {
              mode: "soft_delete_created",
              ruleId: current.id,
            },
      };
    },
    async undo(userId, inversePayload) {
      if (inversePayload.mode === "soft_delete_created") {
        const ruleId = String(inversePayload.ruleId);
        await recurringService.softDeleteRule(userId, ruleId);
        return { ruleId, deleted: true };
      }

      const prev = inversePayload.rule as StoredRecurringRule;
      const { current } = await recurringService.upsertRule(userId, {
        ruleId: prev.id,
        kind: prev.kind,
        accountId: prev.accountId,
        categoryId: prev.categoryId,
        amount: prev.amount,
        currency: prev.currency,
        frequency: prev.frequency,
        dayOfMonth: prev.dayOfMonth,
        dayOfWeek: prev.dayOfWeek,
        description: prev.description,
        isActive: prev.isActive,
        lastTriggeredLocalDate: prev.lastTriggeredLocalDate,
        nextDueLocalDate: prev.nextDueLocalDate,
      });
      return { ruleId: current.id, restored: true };
    },
  });

  commandBus.registerHandler("recurring.delete", {
    async execute(userId, payload) {
      const deleted = await recurringService.softDeleteRule(
        userId,
        payload.ruleId,
      );
      return {
        result: { ruleId: deleted.id, deleted: true },
        inversePayload: { ruleId: deleted.id },
      };
    },
    async undo(userId, inversePayload) {
      const ruleId = String(inversePayload.ruleId);
      const restored = await recurringService.restoreRule(userId, ruleId);
      return { ruleId: restored.id, restored: true };
    },
  });
}

export class PostgresRecurringAdvisoryLock
  implements RecurringAdvisoryLockRunner
{
  constructor(private readonly dbClient: DbClient) {}

  async withLock<T>(
    lockKey: number,
    fn: () => Promise<T>,
  ): Promise<{ acquired: boolean; result?: T }> {
    const lock = new PostgresAdvisoryLock(this.dbClient, lockKey);
    const acquired = await lock.tryAcquire();
    if (!acquired) {
      return { acquired: false };
    }
    try {
      const result = await fn();
      return { acquired: true, result };
    } finally {
      await lock.release();
    }
  }
}

export class PostgresRecurringRepository implements RecurringRepository {
  constructor(private readonly dbClient: DbClient) {}

  async listByUser(userId: string): Promise<StoredRecurringRule[]> {
    const rows = await this.dbClient.db
      .select()
      .from(recurringRules)
      .where(
        and(
          eq(recurringRules.userId, userId),
          isNull(recurringRules.deletedAt),
        ),
      )
      .orderBy(asc(recurringRules.nextDueLocalDate));

    return rows.map((row) => this.mapRow(row));
  }

  async listAllActive(): Promise<StoredRecurringRule[]> {
    const rows = await this.dbClient.db
      .select()
      .from(recurringRules)
      .where(
        and(
          eq(recurringRules.isActive, true),
          isNull(recurringRules.deletedAt),
        ),
      )
      .orderBy(asc(recurringRules.nextDueLocalDate));

    return rows.map((row) => this.mapRow(row));
  }

  async findById(
    userId: string,
    ruleId: string,
    includeDeleted = false,
  ): Promise<StoredRecurringRule | null> {
    const condition = includeDeleted
      ? and(eq(recurringRules.userId, userId), eq(recurringRules.id, ruleId))
      : and(
          eq(recurringRules.userId, userId),
          eq(recurringRules.id, ruleId),
          isNull(recurringRules.deletedAt),
        );

    const rows = await this.dbClient.db
      .select()
      .from(recurringRules)
      .where(condition)
      .limit(1);

    const row = rows[0];
    return row ? this.mapRow(row) : null;
  }

  async upsert(rule: StoredRecurringRule): Promise<void> {
    const dbAmount = toDbNumericString(createMoney(rule.amount, rule.currency));
    await this.dbClient.db
      .insert(recurringRules)
      .values({
        id: rule.id,
        userId: rule.userId,
        kind: rule.kind,
        accountId: rule.accountId,
        categoryId: rule.categoryId,
        amount: dbAmount,
        currency: rule.currency,
        frequency: rule.frequency,
        dayOfMonth: rule.dayOfMonth,
        dayOfWeek: rule.dayOfWeek,
        description: rule.description,
        isActive: rule.isActive,
        lastTriggeredLocalDate: rule.lastTriggeredLocalDate,
        nextDueLocalDate: rule.nextDueLocalDate,
        deletedAt: rule.deletedAt,
        createdAt: rule.createdAt,
        updatedAt: rule.updatedAt,
      })
      .onConflictDoUpdate({
        target: recurringRules.id,
        set: {
          kind: rule.kind,
          accountId: rule.accountId,
          categoryId: rule.categoryId,
          amount: dbAmount,
          currency: rule.currency,
          frequency: rule.frequency,
          dayOfMonth: rule.dayOfMonth,
          dayOfWeek: rule.dayOfWeek,
          description: rule.description,
          isActive: rule.isActive,
          lastTriggeredLocalDate: rule.lastTriggeredLocalDate,
          nextDueLocalDate: rule.nextDueLocalDate,
          deletedAt: rule.deletedAt,
          updatedAt: rule.updatedAt,
        },
      });
  }

  async setDeletedAt(
    userId: string,
    ruleId: string,
    deletedAt: Date | null,
  ): Promise<StoredRecurringRule | null> {
    const rows = await this.dbClient.db
      .update(recurringRules)
      .set({ deletedAt, updatedAt: new Date() })
      .where(
        and(eq(recurringRules.userId, userId), eq(recurringRules.id, ruleId)),
      )
      .returning();

    const row = rows[0];
    return row ? this.mapRow(row) : null;
  }

  private mapRow(row: typeof recurringRules.$inferSelect): StoredRecurringRule {
    return {
      id: row.id,
      userId: row.userId,
      kind: row.kind as RecurringKind,
      accountId: row.accountId,
      categoryId: row.categoryId,
      amount: normalizeStoredAmount(row.amount),
      currency: row.currency,
      frequency: row.frequency as FinancialPeriod,
      dayOfMonth: row.dayOfMonth,
      dayOfWeek: row.dayOfWeek,
      description: row.description,
      isActive: row.isActive,
      lastTriggeredLocalDate: row.lastTriggeredLocalDate,
      nextDueLocalDate: row.nextDueLocalDate,
      deletedAt: row.deletedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
