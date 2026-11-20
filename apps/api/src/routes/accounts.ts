import { computeBalancesSummary, type FxRateSnapshot } from "@agenticf/domain";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { AccountsService } from "../accounts/service.js";
import type { AuthService } from "../auth/service.js";
import { requireAuthenticatedUser } from "./auth.js";
import type { FxRateReader } from "./fx.js";

export interface RegisterAccountRoutesOptions {
  authService: AuthService;
  accountsService: AccountsService;
  fxRateReader?: FxRateReader;
}

const listAccountsQuerySchema = z.object({
  includeArchived: z.coerce.boolean().default(false),
});

const accountParamsSchema = z.object({
  accountId: z.uuid(),
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

export function registerAccountRoutes(
  app: FastifyInstance,
  options: RegisterAccountRoutesOptions,
): void {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const { authService, accountsService, fxRateReader } = options;

  typedApp.get(
    "/api/v1/accounts",
    {
      schema: {
        querystring: listAccountsQuerySchema,
      },
    },
    async (request, reply) => {
      const auth = await requireAuthenticatedUser(request, reply, authService);
      if (!auth) return;

      const storedAccounts = await accountsService.listAccounts(
        auth.user.id,
        request.query.includeArchived,
      );
      const fxSnapshot = await loadOptionalFxSnapshot(fxRateReader);

      const summary = computeBalancesSummary(
        storedAccounts.map((acc) => ({
          id: acc.id,
          name: acc.name,
          accountType: acc.accountType,
          currency: acc.currency,
          balance: acc.currentBalance,
          isArchived: acc.isArchived,
        })),
        auth.preferences,
        fxSnapshot,
      );

      return reply.code(200).send(summary);
    },
  );

  typedApp.get(
    "/api/v1/accounts/:accountId",
    {
      schema: {
        params: accountParamsSchema,
      },
    },
    async (request, reply) => {
      const auth = await requireAuthenticatedUser(request, reply, authService);
      if (!auth) return;

      const account = await accountsService.getAccount(
        auth.user.id,
        request.params.accountId,
      );
      if (!account) {
        return reply.code(404).send({
          error: "ACCOUNT_NOT_FOUND",
          message: "Account not found",
        });
      }

      const fxSnapshot = await loadOptionalFxSnapshot(fxRateReader);

      const summary = computeBalancesSummary(
        [
          {
            id: account.id,
            name: account.name,
            accountType: account.accountType,
            currency: account.currency,
            balance: account.currentBalance,
            isArchived: account.isArchived,
          },
        ],
        auth.preferences,
        fxSnapshot,
      );

      return reply.code(200).send({
        account: summary.accounts[0],
      });
    },
  );
}
