import {
  computePeriodAnalytics,
  FINANCIAL_PERIODS,
  type FxRateSnapshot,
  getPeriodBoundsUtc,
  localDateTimeToUtc,
} from "@agenticf/domain";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { AuthService } from "../auth/service.js";
import type { CategoriesService } from "../categories/service.js";
import type { TransactionsService } from "../transactions/service.js";
import { requireAuthenticatedUser } from "./auth.js";
import type { FxRateReader } from "./fx.js";

export interface RegisterAnalyticsRoutesOptions {
  authService: AuthService;
  transactionsService: TransactionsService;
  categoriesService?: CategoriesService;
  fxRateReader?: FxRateReader;
}

const analyticsSummaryQuerySchema = z.object({
  period: z.enum(FINANCIAL_PERIODS).default("monthly"),
  referenceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
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

export function registerAnalyticsRoutes(
  app: FastifyInstance,
  options: RegisterAnalyticsRoutesOptions,
): void {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const { authService, transactionsService, categoriesService, fxRateReader } =
    options;

  typedApp.get(
    "/api/v1/analytics/summary",
    {
      schema: {
        querystring: analyticsSummaryQuerySchema,
      },
    },
    async (request, reply) => {
      const auth = await requireAuthenticatedUser(request, reply, authService);
      if (!auth) return;

      const referenceDateUtc = request.query.referenceDate
        ? localDateTimeToUtc(
            request.query.referenceDate,
            "12:00:00",
            auth.preferences.timezone,
          )
        : new Date();

      const bounds = getPeriodBoundsUtc(
        request.query.period,
        referenceDateUtc,
        auth.preferences.timezone,
      );

      const [transactions, categories, fxSnapshot] = await Promise.all([
        transactionsService.listTransactions(auth.user.id, {
          fromDate: bounds.startLocalDate,
          toDate: bounds.endLocalDate,
          limit: 5000,
        }),
        categoriesService
          ? categoriesService.listCategories(auth.user.id)
          : Promise.resolve([]),
        loadOptionalFxSnapshot(fxRateReader),
      ]);

      const report = computePeriodAnalytics(
        transactions.map((tx) => ({
          id: tx.id,
          kind: tx.kind,
          amount: tx.amount,
          currency: tx.currency,
          fxRateToBase: tx.fxRateToBase,
          localDate: tx.localDate,
          categoryId: tx.categoryId,
        })),
        categories.map((c) => ({ id: c.id, name: c.name })),
        {
          period: request.query.period,
          referenceDateUtc,
          preferences: auth.preferences,
          ...(fxSnapshot ? { fxSnapshot } : {}),
        },
      );

      return reply.code(200).send(report);
    },
  );
}
