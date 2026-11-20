import {
  CATEGORY_SCOPES,
  createMoney,
  type FxRateSnapshot,
  formatMoney,
  formatMoneyWithBase,
  normalizeCurrencyCode,
  resolveCrossRate,
} from "@agenticf/domain";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { AuthService } from "../auth/service.js";
import type { CategoriesService } from "../categories/service.js";
import type { TransactionsService } from "../transactions/service.js";
import { requireAuthenticatedUser } from "./auth.js";
import type { FxRateReader } from "./fx.js";

export interface RegisterCategoryAndTransactionRoutesOptions {
  authService: AuthService;
  categoriesService?: CategoriesService;
  transactionsService?: TransactionsService;
  fxRateReader?: FxRateReader;
}

const listCategoriesQuerySchema = z.object({
  scope: z.enum(CATEGORY_SCOPES).optional(),
});

const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const listTransactionsQuerySchema = z.object({
  accountId: z.uuid().optional(),
  kind: z.enum(["income", "expense", "transfer"]).optional(),
  categoryId: z.uuid().optional(),
  fromDate: localDateSchema.optional(),
  toDate: localDateSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

async function loadOptionalFxSnapshot(
  fxRateReader?: FxRateReader,
): Promise<FxRateSnapshot | undefined> {
  if (!fxRateReader) {
    return undefined;
  }
  try {
    return (await fxRateReader.getLatestSnapshot()) ?? undefined;
  } catch {
    return undefined;
  }
}

function resolveDisplayRateToBase(
  currency: string,
  baseCurrency: string,
  storedRate: string | null,
  fxSnapshot?: FxRateSnapshot,
): string | null {
  if (normalizeCurrencyCode(currency) === normalizeCurrencyCode(baseCurrency)) {
    return "1";
  }
  if (storedRate) {
    return storedRate;
  }
  if (!fxSnapshot) {
    return null;
  }
  try {
    return resolveCrossRate(fxSnapshot, currency, baseCurrency);
  } catch {
    return null;
  }
}

export function registerCategoryAndTransactionRoutes(
  app: FastifyInstance,
  options: RegisterCategoryAndTransactionRoutesOptions,
): void {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const { authService, categoriesService, transactionsService, fxRateReader } =
    options;

  if (categoriesService) {
    typedApp.get(
      "/api/v1/categories",
      {
        schema: {
          querystring: listCategoriesQuerySchema,
        },
      },
      async (request, reply) => {
        const auth = await requireAuthenticatedUser(
          request,
          reply,
          authService,
        );
        if (!auth) return;

        const items = await categoriesService.listCategories(
          auth.user.id,
          request.query.scope,
        );

        return reply.code(200).send({
          categories: items.map((cat) => ({
            id: cat.id,
            scope: cat.scope,
            name: cat.name,
            icon: cat.icon,
            color: cat.color,
            createdAt: cat.createdAt.toISOString(),
            updatedAt: cat.updatedAt.toISOString(),
          })),
        });
      },
    );
  }

  if (transactionsService) {
    typedApp.get(
      "/api/v1/transactions",
      {
        schema: {
          querystring: listTransactionsQuerySchema,
        },
      },
      async (request, reply) => {
        const auth = await requireAuthenticatedUser(
          request,
          reply,
          authService,
        );
        if (!auth) return;

        const items = await transactionsService.listTransactions(auth.user.id, {
          ...(request.query.accountId
            ? { accountId: request.query.accountId }
            : {}),
          ...(request.query.kind ? { kind: request.query.kind } : {}),
          ...(request.query.categoryId
            ? { categoryId: request.query.categoryId }
            : {}),
          ...(request.query.fromDate
            ? { fromDate: request.query.fromDate }
            : {}),
          ...(request.query.toDate ? { toDate: request.query.toDate } : {}),
          limit: request.query.limit,
        });

        const needsLiveFx = items.some(
          (tx) =>
            tx.fxRateToBase === null &&
            normalizeCurrencyCode(tx.currency) !==
              normalizeCurrencyCode(auth.preferences.baseCurrency),
        );
        const fxSnapshot = needsLiveFx
          ? await loadOptionalFxSnapshot(fxRateReader)
          : undefined;

        const numberFormat = {
          thousandsSeparator: auth.preferences.thousandsSeparator,
          decimalSeparator: auth.preferences.decimalSeparator,
          symbolPosition: auth.preferences.symbolPosition,
        };

        return reply.code(200).send({
          transactions: items.map((tx) => {
            const rateToBase = resolveDisplayRateToBase(
              tx.currency,
              auth.preferences.baseCurrency,
              tx.fxRateToBase,
              fxSnapshot,
            );
            const formattedAmount = formatMoneyWithBase(
              createMoney(tx.amount, tx.currency),
              auth.preferences.baseCurrency,
              rateToBase,
              numberFormat,
            );

            const formattedDestinationAmount =
              tx.destinationAmount && tx.destinationCurrency
                ? formatMoney(
                    createMoney(tx.destinationAmount, tx.destinationCurrency),
                    numberFormat,
                  )
                : null;

            return {
              id: tx.id,
              kind: tx.kind,
              accountId: tx.accountId,
              destinationAccountId: tx.destinationAccountId,
              categoryId: tx.categoryId,
              amount: tx.amount,
              currency: tx.currency,
              formattedAmount,
              destinationAmount: tx.destinationAmount,
              destinationCurrency: tx.destinationCurrency,
              formattedDestinationAmount,
              fxRateToBase: tx.fxRateToBase,
              occurredAtUtc: tx.occurredAtUtc.toISOString(),
              localDate: tx.localDate,
              timezone: tx.timezone,
              description: tx.description,
              clientOrPayee: tx.clientOrPayee,
              source: tx.source,
              externalId: tx.externalId,
              createdAt: tx.createdAt.toISOString(),
            };
          }),
        });
      },
    );
  }
}
