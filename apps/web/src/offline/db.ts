import {
  type AccountType,
  type CategoryScope,
  type CommandEnvelope,
  DEFAULT_USER_PREFERENCES,
  type FinancialPeriod,
  type FxRateSnapshot,
  type NetWorthKind,
  type TransactionSource,
  type UserPreferences,
} from "@agenticf/domain";
import { Dexie, type Table } from "dexie";

export interface LocalAccount {
  id: string;
  name: string;
  accountType: AccountType;
  currency: string;
  balance: string;
  isArchived: boolean;
  updatedAt: string;
}

export interface LocalCategory {
  id: string;
  scope: CategoryScope;
  name: string;
  icon: string | null;
  color: string | null;
  deletedAt: string | null;
  updatedAt: string;
}

export interface LocalTransaction {
  id: string;
  kind: "income" | "expense" | "transfer";
  accountId: string;
  destinationAccountId: string | null;
  categoryId: string | null;
  amount: string;
  currency: string;
  destinationAmount: string | null;
  destinationCurrency: string | null;
  fxRateToBase: string | null;
  occurredAtUtc: string;
  localDate: string;
  timezone: string;
  description: string;
  clientOrPayee: string | null;
  source: TransactionSource;
  externalId: string | null;
  deletedAt: string | null;
}

export interface LocalRecurringRule {
  id: string;
  kind: "income" | "expense";
  accountId: string;
  categoryId: string | null;
  amount: string;
  currency: string;
  frequency: FinancialPeriod;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  description: string;
  isActive: boolean;
  lastTriggeredLocalDate: string | null;
  nextDueLocalDate: string;
  deletedAt: string | null;
  updatedAt: string;
}

export interface LocalInvestment {
  id: string;
  assetType: string;
  name: string;
  symbol: string | null;
  quantity: string | null;
  purchasedAt?: string | null;
  purchasePrice?: string | null;
  investedAmount: string;
  currentValue: string;
  currency: string;
  deletedAt: string | null;
  updatedAt: string;
}

export interface LocalNetWorthItem {
  id: string;
  kind: NetWorthKind;
  category: string;
  name: string;
  estimatedValue: string;
  currency: string;
  deletedAt: string | null;
  updatedAt: string;
}

export type OutboxItemStatus = "pending" | "syncing" | "synced" | "failed";

export interface OutboxEntry {
  commandId: string;
  envelope: CommandEnvelope;
  status: OutboxItemStatus;
  attempts: number;
  lastError: string | null;
  enqueuedAt: string;
  syncedAt: string | null;
  inverseSnapshot?: Record<string, unknown> | null;
}

interface StoredKvRow {
  key: string;
  value: unknown;
}

export class AgenticfOfflineDb extends Dexie {
  accounts!: Table<LocalAccount, string>;
  categories!: Table<LocalCategory, string>;
  transactions!: Table<LocalTransaction, string>;
  recurringRules!: Table<LocalRecurringRule, string>;
  investments!: Table<LocalInvestment, string>;
  netWorthItems!: Table<LocalNetWorthItem, string>;
  outbox!: Table<OutboxEntry, string>;
  kv!: Table<StoredKvRow, string>;

  constructor(databaseName = "agenticf_offline_v1") {
    super(databaseName);
    this.version(1).stores({
      accounts: "id, accountType, currency, isArchived",
      categories: "id, scope, name, deletedAt",
      transactions:
        "id, kind, accountId, destinationAccountId, categoryId, localDate, occurredAtUtc, deletedAt",
      recurringRules:
        "id, kind, accountId, isActive, nextDueLocalDate, deletedAt",
      investments: "id, assetType, currency, deletedAt",
      netWorthItems: "id, kind, category, currency, deletedAt",
      outbox: "commandId, status, enqueuedAt",
      kv: "key",
    });
  }

  async saveFxSnapshot(snapshot: FxRateSnapshot): Promise<void> {
    await this.kv.put({ key: "fx_latest", value: snapshot });
  }

  async getLatestFxSnapshot(): Promise<FxRateSnapshot | null> {
    const row = await this.kv.get("fx_latest");
    return (row?.value as FxRateSnapshot | undefined) ?? null;
  }

  async savePreferences(preferences: UserPreferences): Promise<void> {
    await this.kv.put({ key: "user_preferences", value: preferences });
  }

  async getPreferences(): Promise<UserPreferences> {
    const row = await this.kv.get("user_preferences");
    return (
      (row?.value as UserPreferences | undefined) ?? DEFAULT_USER_PREFERENCES
    );
  }

  async setLastSyncAt(isoTimestamp: string): Promise<void> {
    await this.kv.put({ key: "last_sync_at", value: isoTimestamp });
  }

  async getLastSyncAt(): Promise<string | null> {
    const row = await this.kv.get("last_sync_at");
    return typeof row?.value === "string" ? row.value : null;
  }

  async clearLocalUserData(): Promise<void> {
    await this.transaction(
      "rw",
      [
        this.accounts,
        this.categories,
        this.transactions,
        this.recurringRules,
        this.investments,
        this.netWorthItems,
        this.outbox,
        this.kv,
      ],
      async () => {
        await Promise.all([
          this.accounts.clear(),
          this.categories.clear(),
          this.transactions.clear(),
          this.recurringRules.clear(),
          this.investments.clear(),
          this.netWorthItems.clear(),
          this.outbox.clear(),
          this.kv.clear(),
        ]);
      },
    );
  }
}

export function createOfflineDb(databaseName?: string): AgenticfOfflineDb {
  return new AgenticfOfflineDb(databaseName);
}
