import { describe, expect, it } from "vitest";
import {
  CommandBus,
  type CommandLogEntry,
  type CommandLogRepository,
} from "../commands/bus.js";
import {
  type CategoriesRepository,
  CategoriesService,
  CategoryNotFoundError,
  registerCategoryCommandHandlers,
  type StoredCategory,
} from "./service.js";

function createInMemoryCategoriesRepo(): CategoriesRepository {
  const store = new Map<string, StoredCategory>();
  return {
    async listByUser(userId, scope) {
      return [...store.values()].filter(
        (c) =>
          c.userId === userId &&
          c.deletedAt === null &&
          (scope === undefined || c.scope === scope),
      );
    },
    async countAllByUser(userId) {
      return [...store.values()].filter((c) => c.userId === userId).length;
    },
    async findById(userId, categoryId, includeDeleted = false) {
      const c = store.get(categoryId);
      if (!c || c.userId !== userId) return null;
      if (!includeDeleted && c.deletedAt !== null) return null;
      return c;
    },
    async insertMany(items) {
      for (const item of items) {
        store.set(item.id, item);
      }
    },
    async upsert(item) {
      store.set(item.id, item);
    },
    async setDeletedAt(userId, categoryId, deletedAt) {
      const c = store.get(categoryId);
      if (!c || c.userId !== userId) return null;
      const updated: StoredCategory = {
        ...c,
        deletedAt,
        updatedAt: new Date(),
      };
      store.set(categoryId, updated);
      return updated;
    },
  };
}

function createInMemoryCommandRepo(): CommandLogRepository {
  const entries = new Map<string, CommandLogEntry>();
  return {
    async findByCommandId(userId, commandId) {
      const e = entries.get(commandId);
      return e && e.userId === userId ? e : null;
    },
    async insert(entry) {
      entries.set(entry.commandId, entry);
    },
    async markUndone(userId, commandId, undoneByCommandId, undoneAt) {
      const e = entries.get(commandId);
      if (!e || e.userId !== userId) return false;
      entries.set(commandId, { ...e, undoneAt, undoneByCommandId });
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

describe("CategoriesService (editable user presets + CommandBus upsert/delete/undo)", () => {
  it("seeds initial ES/EN categories once without 'other' defaults and lets users delete presets like ETF", async () => {
    const categoriesService = new CategoriesService({
      repository: createInMemoryCategoriesRepo(),
    });
    const commandBus = new CommandBus({
      repository: createInMemoryCommandRepo(),
    });
    registerCategoryCommandHandlers(commandBus, categoriesService);

    await categoriesService.seedDefaultCategories(USER_A, "es");
    const seeded = await categoriesService.listCategories(USER_A);

    expect(seeded.length).toBeGreaterThanOrEqual(15);
    expect(seeded.some((c) => c.name.toLowerCase() === "other")).toBe(false);
    expect(seeded.some((c) => c.name.toLowerCase() === "otros")).toBe(false);

    // Calling seed again does not duplicate or resurrect deleted presets
    const etf = seeded.find(
      (c) => c.scope === "investment" && c.name === "ETF",
    );
    expect(etf).toBeDefined();
    if (!etf) throw new Error("ETF preset not found");

    const deleteCmdId = "10000000-0000-4000-8000-000000000001";
    await commandBus.dispatch(USER_A, {
      commandId: deleteCmdId,
      actor: "manual",
      issuedAtUtc: "2026-11-19T22:00:00.000Z",
      type: "category.delete",
      payload: { categoryId: etf.id },
    });

    // Re-running seedDefaultCategories MUST NOT resurrect ETF
    await categoriesService.seedDefaultCategories(USER_A, "es");
    const afterDelete = await categoriesService.listCategories(
      USER_A,
      "investment",
    );
    expect(afterDelete.some((c) => c.name === "ETF")).toBe(false);

    // Undo restores ETF cleanly
    await commandBus.undo(USER_A, deleteCmdId, "manual");
    const afterUndo = await categoriesService.listCategories(
      USER_A,
      "investment",
    );
    expect(afterUndo.some((c) => c.name === "ETF")).toBe(true);
  });

  it("creates, renames, undoes custom categories, and enforces tenant isolation", async () => {
    const categoriesService = new CategoriesService({
      repository: createInMemoryCategoriesRepo(),
    });
    const commandBus = new CommandBus({
      repository: createInMemoryCommandRepo(),
    });
    registerCategoryCommandHandlers(commandBus, categoriesService);

    const catId = "33333333-3333-4333-8333-333333333333";
    const createCmdId = "20000000-0000-4000-8000-000000000001";
    await commandBus.dispatch(USER_A, {
      commandId: createCmdId,
      actor: "agent",
      issuedAtUtc: "2026-11-19T22:00:00.000Z",
      type: "category.upsert",
      payload: {
        categoryId: catId,
        scope: "investment",
        name: "Crowdlending",
        color: "#10b981",
      },
    });

    const renameCmdId = "20000000-0000-4000-8000-000000000002";
    await commandBus.dispatch(USER_A, {
      commandId: renameCmdId,
      actor: "manual",
      issuedAtUtc: "2026-11-19T22:01:00.000Z",
      type: "category.upsert",
      payload: {
        categoryId: catId,
        scope: "investment",
        name: "Crowdlending Solar",
      },
    });

    expect(
      (await categoriesService.listCategories(USER_A, "investment"))[0]?.name,
    ).toBe("Crowdlending Solar");

    // Undo rename restores original name
    await commandBus.undo(USER_A, renameCmdId, "manual");
    expect(
      (await categoriesService.listCategories(USER_A, "investment"))[0]?.name,
    ).toBe("Crowdlending");

    // User B cannot delete User A's category
    await expect(
      commandBus.dispatch(USER_B, {
        commandId: "20000000-0000-4000-8000-000000000003",
        actor: "manual",
        issuedAtUtc: "2026-11-19T22:02:00.000Z",
        type: "category.delete",
        payload: { categoryId: catId },
      }),
    ).rejects.toThrow(CategoryNotFoundError);

    // Undo create removes it
    await commandBus.undo(USER_A, createCmdId, "manual");
    expect(
      await categoriesService.listCategories(USER_A, "investment"),
    ).toEqual([]);
  });
});
