import {
  createMoney,
  type FxRateSnapshot,
  formatMoneyWithBase,
  normalizeCurrencyCode,
  resolveCrossRate,
} from "@agenticf/domain";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { AuthService } from "../auth/service.js";
import type { RecurringService } from "../recurring/service.js";
import { requireAuthenticatedUser } from "./auth.js";
import type { FxRateReader } from "./fx.js";

export interface RegisterRecurringRoutesOptions {
  authService: AuthService;
  recurringService: RecurringService;
  fxRateReader?: FxRateReader;
}

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
  fxSnapshot?: FxRateSnapshot,
): string | null {
  if (normalizeCurrencyCode(currency) === normalizeCurrencyCode(baseCurrency)) {
    return "1";
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

export function registerRecurringRoutes(
  app: FastifyInstance,
  options: RegisterRecurringRoutesOptions,
): void {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const { authService, recurringService, fxRateReader } = options;

  typedApp.get("/api/v1/recurring", async (request, reply) => {
    const auth = await requireAuthenticatedUser(request, reply, authService);
    if (!auth) return;

    const rules = await recurringService.listRules(auth.user.id);
    const needsFx = rules.some(
      (r) =>
        normalizeCurrencyCode(r.currency) !==
        normalizeCurrencyCode(auth.preferences.baseCurrency),
    );
    const fxSnapshot = needsFx
      ? await loadOptionalFxSnapshot(fxRateReader)
      : undefined;

    const numberFormat = {
      thousandsSeparator: auth.preferences.thousandsSeparator,
      decimalSeparator: auth.preferences.decimalSeparator,
      symbolPosition: auth.preferences.symbolPosition,
    };

    return reply.code(200).send({
      rules: rules.map((r) => {
        const rateToBase = resolveDisplayRateToBase(
          r.currency,
          auth.preferences.baseCurrency,
          fxSnapshot,
        );
        const formattedAmount = formatMoneyWithBase(
          createMoney(r.amount, r.currency),
          auth.preferences.baseCurrency,
          rateToBase,
          numberFormat,
        );

        return {
          id: r.id,
          kind: r.kind,
          accountId: r.accountId,
          categoryId: r.categoryId,
          amount: r.amount,
          currency: r.currency,
          formattedAmount,
          frequency: r.frequency,
          dayOfMonth: r.dayOfMonth,
          dayOfWeek: r.dayOfWeek,
          description: r.description,
          isActive: r.isActive,
          lastTriggeredLocalDate: r.lastTriggeredLocalDate,
          nextDueLocalDate: r.nextDueLocalDate,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        };
      }),
    });
  });

  typedApp.post("/api/v1/recurring/run-due", async (request, reply) => {
    const auth = await requireAuthenticatedUser(request, reply, authService);
    if (!auth) return;

    const result = await recurringService.processDueRecurringRules(
      auth.user.id,
    );
    return reply.code(200).send(result);
  });
}
