import {
  addMoney,
  type CommandEnvelope,
  commandEnvelopeSchema,
  createMoney,
  normalizeCurrencyCode,
  resolveCrossRate,
  subtractMoney,
  toLocalDate,
} from "@agenticf/domain";
import type {
  AgenticfOfflineDb,
  LocalAccount,
  LocalCategory,
  LocalTransaction,
} from "./db.js";

export interface OutboxBatchAck {
  readonly commandId: string;
  readonly status: "applied" | "duplicate";
}

export interface OutboxTransport {
  sendBatch(commands: readonly CommandEnvelope[]): Promise<OutboxBatchAck[]>;
  undoCommand(commandId: string): Promise<void>;
}

export class OutboxTransientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutboxTransientError";
  }
}

export class OutboxPermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutboxPermanentError";
  }
}

export interface OutboxSyncSummary {
  readonly syncedCount: number;
  readonly pendingCount: number;
  readonly failedCount: number;
}

export interface OutboxSyncEngineOptions {
  db: AgenticfOfflineDb;
  transport: OutboxTransport;
  now?: () => Date;
}

function randomIdFallback(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }
  return "00000000-0000-4000-8000-000000000000";
}

export class OutboxSyncEngine {
  private readonly db: AgenticfOfflineDb;
  private readonly transport: OutboxTransport;
  private readonly now: () => Date;
  private syncInFlight: Promise<OutboxSyncSummary> | null = null;

  constructor(options: OutboxSyncEngineOptions) {
    this.db = options.db;
    this.transport = options.transport;
    this.now = options.now ?? (() => new Date());
  }

  async getPendingCount(): Promise<number> {
    return this.db.outbox.where("status").equals("pending").count();
  }

  async enqueueCommand(rawEnvelope: CommandEnvelope): Promise<void> {
    const envelope = commandEnvelopeSchema.parse(rawEnvelope);
    const existing = await this.db.outbox.get(envelope.commandId);
    if (existing) {
      return;
    }

    const inverseSnapshot = await this.applyOptimisticMutation(envelope);
    const nowIso = this.now().toISOString();

    await this.db.outbox.put({
      commandId: envelope.commandId,
      envelope,
      status: "pending",
      attempts: 0,
      lastError: null,
      enqueuedAt: nowIso,
      syncedAt: null,
      inverseSnapshot,
    });
  }

  async undoCommand(commandId: string): Promise<void> {
    const entry = await this.db.outbox.get(commandId);
    if (entry?.status === "pending") {
      if (entry.inverseSnapshot) {
        await this.revertOptimisticMutation(entry.inverseSnapshot);
      }
      await this.db.outbox.delete(commandId);
      return;
    }

    await this.transport.undoCommand(commandId);
    if (entry?.inverseSnapshot) {
      await this.revertOptimisticMutation(entry.inverseSnapshot);
    }
    if (entry) {
      await this.db.outbox.delete(commandId);
    }
  }

  async syncPending(): Promise<OutboxSyncSummary> {
    if (this.syncInFlight) {
      return this.syncInFlight;
    }

    this.syncInFlight = this.runSync();
    try {
      return await this.syncInFlight;
    } finally {
      this.syncInFlight = null;
    }
  }

  private async runSync(): Promise<OutboxSyncSummary> {
    const pendingItems = await this.db.outbox
      .where("status")
      .equals("pending")
      .sortBy("enqueuedAt");

    if (pendingItems.length === 0) {
      const failedCount = await this.db.outbox
        .where("status")
        .equals("failed")
        .count();
      return { syncedCount: 0, pendingCount: 0, failedCount };
    }

    const nowIso = this.now().toISOString();
    const envelopes = pendingItems.map((item) => item.envelope);

    try {
      const acks = await this.transport.sendBatch(envelopes);
      const ackMap = new Map(acks.map((a) => [a.commandId, a.status]));

      let syncedCount = 0;
      for (const item of pendingItems) {
        const status = ackMap.get(item.commandId);
        if (status === "applied" || status === "duplicate") {
          syncedCount += 1;
          await this.db.outbox.put({
            ...item,
            status: "synced",
            syncedAt: nowIso,
            lastError: null,
          });
        }
      }

      if (syncedCount > 0) {
        await this.db.setLastSyncAt(nowIso);
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Sync failed";
      const isPermanent = error instanceof OutboxPermanentError;

      for (const item of pendingItems) {
        await this.db.outbox.put({
          ...item,
          status: isPermanent ? "failed" : "pending",
          attempts: item.attempts + 1,
          lastError: errMsg,
        });
      }
    }

    const pendingCount = await this.db.outbox
      .where("status")
      .equals("pending")
      .count();
    const failedCount = await this.db.outbox
      .where("status")
      .equals("failed")
      .count();
    const syncedCount = pendingItems.length - pendingCount - failedCount;

    return {
      syncedCount: Math.max(0, syncedCount),
      pendingCount,
      failedCount,
    };
  }

  private async applyOptimisticMutation(
    envelope: CommandEnvelope,
  ): Promise<Record<string, unknown> | null> {
    const nowIso = this.now().toISOString();

    switch (envelope.type) {
      case "account.create": {
        const currency = normalizeCurrencyCode(envelope.payload.currency);
        const balance = createMoney(
          envelope.payload.initialBalance,
          currency,
        ).amount;
        const accountId = envelope.payload.accountId ?? randomIdFallback();
        const account: LocalAccount = {
          id: accountId,
          name: envelope.payload.name.trim(),
          accountType: envelope.payload.accountType,
          currency,
          balance,
          isArchived: false,
          updatedAt: nowIso,
        };
        await this.db.accounts.put(account);
        return { kind: "delete_account", accountId };
      }

      case "account.update": {
        const prev = await this.db.accounts.get(envelope.payload.accountId);
        if (!prev) return null;
        await this.db.accounts.put({
          ...prev,
          ...(envelope.payload.name !== undefined
            ? { name: envelope.payload.name.trim() }
            : {}),
          ...(envelope.payload.accountType !== undefined
            ? { accountType: envelope.payload.accountType }
            : {}),
          updatedAt: nowIso,
        });
        return { kind: "restore_account", account: prev };
      }

      case "account.archive": {
        const prev = await this.db.accounts.get(envelope.payload.accountId);
        if (!prev) return null;
        await this.db.accounts.put({
          ...prev,
          isArchived: true,
          updatedAt: nowIso,
        });
        return { kind: "restore_account", account: prev };
      }

      case "category.upsert": {
        const categoryId = envelope.payload.categoryId ?? randomIdFallback();
        const prev = await this.db.categories.get(categoryId);
        const next: LocalCategory = {
          id: categoryId,
          scope: envelope.payload.scope,
          name: envelope.payload.name.trim(),
          icon: envelope.payload.icon ?? prev?.icon ?? null,
          color: envelope.payload.color ?? prev?.color ?? null,
          deletedAt: null,
          updatedAt: nowIso,
        };
        await this.db.categories.put(next);
        return prev
          ? { kind: "restore_category", category: prev }
          : { kind: "delete_category", categoryId };
      }

      case "category.delete": {
        const prev = await this.db.categories.get(envelope.payload.categoryId);
        if (!prev) return null;
        await this.db.categories.put({
          ...prev,
          deletedAt: nowIso,
          updatedAt: nowIso,
        });
        return { kind: "restore_category", category: prev };
      }

      case "transaction.record": {
        const acc = await this.db.accounts.get(envelope.payload.accountId);
        if (!acc) return null;
        const currency = normalizeCurrencyCode(envelope.payload.currency);
        const amountMoney = createMoney(envelope.payload.amount, currency);
        const currentMoney = createMoney(acc.balance, acc.currency);
        const nextBalance =
          envelope.payload.kind === "income"
            ? addMoney(currentMoney, amountMoney).amount
            : subtractMoney(currentMoney, amountMoney).amount;

        const prefs = await this.db.getPreferences();
        const fxSnapshot = await this.db.getLatestFxSnapshot();
        const occurredAt = envelope.payload.occurredAtUtc ?? nowIso;
        const localDate = toLocalDate(new Date(occurredAt), prefs.timezone);

        let fxRateToBase: string | null = null;
        if (currency === normalizeCurrencyCode(prefs.baseCurrency)) {
          fxRateToBase = "1";
        } else if (envelope.payload.fxRateToBaseOverride) {
          fxRateToBase = envelope.payload.fxRateToBaseOverride;
        } else if (fxSnapshot) {
          try {
            fxRateToBase = resolveCrossRate(
              fxSnapshot,
              currency,
              prefs.baseCurrency,
            );
          } catch {
            fxRateToBase = null;
          }
        }

        const txId = envelope.payload.transactionId ?? randomIdFallback();
        const tx: LocalTransaction = {
          id: txId,
          kind: envelope.payload.kind,
          accountId: acc.id,
          destinationAccountId: null,
          categoryId: envelope.payload.categoryId ?? null,
          amount: amountMoney.amount,
          currency,
          destinationAmount: null,
          destinationCurrency: null,
          fxRateToBase,
          occurredAtUtc: occurredAt,
          localDate,
          timezone: prefs.timezone,
          description: envelope.payload.description.trim(),
          clientOrPayee: envelope.payload.clientOrPayee?.trim() ?? null,
          source: envelope.payload.source,
          externalId: envelope.payload.externalId ?? null,
          deletedAt: null,
        };

        await this.db.transactions.put(tx);
        await this.db.accounts.put({
          ...acc,
          balance: nextBalance,
          updatedAt: nowIso,
        });

        return {
          kind: "undo_transaction_record",
          txId,
          accountId: acc.id,
          currency: acc.currency,
          amount: amountMoney.amount,
          txKind: envelope.payload.kind,
        };
      }

      case "transaction.transfer": {
        const fromAcc = await this.db.accounts.get(
          envelope.payload.fromAccountId,
        );
        const toAcc = await this.db.accounts.get(envelope.payload.toAccountId);
        if (!fromAcc || !toAcc) return null;

        const outMoney = createMoney(envelope.payload.amount, fromAcc.currency);
        const inMoney = createMoney(
          envelope.payload.destinationAmount ?? envelope.payload.amount,
          toAcc.currency,
        );

        const nextFromBalance = subtractMoney(
          createMoney(fromAcc.balance, fromAcc.currency),
          outMoney,
        ).amount;
        const nextToBalance = addMoney(
          createMoney(toAcc.balance, toAcc.currency),
          inMoney,
        ).amount;

        const prefs = await this.db.getPreferences();
        const occurredAt = envelope.payload.occurredAtUtc ?? nowIso;
        const localDate = toLocalDate(new Date(occurredAt), prefs.timezone);
        const txId = envelope.payload.transactionId ?? randomIdFallback();

        const tx: LocalTransaction = {
          id: txId,
          kind: "transfer",
          accountId: fromAcc.id,
          destinationAccountId: toAcc.id,
          categoryId: null,
          amount: outMoney.amount,
          currency: fromAcc.currency,
          destinationAmount: inMoney.amount,
          destinationCurrency: toAcc.currency,
          fxRateToBase:
            fromAcc.currency === normalizeCurrencyCode(prefs.baseCurrency)
              ? "1"
              : null,
          occurredAtUtc: occurredAt,
          localDate,
          timezone: prefs.timezone,
          description:
            envelope.payload.description?.trim() ??
            `${fromAcc.name} → ${toAcc.name}`,
          clientOrPayee: null,
          source: "manual",
          externalId: null,
          deletedAt: null,
        };

        await this.db.transactions.put(tx);
        await this.db.accounts.put({
          ...fromAcc,
          balance: nextFromBalance,
          updatedAt: nowIso,
        });
        await this.db.accounts.put({
          ...toAcc,
          balance: nextToBalance,
          updatedAt: nowIso,
        });

        return {
          kind: "undo_transfer",
          txId,
          fromAccountId: fromAcc.id,
          fromCurrency: fromAcc.currency,
          fromAmount: outMoney.amount,
          toAccountId: toAcc.id,
          toCurrency: toAcc.currency,
          toAmount: inMoney.amount,
        };
      }

      case "transaction.delete": {
        const tx = await this.db.transactions.get(
          envelope.payload.transactionId,
        );
        if (!tx) return null;
        await this.db.transactions.put({
          ...tx,
          deletedAt: nowIso,
        });
        return { kind: "restore_transaction", transaction: tx };
      }

      default:
        return null;
    }
  }

  private async revertOptimisticMutation(
    snapshot: Record<string, unknown>,
  ): Promise<void> {
    switch (snapshot.kind) {
      case "delete_account": {
        await this.db.accounts.delete(String(snapshot.accountId));
        break;
      }
      case "restore_account": {
        await this.db.accounts.put(snapshot.account as LocalAccount);
        break;
      }
      case "delete_category": {
        await this.db.categories.delete(String(snapshot.categoryId));
        break;
      }
      case "restore_category": {
        await this.db.categories.put(snapshot.category as LocalCategory);
        break;
      }
      case "undo_transaction_record": {
        await this.db.transactions.delete(String(snapshot.txId));
        const acc = await this.db.accounts.get(String(snapshot.accountId));
        if (acc) {
          const current = createMoney(acc.balance, acc.currency);
          const delta = createMoney(String(snapshot.amount), acc.currency);
          const next =
            snapshot.txKind === "income"
              ? subtractMoney(current, delta)
              : addMoney(current, delta);
          await this.db.accounts.put({
            ...acc,
            balance: next.amount,
            updatedAt: this.now().toISOString(),
          });
        }
        break;
      }
      case "undo_transfer": {
        await this.db.transactions.delete(String(snapshot.txId));
        const fromAcc = await this.db.accounts.get(
          String(snapshot.fromAccountId),
        );
        if (fromAcc) {
          const nextFrom = addMoney(
            createMoney(fromAcc.balance, fromAcc.currency),
            createMoney(String(snapshot.fromAmount), fromAcc.currency),
          );
          await this.db.accounts.put({
            ...fromAcc,
            balance: nextFrom.amount,
            updatedAt: this.now().toISOString(),
          });
        }
        const toAcc = await this.db.accounts.get(String(snapshot.toAccountId));
        if (toAcc) {
          const nextTo = subtractMoney(
            createMoney(toAcc.balance, toAcc.currency),
            createMoney(String(snapshot.toAmount), toAcc.currency),
          );
          await this.db.accounts.put({
            ...toAcc,
            balance: nextTo.amount,
            updatedAt: this.now().toISOString(),
          });
        }
        break;
      }
      case "restore_transaction": {
        await this.db.transactions.put(
          snapshot.transaction as LocalTransaction,
        );
        break;
      }
    }
  }
}
