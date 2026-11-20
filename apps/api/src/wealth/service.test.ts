import { describe, expect, it } from "vitest";
import {
  CommandBus,
  type CommandLogEntry,
  type CommandLogRepository,
} from "../commands/bus.js";
import {
  InvestmentNotFoundError,
  NetWorthItemNotFoundError,
  registerWealthCommandHandlers,
  type StoredInvestment,
  type StoredNetWorthItem,
  type WealthRepository,
  WealthService,
} from "./service.js";

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function createTestHarness() {
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

  const invStore = new Map<string, StoredInvestment>();
  const nwStore = new Map<string, StoredNetWorthItem>();

  const wealthRepo: WealthRepository = {
    async listInvestments(userId) {
      return [...invStore.values()].filter(
        (i) => i.userId === userId && i.deletedAt === null,
      );
    },
    async findInvestmentById(userId, id, includeDeleted = false) {
      const i = invStore.get(id);
      if (!i || i.userId !== userId) return null;
      if (!includeDeleted && i.deletedAt !== null) return null;
      return i;
    },
    async upsertInvestment(item) {
      invStore.set(item.id, item);
    },
    async setInvestmentDeletedAt(userId, id, deletedAt) {
      const i = invStore.get(id);
      if (!i || i.userId !== userId) return null;
      const updated = { ...i, deletedAt, updatedAt: new Date() };
      invStore.set(id, updated);
      return updated;
    },
    async listNetWorthItems(userId) {
      return [...nwStore.values()].filter(
        (i) => i.userId === userId && i.deletedAt === null,
      );
    },
    async findNetWorthItemById(userId, id, includeDeleted = false) {
      const i = nwStore.get(id);
      if (!i || i.userId !== userId) return null;
      if (!includeDeleted && i.deletedAt !== null) return null;
      return i;
    },
    async upsertNetWorthItem(item) {
      nwStore.set(item.id, item);
    },
    async setNetWorthItemDeletedAt(userId, id, deletedAt) {
      const i = nwStore.get(id);
      if (!i || i.userId !== userId) return null;
      const updated = { ...i, deletedAt, updatedAt: new Date() };
      nwStore.set(id, updated);
      return updated;
    },
  };

  const commandBus = new CommandBus({ repository: cmdRepo });
  const wealthService = new WealthService({ repository: wealthRepo });
  registerWealthCommandHandlers(commandBus, wealthService);

  return { commandBus, wealthService };
}

describe("WealthService + CommandBus handlers (Investments & Net Worth + Undo)", () => {
  it("upserts, updates, deletes, and undoes investments & net worth items with multi-tenant isolation", async () => {
    const { commandBus, wealthService } = createTestHarness();
    const invId = "71000000-0000-4000-8000-000000000001";
    const nwId = "72000000-0000-4000-8000-000000000001";

    // Create Investment
    const createInvCmd = "73000000-0000-4000-8000-000000000001";
    await commandBus.dispatch(USER_A, {
      commandId: createInvCmd,
      actor: "manual",
      issuedAtUtc: "2026-11-20T06:00:00.000Z",
      type: "investment.upsert",
      payload: {
        investmentId: invId,
        assetType: "Crypto",
        name: "Bitcoin",
        symbol: "BTC",
        quantity: "0.5",
        investedAmount: "15000",
        currentValue: "22000",
        currency: "EUR",
      },
    });
    expect(await wealthService.listInvestments(USER_A)).toHaveLength(1);

    // Update currentValue and Undo -> reverts to 22000
    const updateInvCmd = "73000000-0000-4000-8000-000000000002";
    await commandBus.dispatch(USER_A, {
      commandId: updateInvCmd,
      actor: "agent",
      issuedAtUtc: "2026-11-20T06:01:00.000Z",
      type: "investment.upsert",
      payload: {
        investmentId: invId,
        assetType: "Crypto",
        name: "Bitcoin",
        symbol: "BTC",
        quantity: "0.5",
        investedAmount: "15000",
        currentValue: "25000",
        currency: "EUR",
      },
    });
    expect((await wealthService.listInvestments(USER_A))[0]?.currentValue).toBe(
      "25000",
    );
    await commandBus.undo(USER_A, updateInvCmd, "manual");
    expect((await wealthService.listInvestments(USER_A))[0]?.currentValue).toBe(
      "22000",
    );

    // User B cannot delete User A's investment
    await expect(
      commandBus.dispatch(USER_B, {
        commandId: "73000000-0000-4000-8000-000000000003",
        actor: "manual",
        issuedAtUtc: "2026-11-20T06:02:00.000Z",
        type: "investment.delete",
        payload: { investmentId: invId },
      }),
    ).rejects.toThrow(InvestmentNotFoundError);

    // Create Net Worth item + Delete + Undo
    await commandBus.dispatch(USER_A, {
      commandId: "73000000-0000-4000-8000-000000000004",
      actor: "manual",
      issuedAtUtc: "2026-11-20T06:03:00.000Z",
      type: "networth.upsert",
      payload: {
        itemId: nwId,
        kind: "asset",
        category: "Cartas y Coleccionables",
        name: "Colección Pokémon",
        estimatedValue: "4500",
        currency: "EUR",
      },
    });
    expect(await wealthService.listNetWorthItems(USER_A)).toHaveLength(1);

    const delNwCmd = "73000000-0000-4000-8000-000000000005";
    await commandBus.dispatch(USER_A, {
      commandId: delNwCmd,
      actor: "manual",
      issuedAtUtc: "2026-11-20T06:04:00.000Z",
      type: "networth.delete",
      payload: { itemId: nwId },
    });
    expect(await wealthService.listNetWorthItems(USER_A)).toHaveLength(0);

    await commandBus.undo(USER_A, delNwCmd, "manual");
    expect(await wealthService.listNetWorthItems(USER_A)).toHaveLength(1);

    await expect(
      commandBus.dispatch(USER_B, {
        commandId: "73000000-0000-4000-8000-000000000006",
        actor: "manual",
        issuedAtUtc: "2026-11-20T06:05:00.000Z",
        type: "networth.delete",
        payload: { itemId: nwId },
      }),
    ).rejects.toThrow(NetWorthItemNotFoundError);
  });
});
