import { randomUUID } from "node:crypto";
import {
  createMoney,
  type NetWorthKind,
  normalizeCurrencyCode,
  toDbNumericString,
} from "@agenticf/domain";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { CommandBus } from "../commands/bus.js";
import type { DbClient } from "../db/client.js";
import { investments, netWorthItems } from "../db/schema/wealth.js";

export interface StoredInvestment {
  readonly id: string;
  readonly userId: string;
  readonly assetType: string;
  readonly name: string;
  readonly symbol: string | null;
  readonly quantity: string | null;
  readonly purchasedAt: string | null;
  readonly purchasePrice: string | null;
  readonly investedAmount: string;
  readonly currentValue: string;
  readonly currency: string;
  readonly deletedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface StoredNetWorthItem {
  readonly id: string;
  readonly userId: string;
  readonly kind: NetWorthKind;
  readonly category: string;
  readonly name: string;
  readonly estimatedValue: string;
  readonly currency: string;
  readonly deletedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface WealthRepository {
  listInvestments(userId: string): Promise<StoredInvestment[]>;
  findInvestmentById(
    userId: string,
    id: string,
    includeDeleted?: boolean,
  ): Promise<StoredInvestment | null>;
  upsertInvestment(item: StoredInvestment): Promise<void>;
  setInvestmentDeletedAt(
    userId: string,
    id: string,
    deletedAt: Date | null,
  ): Promise<StoredInvestment | null>;

  listNetWorthItems(userId: string): Promise<StoredNetWorthItem[]>;
  findNetWorthItemById(
    userId: string,
    id: string,
    includeDeleted?: boolean,
  ): Promise<StoredNetWorthItem | null>;
  upsertNetWorthItem(item: StoredNetWorthItem): Promise<void>;
  setNetWorthItemDeletedAt(
    userId: string,
    id: string,
    deletedAt: Date | null,
  ): Promise<StoredNetWorthItem | null>;
}

export class InvestmentNotFoundError extends Error {
  constructor(id: string) {
    super(`Investment "${id}" not found`);
    this.name = "InvestmentNotFoundError";
  }
}

export class NetWorthItemNotFoundError extends Error {
  constructor(id: string) {
    super(`Net worth item "${id}" not found`);
    this.name = "NetWorthItemNotFoundError";
  }
}

function normalizeStoredDecimal(raw: string): string {
  const trimmed = raw.replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
  return trimmed === "-0" ? "0" : trimmed;
}

export interface WealthServiceOptions {
  repository: WealthRepository;
  now?: () => Date;
}

export class WealthService {
  private readonly repository: WealthRepository;
  private readonly now: () => Date;

  constructor(options: WealthServiceOptions) {
    this.repository = options.repository;
    this.now = options.now ?? (() => new Date());
  }

  async listInvestments(userId: string): Promise<StoredInvestment[]> {
    return this.repository.listInvestments(userId);
  }

  async upsertInvestment(
    userId: string,
    input: {
      investmentId?: string;
      assetType: string;
      name: string;
      symbol?: string | null;
      quantity?: string | null;
      purchasedAt?: string | null;
      purchasePrice?: string | null;
      investedAmount: string;
      currentValue: string;
      currency: string;
    },
  ): Promise<{ previous: StoredInvestment | null; current: StoredInvestment }> {
    const now = this.now();
    const id = input.investmentId ?? randomUUID();
    const previous = await this.repository.findInvestmentById(
      userId,
      id,
      false,
    );
    const currency = normalizeCurrencyCode(input.currency);
    const investedMoney = createMoney(input.investedAmount, currency);
    const currentMoney = createMoney(input.currentValue, currency);

    const current: StoredInvestment = {
      id,
      userId,
      assetType: input.assetType.trim(),
      name: input.name.trim(),
      symbol:
        input.symbol !== undefined
          ? (input.symbol?.trim() ?? null)
          : (previous?.symbol ?? null),
      quantity:
        input.quantity !== undefined
          ? (input.quantity?.trim() ?? null)
          : (previous?.quantity ?? null),
      purchasedAt:
        input.purchasedAt !== undefined
          ? (input.purchasedAt?.trim() ?? null)
          : (previous?.purchasedAt ?? null),
      purchasePrice:
        input.purchasePrice !== undefined
          ? (input.purchasePrice?.trim() ?? null)
          : (previous?.purchasePrice ?? null),
      investedAmount: investedMoney.amount,
      currentValue: currentMoney.amount,
      currency,
      deletedAt: null,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };

    await this.repository.upsertInvestment(current);
    return { previous, current };
  }

  async softDeleteInvestment(
    userId: string,
    investmentId: string,
  ): Promise<StoredInvestment> {
    const existing = await this.repository.findInvestmentById(
      userId,
      investmentId,
      false,
    );
    if (!existing) throw new InvestmentNotFoundError(investmentId);

    const deleted = await this.repository.setInvestmentDeletedAt(
      userId,
      investmentId,
      this.now(),
    );
    if (!deleted) throw new InvestmentNotFoundError(investmentId);
    return deleted;
  }

  async restoreInvestment(
    userId: string,
    investmentId: string,
  ): Promise<StoredInvestment> {
    const restored = await this.repository.setInvestmentDeletedAt(
      userId,
      investmentId,
      null,
    );
    if (!restored) throw new InvestmentNotFoundError(investmentId);
    return restored;
  }

  async listNetWorthItems(userId: string): Promise<StoredNetWorthItem[]> {
    return this.repository.listNetWorthItems(userId);
  }

  async upsertNetWorthItem(
    userId: string,
    input: {
      itemId?: string;
      kind: NetWorthKind;
      category: string;
      name: string;
      estimatedValue: string;
      currency: string;
    },
  ): Promise<{
    previous: StoredNetWorthItem | null;
    current: StoredNetWorthItem;
  }> {
    const now = this.now();
    const id = input.itemId ?? randomUUID();
    const previous = await this.repository.findNetWorthItemById(
      userId,
      id,
      false,
    );
    const currency = normalizeCurrencyCode(input.currency);
    const valueMoney = createMoney(input.estimatedValue, currency);

    const current: StoredNetWorthItem = {
      id,
      userId,
      kind: input.kind,
      category: input.category.trim(),
      name: input.name.trim(),
      estimatedValue: valueMoney.amount,
      currency,
      deletedAt: null,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };

    await this.repository.upsertNetWorthItem(current);
    return { previous, current };
  }

  async softDeleteNetWorthItem(
    userId: string,
    itemId: string,
  ): Promise<StoredNetWorthItem> {
    const existing = await this.repository.findNetWorthItemById(
      userId,
      itemId,
      false,
    );
    if (!existing) throw new NetWorthItemNotFoundError(itemId);

    const deleted = await this.repository.setNetWorthItemDeletedAt(
      userId,
      itemId,
      this.now(),
    );
    if (!deleted) throw new NetWorthItemNotFoundError(itemId);
    return deleted;
  }

  async restoreNetWorthItem(
    userId: string,
    itemId: string,
  ): Promise<StoredNetWorthItem> {
    const restored = await this.repository.setNetWorthItemDeletedAt(
      userId,
      itemId,
      null,
    );
    if (!restored) throw new NetWorthItemNotFoundError(itemId);
    return restored;
  }
}

export function registerWealthCommandHandlers(
  commandBus: CommandBus,
  wealthService: WealthService,
): void {
  commandBus.registerHandler("investment.upsert", {
    async execute(userId, payload) {
      const { previous, current } = await wealthService.upsertInvestment(
        userId,
        {
          ...(payload.investmentId
            ? { investmentId: payload.investmentId }
            : {}),
          assetType: payload.assetType,
          name: payload.name,
          ...(payload.symbol !== undefined ? { symbol: payload.symbol } : {}),
          ...(payload.quantity !== undefined
            ? { quantity: payload.quantity }
            : {}),
          ...(payload.purchasedAt !== undefined
            ? { purchasedAt: payload.purchasedAt }
            : {}),
          ...(payload.purchasePrice !== undefined
            ? { purchasePrice: payload.purchasePrice }
            : {}),
          investedAmount: payload.investedAmount,
          currentValue: payload.currentValue,
          currency: payload.currency,
        },
      );

      return {
        result: {
          investmentId: current.id,
          name: current.name,
          currentValue: current.currentValue,
        },
        inversePayload: previous
          ? { mode: "restore_previous", item: previous }
          : { mode: "soft_delete_created", investmentId: current.id },
      };
    },
    async undo(userId, inversePayload) {
      if (inversePayload.mode === "soft_delete_created") {
        const id = String(inversePayload.investmentId);
        await wealthService.softDeleteInvestment(userId, id);
        return { investmentId: id, deleted: true };
      }
      const prev = inversePayload.item as StoredInvestment;
      await wealthService.upsertInvestment(userId, {
        investmentId: prev.id,
        assetType: prev.assetType,
        name: prev.name,
        symbol: prev.symbol,
        quantity: prev.quantity,
        purchasedAt: prev.purchasedAt,
        purchasePrice: prev.purchasePrice,
        investedAmount: prev.investedAmount,
        currentValue: prev.currentValue,
        currency: prev.currency,
      });
      return { investmentId: prev.id, restored: true };
    },
  });

  commandBus.registerHandler("investment.delete", {
    async execute(userId, payload) {
      const deleted = await wealthService.softDeleteInvestment(
        userId,
        payload.investmentId,
      );
      return {
        result: { investmentId: deleted.id, deleted: true },
        inversePayload: { investmentId: deleted.id },
      };
    },
    async undo(userId, inversePayload) {
      const id = String(inversePayload.investmentId);
      const restored = await wealthService.restoreInvestment(userId, id);
      return { investmentId: restored.id, restored: true };
    },
  });

  commandBus.registerHandler("networth.upsert", {
    async execute(userId, payload) {
      const { previous, current } = await wealthService.upsertNetWorthItem(
        userId,
        {
          ...(payload.itemId ? { itemId: payload.itemId } : {}),
          kind: payload.kind,
          category: payload.category,
          name: payload.name,
          estimatedValue: payload.estimatedValue,
          currency: payload.currency,
        },
      );

      return {
        result: {
          itemId: current.id,
          kind: current.kind,
          estimatedValue: current.estimatedValue,
        },
        inversePayload: previous
          ? { mode: "restore_previous", item: previous }
          : { mode: "soft_delete_created", itemId: current.id },
      };
    },
    async undo(userId, inversePayload) {
      if (inversePayload.mode === "soft_delete_created") {
        const id = String(inversePayload.itemId);
        await wealthService.softDeleteNetWorthItem(userId, id);
        return { itemId: id, deleted: true };
      }
      const prev = inversePayload.item as StoredNetWorthItem;
      await wealthService.upsertNetWorthItem(userId, {
        itemId: prev.id,
        kind: prev.kind,
        category: prev.category,
        name: prev.name,
        estimatedValue: prev.estimatedValue,
        currency: prev.currency,
      });
      return { itemId: prev.id, restored: true };
    },
  });

  commandBus.registerHandler("networth.delete", {
    async execute(userId, payload) {
      const deleted = await wealthService.softDeleteNetWorthItem(
        userId,
        payload.itemId,
      );
      return {
        result: { itemId: deleted.id, deleted: true },
        inversePayload: { itemId: deleted.id },
      };
    },
    async undo(userId, inversePayload) {
      const id = String(inversePayload.itemId);
      const restored = await wealthService.restoreNetWorthItem(userId, id);
      return { itemId: restored.id, restored: true };
    },
  });
}

export class PostgresWealthRepository implements WealthRepository {
  constructor(private readonly dbClient: DbClient) {}

  async listInvestments(userId: string): Promise<StoredInvestment[]> {
    const rows = await this.dbClient.db
      .select()
      .from(investments)
      .where(and(eq(investments.userId, userId), isNull(investments.deletedAt)))
      .orderBy(asc(investments.name));
    return rows.map((row) => this.mapInvestment(row));
  }

  async findInvestmentById(
    userId: string,
    id: string,
    includeDeleted = false,
  ): Promise<StoredInvestment | null> {
    const cond = includeDeleted
      ? and(eq(investments.userId, userId), eq(investments.id, id))
      : and(
          eq(investments.userId, userId),
          eq(investments.id, id),
          isNull(investments.deletedAt),
        );
    const rows = await this.dbClient.db
      .select()
      .from(investments)
      .where(cond)
      .limit(1);
    return rows[0] ? this.mapInvestment(rows[0]) : null;
  }

  async upsertInvestment(item: StoredInvestment): Promise<void> {
    const investedDb = toDbNumericString(
      createMoney(item.investedAmount, item.currency),
    );
    const currentDb = toDbNumericString(
      createMoney(item.currentValue, item.currency),
    );
    const quantityDb = item.quantity
      ? toDbNumericString(createMoney(item.quantity, item.currency))
      : null;
    const purchasePriceDb = item.purchasePrice
      ? toDbNumericString(createMoney(item.purchasePrice, item.currency))
      : null;

    await this.dbClient.db
      .insert(investments)
      .values({
        id: item.id,
        userId: item.userId,
        assetType: item.assetType,
        name: item.name,
        symbol: item.symbol,
        quantity: quantityDb,
        purchasedAt: item.purchasedAt,
        purchasePrice: purchasePriceDb,
        investedAmount: investedDb,
        currentValue: currentDb,
        currency: item.currency,
        deletedAt: item.deletedAt,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })
      .onConflictDoUpdate({
        target: investments.id,
        set: {
          assetType: item.assetType,
          name: item.name,
          symbol: item.symbol,
          quantity: quantityDb,
          purchasedAt: item.purchasedAt,
          purchasePrice: purchasePriceDb,
          investedAmount: investedDb,
          currentValue: currentDb,
          currency: item.currency,
          deletedAt: item.deletedAt,
          updatedAt: item.updatedAt,
        },
      });
  }

  async setInvestmentDeletedAt(
    userId: string,
    id: string,
    deletedAt: Date | null,
  ): Promise<StoredInvestment | null> {
    const rows = await this.dbClient.db
      .update(investments)
      .set({ deletedAt, updatedAt: new Date() })
      .where(and(eq(investments.userId, userId), eq(investments.id, id)))
      .returning();
    return rows[0] ? this.mapInvestment(rows[0]) : null;
  }

  async listNetWorthItems(userId: string): Promise<StoredNetWorthItem[]> {
    const rows = await this.dbClient.db
      .select()
      .from(netWorthItems)
      .where(
        and(eq(netWorthItems.userId, userId), isNull(netWorthItems.deletedAt)),
      )
      .orderBy(asc(netWorthItems.kind), asc(netWorthItems.name));
    return rows.map((row) => this.mapNetWorth(row));
  }

  async findNetWorthItemById(
    userId: string,
    id: string,
    includeDeleted = false,
  ): Promise<StoredNetWorthItem | null> {
    const cond = includeDeleted
      ? and(eq(netWorthItems.userId, userId), eq(netWorthItems.id, id))
      : and(
          eq(netWorthItems.userId, userId),
          eq(netWorthItems.id, id),
          isNull(netWorthItems.deletedAt),
        );
    const rows = await this.dbClient.db
      .select()
      .from(netWorthItems)
      .where(cond)
      .limit(1);
    return rows[0] ? this.mapNetWorth(rows[0]) : null;
  }

  async upsertNetWorthItem(item: StoredNetWorthItem): Promise<void> {
    const valueDb = toDbNumericString(
      createMoney(item.estimatedValue, item.currency),
    );
    await this.dbClient.db
      .insert(netWorthItems)
      .values({
        id: item.id,
        userId: item.userId,
        kind: item.kind,
        category: item.category,
        name: item.name,
        estimatedValue: valueDb,
        currency: item.currency,
        deletedAt: item.deletedAt,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })
      .onConflictDoUpdate({
        target: netWorthItems.id,
        set: {
          kind: item.kind,
          category: item.category,
          name: item.name,
          estimatedValue: valueDb,
          currency: item.currency,
          deletedAt: item.deletedAt,
          updatedAt: item.updatedAt,
        },
      });
  }

  async setNetWorthItemDeletedAt(
    userId: string,
    id: string,
    deletedAt: Date | null,
  ): Promise<StoredNetWorthItem | null> {
    const rows = await this.dbClient.db
      .update(netWorthItems)
      .set({ deletedAt, updatedAt: new Date() })
      .where(and(eq(netWorthItems.userId, userId), eq(netWorthItems.id, id)))
      .returning();
    return rows[0] ? this.mapNetWorth(rows[0]) : null;
  }

  private mapInvestment(
    row: typeof investments.$inferSelect,
  ): StoredInvestment {
    return {
      id: row.id,
      userId: row.userId,
      assetType: row.assetType,
      name: row.name,
      symbol: row.symbol,
      quantity: row.quantity ? normalizeStoredDecimal(row.quantity) : null,
      purchasedAt: row.purchasedAt,
      purchasePrice: row.purchasePrice
        ? normalizeStoredDecimal(row.purchasePrice)
        : null,
      investedAmount: normalizeStoredDecimal(row.investedAmount),
      currentValue: normalizeStoredDecimal(row.currentValue),
      currency: row.currency,
      deletedAt: row.deletedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapNetWorth(
    row: typeof netWorthItems.$inferSelect,
  ): StoredNetWorthItem {
    return {
      id: row.id,
      userId: row.userId,
      kind: row.kind as NetWorthKind,
      category: row.category,
      name: row.name,
      estimatedValue: normalizeStoredDecimal(row.estimatedValue),
      currency: row.currency,
      deletedAt: row.deletedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
