import {
  computeBalancesSummary,
  computeInvestmentsSummary,
  computeNetWorthSummary,
  exportAccountsToCsv,
  exportInvestmentsToCsv,
  exportNetWorthToCsv,
  exportTransactionsToCsv,
  type FxRateSnapshot,
} from "@agenticf/domain";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { AccountsService } from "../accounts/service.js";
import type { AuthService } from "../auth/service.js";
import type { TransactionsService } from "../transactions/service.js";
import type { WealthService } from "../wealth/service.js";
import { requireAuthenticatedUser } from "./auth.js";
import type { FxRateReader } from "./fx.js";

export interface RegisterWealthRoutesOptions {
  authService: AuthService;
  wealthService: WealthService;
  accountsService?: AccountsService;
  transactionsService?: TransactionsService;
  fxRateReader?: FxRateReader;
}

const csvExportQuerySchema = z.object({
  dataset: z.enum(["accounts", "transactions", "investments", "networth"]),
});

async function loadOptionalFxSnapshot(
  fxRateReader?: FxRateReader,
): Promise<FxRateSnapshot | undefined> {
  if (!fxRateReader) return undefined;
  try {
    return (await fxRateReader.getLatestSnapshot()) ?? undefined;
  } catch {
    return undefined;
  }
}

export function registerWealthRoutes(
  app: FastifyInstance,
  options: RegisterWealthRoutesOptions,
): void {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const {
    authService,
    wealthService,
    accountsService,
    transactionsService,
    fxRateReader,
  } = options;

  typedApp.get("/api/v1/investments", async (request, reply) => {
    const auth = await requireAuthenticatedUser(request, reply, authService);
    if (!auth) return;

    const [stored, fxSnapshot] = await Promise.all([
      wealthService.listInvestments(auth.user.id),
      loadOptionalFxSnapshot(fxRateReader),
    ]);

    const summary = computeInvestmentsSummary(
      stored.map((i) => ({
        id: i.id,
        assetType: i.assetType,
        name: i.name,
        symbol: i.symbol,
        quantity: i.quantity,
        investedAmount: i.investedAmount,
        currentValue: i.currentValue,
        currency: i.currency,
      })),
      auth.preferences,
      fxSnapshot,
    );

    return reply.code(200).send(summary);
  });

  typedApp.get("/api/v1/networth", async (request, reply) => {
    const auth = await requireAuthenticatedUser(request, reply, authService);
    if (!auth) return;

    const [accounts, investments, nwItems, fxSnapshot] = await Promise.all([
      accountsService
        ? accountsService.listAccounts(auth.user.id, false)
        : Promise.resolve([]),
      wealthService.listInvestments(auth.user.id),
      wealthService.listNetWorthItems(auth.user.id),
      loadOptionalFxSnapshot(fxRateReader),
    ]);

    const balancesSummary = computeBalancesSummary(
      accounts.map((a) => ({
        id: a.id,
        name: a.name,
        accountType: a.accountType,
        currency: a.currency,
        balance: a.currentBalance,
        isArchived: a.isArchived,
      })),
      auth.preferences,
      fxSnapshot,
    );

    const invSummary = computeInvestmentsSummary(
      investments.map((i) => ({
        id: i.id,
        assetType: i.assetType,
        name: i.name,
        symbol: i.symbol,
        quantity: i.quantity,
        investedAmount: i.investedAmount,
        currentValue: i.currentValue,
        currency: i.currency,
      })),
      auth.preferences,
      fxSnapshot,
    );

    const nwSummary = computeNetWorthSummary(
      balancesSummary.totalBalance,
      invSummary.totalCurrentValue,
      nwItems.map((i) => ({
        id: i.id,
        kind: i.kind,
        category: i.category,
        name: i.name,
        estimatedValue: i.estimatedValue,
        currency: i.currency,
      })),
      auth.preferences,
      fxSnapshot,
    );

    return reply.code(200).send(nwSummary);
  });

  typedApp.get(
    "/api/v1/export/csv",
    {
      schema: {
        querystring: csvExportQuerySchema,
      },
    },
    async (request, reply) => {
      const auth = await requireAuthenticatedUser(request, reply, authService);
      if (!auth) return;

      const { dataset } = request.query;
      let csv = "";

      if (dataset === "accounts") {
        const accounts = accountsService
          ? await accountsService.listAccounts(auth.user.id, true)
          : [];
        csv = exportAccountsToCsv(
          accounts.map((a) => ({
            name: a.name,
            accountType: a.accountType,
            currency: a.currency,
            balance: a.currentBalance,
            isArchived: a.isArchived,
          })),
          auth.preferences,
        );
      } else if (dataset === "transactions") {
        const txs = transactionsService
          ? await transactionsService.listTransactions(auth.user.id, {
              limit: 10000,
            })
          : [];
        csv = exportTransactionsToCsv(
          txs.map((tx) => ({
            localDate: tx.localDate,
            kind: tx.kind,
            amount: tx.amount,
            currency: tx.currency,
            description: tx.description,
            clientOrPayee: tx.clientOrPayee,
            source: tx.source,
          })),
          auth.preferences,
        );
      } else if (dataset === "investments") {
        const items = await wealthService.listInvestments(auth.user.id);
        csv = exportInvestmentsToCsv(
          items.map((i) => ({
            assetType: i.assetType,
            name: i.name,
            symbol: i.symbol,
            quantity: i.quantity,
            investedAmount: i.investedAmount,
            currentValue: i.currentValue,
            currency: i.currency,
          })),
          auth.preferences,
        );
      } else {
        const items = await wealthService.listNetWorthItems(auth.user.id);
        csv = exportNetWorthToCsv(
          items.map((i) => ({
            kind: i.kind,
            category: i.category,
            name: i.name,
            estimatedValue: i.estimatedValue,
            currency: i.currency,
          })),
          auth.preferences,
        );
      }

      return reply
        .code(200)
        .header("content-type", "text/csv; charset=utf-8")
        .header(
          "content-disposition",
          `attachment; filename="agenticf-${dataset}.csv"`,
        )
        .send(csv);
    },
  );
}
