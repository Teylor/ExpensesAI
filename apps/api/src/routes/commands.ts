import {
  commandBatchRequestSchema,
  commandEnvelopeSchema,
} from "@agenticf/domain";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { AccountNotFoundError } from "../accounts/service.js";
import type { AuthService } from "../auth/service.js";
import { CategoryNotFoundError } from "../categories/service.js";
import {
  CommandAlreadyUndoneError,
  type CommandBus,
  CommandHandlerNotFoundError,
  CommandNotFoundError,
} from "../commands/bus.js";
import {
  AccountCurrencyMismatchError,
  TransactionNotFoundError,
} from "../transactions/service.js";
import { requireAuthenticatedUser } from "./auth.js";

export interface RegisterCommandRoutesOptions {
  authService: AuthService;
  commandBus: CommandBus;
}

const undoParamsSchema = z.object({
  commandId: z.uuid(),
});

const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

function handleCommandRouteError(reply: FastifyReply, error: unknown) {
  if (error instanceof CommandHandlerNotFoundError) {
    return reply.code(501).send({
      error: "COMMAND_NOT_IMPLEMENTED",
      message: error.message,
    });
  }
  if (error instanceof CommandNotFoundError) {
    return reply.code(404).send({
      error: "COMMAND_NOT_FOUND",
      message: error.message,
    });
  }
  if (error instanceof AccountNotFoundError) {
    return reply.code(404).send({
      error: "ACCOUNT_NOT_FOUND",
      message: error.message,
    });
  }
  if (error instanceof CategoryNotFoundError) {
    return reply.code(404).send({
      error: "CATEGORY_NOT_FOUND",
      message: error.message,
    });
  }
  if (error instanceof TransactionNotFoundError) {
    return reply.code(404).send({
      error: "TRANSACTION_NOT_FOUND",
      message: error.message,
    });
  }
  if (error instanceof AccountCurrencyMismatchError) {
    return reply.code(400).send({
      error: "ACCOUNT_CURRENCY_MISMATCH",
      message: error.message,
    });
  }
  if (error instanceof CommandAlreadyUndoneError) {
    return reply.code(409).send({
      error: "COMMAND_ALREADY_UNDONE",
      message: error.message,
    });
  }
  throw error;
}

export function registerCommandRoutes(
  app: FastifyInstance,
  options: RegisterCommandRoutesOptions,
): void {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();
  const { authService, commandBus } = options;

  typedApp.post(
    "/api/v1/commands",
    {
      schema: {
        body: commandEnvelopeSchema,
      },
    },
    async (request, reply) => {
      const auth = await requireAuthenticatedUser(request, reply, authService);
      if (!auth) return;

      try {
        const result = await commandBus.dispatch(auth.user.id, request.body);
        const statusCode = result.status === "applied" ? 201 : 200;
        return reply.code(statusCode).send(result);
      } catch (error) {
        return handleCommandRouteError(reply, error);
      }
    },
  );

  typedApp.post(
    "/api/v1/commands/batch",
    {
      schema: {
        body: commandBatchRequestSchema,
      },
    },
    async (request, reply) => {
      const auth = await requireAuthenticatedUser(request, reply, authService);
      if (!auth) return;

      try {
        const results = await commandBus.dispatchBatch(
          auth.user.id,
          request.body.commands,
        );
        return reply.code(200).send({ results });
      } catch (error) {
        return handleCommandRouteError(reply, error);
      }
    },
  );

  typedApp.post(
    "/api/v1/commands/:commandId/undo",
    {
      schema: {
        params: undoParamsSchema,
      },
    },
    async (request, reply) => {
      const auth = await requireAuthenticatedUser(request, reply, authService);
      if (!auth) return;

      try {
        const undone = await commandBus.undo(
          auth.user.id,
          request.params.commandId,
          "manual",
        );
        return reply.code(200).send(undone);
      } catch (error) {
        return handleCommandRouteError(reply, error);
      }
    },
  );

  typedApp.get(
    "/api/v1/commands/history",
    {
      schema: {
        querystring: historyQuerySchema,
      },
    },
    async (request, reply) => {
      const auth = await requireAuthenticatedUser(request, reply, authService);
      if (!auth) return;

      const items = await commandBus.listHistory(
        auth.user.id,
        request.query.limit,
      );
      return reply.code(200).send({ items });
    },
  );
}
