import { describe, expect, it } from "vitest";
import {
  COMMAND_ACTORS,
  commandBatchRequestSchema,
  commandEnvelopeSchema,
} from "./catalog.js";

const BASE_META = {
  commandId: "11111111-1111-4111-8111-111111111111",
  actor: "agent" as const,
  issuedAtUtc: "2026-11-19T20:00:00.000Z",
};

describe("Command catalog Zod schemas", () => {
  it("exposes supported actors and parses transaction.record commands", () => {
    expect(COMMAND_ACTORS).toEqual(["manual", "agent", "system"]);

    const parsed = commandEnvelopeSchema.parse({
      ...BASE_META,
      type: "transaction.record",
      payload: {
        kind: "income",
        accountId: "22222222-2222-4222-8222-222222222222",
        amount: "2000",
        currency: "eur",
        description: "Pago de Y por trabajo X",
        clientOrPayee: "Cliente Y",
      },
    });

    expect(parsed.type).toBe("transaction.record");
    if (parsed.type === "transaction.record") {
      expect(parsed.payload.currency).toBe("EUR");
      expect(parsed.payload.source).toBe("manual");
    }
  });

  it("rejects self-transfers where fromAccountId equals toAccountId", () => {
    const sameAccount = "22222222-2222-4222-8222-222222222222";
    expect(() =>
      commandEnvelopeSchema.parse({
        ...BASE_META,
        type: "transaction.transfer",
        payload: {
          fromAccountId: sameAccount,
          toAccountId: sameAccount,
          amount: "500",
          currency: "EUR",
        },
      }),
    ).toThrow(/different/i);
  });

  it("parses account.create, recurring.upsert, investment.upsert, networth.upsert, and command.undo", () => {
    expect(
      commandEnvelopeSchema.parse({
        ...BASE_META,
        actor: "manual",
        type: "account.create",
        payload: {
          name: "American Express",
          accountType: "credit",
          currency: "USD",
          initialBalance: "2000",
        },
      }).type,
    ).toBe("account.create");

    expect(
      commandEnvelopeSchema.parse({
        ...BASE_META,
        type: "recurring.upsert",
        payload: {
          kind: "income",
          accountId: "22222222-2222-4222-8222-222222222222",
          amount: "2400",
          currency: "EUR",
          frequency: "monthly",
          dayOfMonth: 28,
          description: "Nómina",
        },
      }).type,
    ).toBe("recurring.upsert");

    expect(
      commandEnvelopeSchema.parse({
        ...BASE_META,
        type: "investment.upsert",
        payload: {
          assetType: "crypto",
          name: "Bitcoin",
          symbol: "BTC",
          quantity: "0.05",
          investedAmount: "3000",
          currentValue: "4200",
          currency: "EUR",
        },
      }).type,
    ).toBe("investment.upsert");

    expect(
      commandEnvelopeSchema.parse({
        ...BASE_META,
        type: "networth.upsert",
        payload: {
          kind: "asset",
          category: "collectibles_cards",
          name: "Colección cartas",
          estimatedValue: "1500",
          currency: "EUR",
        },
      }).type,
    ).toBe("networth.upsert");

    expect(
      commandEnvelopeSchema.parse({
        ...BASE_META,
        type: "command.undo",
        payload: {
          targetCommandId: "33333333-3333-4333-8333-333333333333",
        },
      }).type,
    ).toBe("command.undo");
  });

  it("validates offline sync batches (1..100 commands) and rejects empty batches", () => {
    expect(() => commandBatchRequestSchema.parse({ commands: [] })).toThrow();

    const batch = commandBatchRequestSchema.parse({
      commands: [
        {
          ...BASE_META,
          type: "account.archive",
          payload: {
            accountId: "22222222-2222-4222-8222-222222222222",
          },
        },
      ],
    });
    expect(batch.commands).toHaveLength(1);
  });
});
