import { randomUUID } from "node:crypto";
import type { CategoryScope, SupportedLocale } from "@agenticf/domain";
import { and, asc, count, eq, isNull } from "drizzle-orm";
import type { CommandBus } from "../commands/bus.js";
import type { DbClient } from "../db/client.js";
import { categories } from "../db/schema/transactions.js";

export interface StoredCategory {
  readonly id: string;
  readonly userId: string;
  readonly scope: CategoryScope;
  readonly name: string;
  readonly icon: string | null;
  readonly color: string | null;
  readonly deletedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CategoriesRepository {
  listByUser(userId: string, scope?: CategoryScope): Promise<StoredCategory[]>;
  countAllByUser(userId: string): Promise<number>;
  findById(
    userId: string,
    categoryId: string,
    includeDeleted?: boolean,
  ): Promise<StoredCategory | null>;
  insertMany(items: readonly StoredCategory[]): Promise<void>;
  upsert(item: StoredCategory): Promise<void>;
  setDeletedAt(
    userId: string,
    categoryId: string,
    deletedAt: Date | null,
  ): Promise<StoredCategory | null>;
}

export class CategoryNotFoundError extends Error {
  constructor(categoryId: string) {
    super(`Category "${categoryId}" not found`);
    this.name = "CategoryNotFoundError";
  }
}

interface DefaultCategoryPreset {
  readonly scope: CategoryScope;
  readonly nameEs: string;
  readonly nameEn: string;
  readonly icon: string;
}

const DEFAULT_CATEGORY_PRESETS: readonly DefaultCategoryPreset[] = [
  // Income
  { scope: "income", nameEs: "Nómina", nameEn: "Salary", icon: "briefcase" },
  { scope: "income", nameEs: "Freelance", nameEn: "Freelance", icon: "laptop" },
  {
    scope: "income",
    nameEs: "Dividendos",
    nameEn: "Dividends",
    icon: "trending-up",
  },
  { scope: "income", nameEs: "Regalos", nameEn: "Gifts", icon: "gift" },
  // Expense
  { scope: "expense", nameEs: "Vivienda", nameEn: "Housing", icon: "home" },
  { scope: "expense", nameEs: "Comida", nameEn: "Food", icon: "utensils" },
  { scope: "expense", nameEs: "Transporte", nameEn: "Transport", icon: "car" },
  {
    scope: "expense",
    nameEs: "Suscripciones",
    nameEn: "Subscriptions",
    icon: "repeat",
  },
  { scope: "expense", nameEs: "Ocio", nameEn: "Leisure", icon: "film" },
  { scope: "expense", nameEs: "Salud", nameEn: "Health", icon: "heart-pulse" },
  // Investment (no default 'other')
  { scope: "investment", nameEs: "Crypto", nameEn: "Crypto", icon: "bitcoin" },
  {
    scope: "investment",
    nameEs: "Acciones",
    nameEn: "Stocks",
    icon: "line-chart",
  },
  { scope: "investment", nameEs: "ETF", nameEn: "ETF", icon: "layers" },
  { scope: "investment", nameEs: "Fondos", nameEn: "Funds", icon: "pie-chart" },
  // Net worth (no default 'other')
  {
    scope: "networth",
    nameEs: "Inmuebles",
    nameEn: "Real Estate",
    icon: "building",
  },
  { scope: "networth", nameEs: "Vehículos", nameEn: "Vehicles", icon: "car" },
  {
    scope: "networth",
    nameEs: "Cartas y Coleccionables",
    nameEn: "Collectibles & Cards",
    icon: "sparkles",
  },
  {
    scope: "networth",
    nameEs: "Hipoteca",
    nameEn: "Mortgage",
    icon: "landmark",
  },
  {
    scope: "networth",
    nameEs: "Préstamos",
    nameEn: "Loans",
    icon: "file-text",
  },
];

export interface CategoriesServiceOptions {
  repository: CategoriesRepository;
  now?: () => Date;
}

export class CategoriesService {
  private readonly repository: CategoriesRepository;
  private readonly now: () => Date;

  constructor(options: CategoriesServiceOptions) {
    this.repository = options.repository;
    this.now = options.now ?? (() => new Date());
  }

  async seedDefaultCategories(
    userId: string,
    locale: SupportedLocale = "es",
  ): Promise<void> {
    const existingCount = await this.repository.countAllByUser(userId);
    if (existingCount > 0) {
      return;
    }

    const now = this.now();
    const items: StoredCategory[] = DEFAULT_CATEGORY_PRESETS.map((preset) => ({
      id: randomUUID(),
      userId,
      scope: preset.scope,
      name: locale === "en" ? preset.nameEn : preset.nameEs,
      icon: preset.icon,
      color: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    }));

    await this.repository.insertMany(items);
  }

  async listCategories(
    userId: string,
    scope?: CategoryScope,
  ): Promise<StoredCategory[]> {
    return this.repository.listByUser(userId, scope);
  }

  async getCategory(
    userId: string,
    categoryId: string,
    includeDeleted = false,
  ): Promise<StoredCategory | null> {
    return this.repository.findById(userId, categoryId, includeDeleted);
  }

  async upsertCategory(
    userId: string,
    input: {
      categoryId?: string;
      scope: CategoryScope;
      name: string;
      icon?: string;
      color?: string;
    },
  ): Promise<{ previous: StoredCategory | null; current: StoredCategory }> {
    const now = this.now();
    const categoryId = input.categoryId ?? randomUUID();
    const previous = await this.repository.findById(userId, categoryId, false);

    const current: StoredCategory = {
      id: categoryId,
      userId,
      scope: input.scope,
      name: input.name.trim(),
      icon: input.icon !== undefined ? input.icon : (previous?.icon ?? null),
      color:
        input.color !== undefined ? input.color : (previous?.color ?? null),
      deletedAt: null,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };

    await this.repository.upsert(current);
    return { previous, current };
  }

  async softDeleteCategory(
    userId: string,
    categoryId: string,
  ): Promise<StoredCategory> {
    const existing = await this.repository.findById(userId, categoryId, false);
    if (!existing) {
      throw new CategoryNotFoundError(categoryId);
    }

    const deleted = await this.repository.setDeletedAt(
      userId,
      categoryId,
      this.now(),
    );
    if (!deleted) {
      throw new CategoryNotFoundError(categoryId);
    }
    return deleted;
  }

  async restoreCategory(
    userId: string,
    categoryId: string,
  ): Promise<StoredCategory> {
    const restored = await this.repository.setDeletedAt(
      userId,
      categoryId,
      null,
    );
    if (!restored) {
      throw new CategoryNotFoundError(categoryId);
    }
    return restored;
  }
}

export function registerCategoryCommandHandlers(
  commandBus: CommandBus,
  categoriesService: CategoriesService,
): void {
  commandBus.registerHandler("category.upsert", {
    async execute(userId, payload) {
      const { previous, current } = await categoriesService.upsertCategory(
        userId,
        {
          ...(payload.categoryId ? { categoryId: payload.categoryId } : {}),
          scope: payload.scope,
          name: payload.name,
          ...(payload.icon !== undefined ? { icon: payload.icon } : {}),
          ...(payload.color !== undefined ? { color: payload.color } : {}),
        },
      );

      return {
        result: {
          categoryId: current.id,
          scope: current.scope,
          name: current.name,
        },
        inversePayload: previous
          ? {
              mode: "restore_previous",
              categoryId: previous.id,
              scope: previous.scope,
              name: previous.name,
              icon: previous.icon,
              color: previous.color,
            }
          : {
              mode: "soft_delete_created",
              categoryId: current.id,
            },
      };
    },
    async undo(userId, inversePayload) {
      const categoryId = String(inversePayload.categoryId);
      if (inversePayload.mode === "soft_delete_created") {
        await categoriesService.softDeleteCategory(userId, categoryId);
        return { categoryId, deleted: true };
      }

      const { current } = await categoriesService.upsertCategory(userId, {
        categoryId,
        scope: inversePayload.scope as CategoryScope,
        name: String(inversePayload.name),
        ...(typeof inversePayload.icon === "string"
          ? { icon: inversePayload.icon }
          : {}),
        ...(typeof inversePayload.color === "string"
          ? { color: inversePayload.color }
          : {}),
      });
      return { categoryId: current.id, restoredName: current.name };
    },
  });

  commandBus.registerHandler("category.delete", {
    async execute(userId, payload) {
      const deleted = await categoriesService.softDeleteCategory(
        userId,
        payload.categoryId,
      );
      return {
        result: { categoryId: deleted.id, deleted: true },
        inversePayload: { categoryId: deleted.id },
      };
    },
    async undo(userId, inversePayload) {
      const categoryId = String(inversePayload.categoryId);
      const restored = await categoriesService.restoreCategory(
        userId,
        categoryId,
      );
      return { categoryId: restored.id, restored: true };
    },
  });
}

export class PostgresCategoriesRepository implements CategoriesRepository {
  constructor(private readonly dbClient: DbClient) {}

  async listByUser(
    userId: string,
    scope?: CategoryScope,
  ): Promise<StoredCategory[]> {
    const condition = scope
      ? and(
          eq(categories.userId, userId),
          eq(categories.scope, scope),
          isNull(categories.deletedAt),
        )
      : and(eq(categories.userId, userId), isNull(categories.deletedAt));

    const rows = await this.dbClient.db
      .select()
      .from(categories)
      .where(condition)
      .orderBy(asc(categories.scope), asc(categories.name));

    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      scope: row.scope as CategoryScope,
      name: row.name,
      icon: row.icon,
      color: row.color,
      deletedAt: row.deletedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async countAllByUser(userId: string): Promise<number> {
    const rows = await this.dbClient.db
      .select({ total: count() })
      .from(categories)
      .where(eq(categories.userId, userId));
    return rows[0]?.total ?? 0;
  }

  async findById(
    userId: string,
    categoryId: string,
    includeDeleted = false,
  ): Promise<StoredCategory | null> {
    const condition = includeDeleted
      ? and(eq(categories.userId, userId), eq(categories.id, categoryId))
      : and(
          eq(categories.userId, userId),
          eq(categories.id, categoryId),
          isNull(categories.deletedAt),
        );

    const rows = await this.dbClient.db
      .select()
      .from(categories)
      .where(condition)
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      userId: row.userId,
      scope: row.scope as CategoryScope,
      name: row.name,
      icon: row.icon,
      color: row.color,
      deletedAt: row.deletedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async insertMany(items: readonly StoredCategory[]): Promise<void> {
    if (items.length === 0) return;
    await this.dbClient.db.insert(categories).values(
      items.map((item) => ({
        id: item.id,
        userId: item.userId,
        scope: item.scope,
        name: item.name,
        icon: item.icon,
        color: item.color,
        deletedAt: item.deletedAt,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
    );
  }

  async upsert(item: StoredCategory): Promise<void> {
    await this.dbClient.db
      .insert(categories)
      .values({
        id: item.id,
        userId: item.userId,
        scope: item.scope,
        name: item.name,
        icon: item.icon,
        color: item.color,
        deletedAt: item.deletedAt,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })
      .onConflictDoUpdate({
        target: categories.id,
        set: {
          scope: item.scope,
          name: item.name,
          icon: item.icon,
          color: item.color,
          deletedAt: item.deletedAt,
          updatedAt: item.updatedAt,
        },
      });
  }

  async setDeletedAt(
    userId: string,
    categoryId: string,
    deletedAt: Date | null,
  ): Promise<StoredCategory | null> {
    const rows = await this.dbClient.db
      .update(categories)
      .set({ deletedAt, updatedAt: new Date() })
      .where(and(eq(categories.userId, userId), eq(categories.id, categoryId)))
      .returning();

    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      userId: row.userId,
      scope: row.scope as CategoryScope,
      name: row.name,
      icon: row.icon,
      color: row.color,
      deletedAt: row.deletedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
