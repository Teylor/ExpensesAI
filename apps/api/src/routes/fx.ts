import {
  convertMoney,
  createMoney,
  currencyCodeSchema,
  decimalStringSchema,
  type FxRateSnapshot,
  MissingFxRateError,
  resolveCrossRate,
} from "@agenticf/domain";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

export interface FxRateReader {
  getLatestSnapshot(): Promise<FxRateSnapshot | null>;
}

const convertQuerySchema = z.object({
  from: currencyCodeSchema,
  to: currencyCodeSchema,
  amount: decimalStringSchema,
});

export function registerFxRoutes(
  app: FastifyInstance,
  fxRateReader: FxRateReader,
): void {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get("/api/v1/fx/latest", async (_request, reply) => {
    const snapshot = await fxRateReader.getLatestSnapshot();
    if (!snapshot) {
      return reply.code(503).send({
        error: "FX_UNAVAILABLE",
        message: "FX rates are currently unavailable",
      });
    }

    return reply
      .header("cache-control", "public, max-age=3600")
      .code(200)
      .send(snapshot);
  });

  typedApp.get(
    "/api/v1/fx/convert",
    {
      schema: {
        querystring: convertQuerySchema,
      },
    },
    async (request, reply) => {
      const snapshot = await fxRateReader.getLatestSnapshot();
      if (!snapshot) {
        return reply.code(503).send({
          error: "FX_UNAVAILABLE",
          message: "FX rates are currently unavailable",
        });
      }

      const { from, to, amount } = request.query;

      try {
        const rate = resolveCrossRate(snapshot, from, to);
        const converted = convertMoney(createMoney(amount, from), to, rate);
        return reply.code(200).send({
          from,
          to,
          amount,
          rate,
          convertedAmount: converted.amount,
          rateDate: snapshot.rateDate,
          provider: snapshot.provider,
        });
      } catch (error) {
        if (error instanceof MissingFxRateError) {
          return reply.code(404).send({
            error: "FX_RATE_NOT_FOUND",
            message: error.message,
          });
        }
        throw error;
      }
    },
  );
}
