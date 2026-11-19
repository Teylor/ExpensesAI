import { randomUUID } from "node:crypto";
import {
  type CommandActor,
  type CommandEnvelope,
  type CommandType,
  commandEnvelopeSchema,
} from "@agenticf/domain";
import { and, desc, eq } from "drizzle-orm";
import type { DbClient } from "../db/client.js";
import { commandLog } from "../db/schema/commands.js";

export type CommandPayloadFor<T extends CommandType> = Extract<
  CommandEnvelope,
  { type: T }
>["payload"];

export interface CommandHandlerExecution {
  readonly result: Record<string, unknown>;
  readonly inversePayload: Record<string, unknown>;
}

export interface CommandHandler<T extends CommandType = CommandType> {
  execute(
    userId: string,
    payload: CommandPayloadFor<T>,
    envelope: Extract<CommandEnvelope, { type: T }>,
  ): Promise<CommandHandlerExecution>;
  undo(
    userId: string,
    inversePayload: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
}

export interface CommandLogEntry {
  readonly commandId: string;
  readonly userId: string;
  readonly actor: CommandActor;
  readonly commandType: CommandType;
  readonly payload: Record<string, unknown>;
  readonly result: Record<string, unknown>;
  readonly inversePayload: Record<string, unknown>;
  readonly undoneAt: Date | null;
  readonly undoneByCommandId: string | null;
  readonly createdAt: Date;
}

export interface CommandLogRepository {
  findByCommandId(
    userId: string,
    commandId: string,
  ): Promise<CommandLogEntry | null>;
  insert(entry: CommandLogEntry): Promise<void>;
  markUndone(
    userId: string,
    commandId: string,
    undoneByCommandId: string,
    undoneAt: Date,
  ): Promise<boolean>;
  listByUser(userId: string, limit: number): Promise<CommandLogEntry[]>;
}

export interface DispatchResult {
  readonly status: "applied" | "duplicate";
  readonly commandId: string;
  readonly commandType: CommandType;
  readonly result: Record<string, unknown>;
}

export interface UndoResult {
  readonly undoneCommandId: string;
  readonly undoCommandId: string;
  readonly undoneAt: string;
  readonly result: Record<string, unknown>;
}

export interface CommandHistoryItem {
  readonly commandId: string;
  readonly actor: CommandActor;
  readonly commandType: CommandType;
  readonly createdAt: string;
  readonly undoneAt: string | null;
  readonly canUndo: boolean;
  readonly result: Record<string, unknown>;
}

export class CommandHandlerNotFoundError extends Error {
  constructor(commandType: string) {
    super(`No command handler registered for "${commandType}"`);
    this.name = "CommandHandlerNotFoundError";
  }
}

export class CommandNotFoundError extends Error {
  constructor(commandId: string) {
    super(`Command "${commandId}" not found`);
    this.name = "CommandNotFoundError";
  }
}

export class CommandAlreadyUndoneError extends Error {
  constructor(commandId: string) {
    super(`Command "${commandId}" has already been undone`);
    this.name = "CommandAlreadyUndoneError";
  }
}

export interface CommandBusOptions {
  repository: CommandLogRepository;
  now?: () => Date;
}

export class CommandBus {
  private readonly repository: CommandLogRepository;
  private readonly now: () => Date;
  private readonly handlers = new Map<
    CommandType,
    CommandHandler<CommandType>
  >();

  constructor(options: CommandBusOptions) {
    this.repository = options.repository;
    this.now = options.now ?? (() => new Date());
  }

  registerHandler<T extends CommandType>(
    type: T,
    handler: CommandHandler<T>,
  ): void {
    this.handlers.set(type, handler as unknown as CommandHandler<CommandType>);
  }

  async dispatch(
    userId: string,
    rawEnvelope: CommandEnvelope,
  ): Promise<DispatchResult> {
    const envelope = commandEnvelopeSchema.parse(rawEnvelope);

    if (envelope.type === "command.undo") {
      const undoResult = await this.undo(
        userId,
        envelope.payload.targetCommandId,
        envelope.actor,
        envelope.commandId,
      );
      return {
        status: "applied",
        commandId: envelope.commandId,
        commandType: envelope.type,
        result: { ...undoResult },
      };
    }

    const existing = await this.repository.findByCommandId(
      userId,
      envelope.commandId,
    );
    if (existing) {
      return {
        status: "duplicate",
        commandId: existing.commandId,
        commandType: existing.commandType,
        result: existing.result,
      };
    }

    const handler = this.handlers.get(envelope.type);
    if (!handler) {
      throw new CommandHandlerNotFoundError(envelope.type);
    }

    const execution = await handler.execute(
      userId,
      envelope.payload as CommandPayloadFor<CommandType>,
      envelope as Extract<CommandEnvelope, { type: CommandType }>,
    );

    const now = this.now();
    await this.repository.insert({
      commandId: envelope.commandId,
      userId,
      actor: envelope.actor,
      commandType: envelope.type,
      payload: envelope.payload as Record<string, unknown>,
      result: execution.result,
      inversePayload: execution.inversePayload,
      undoneAt: null,
      undoneByCommandId: null,
      createdAt: now,
    });

    return {
      status: "applied",
      commandId: envelope.commandId,
      commandType: envelope.type,
      result: execution.result,
    };
  }

  async dispatchBatch(
    userId: string,
    commands: readonly CommandEnvelope[],
  ): Promise<DispatchResult[]> {
    const results: DispatchResult[] = [];
    for (const command of commands) {
      results.push(await this.dispatch(userId, command));
    }
    return results;
  }

  async undo(
    userId: string,
    targetCommandId: string,
    _actor: CommandActor,
    undoCommandId: string = randomUUID(),
  ): Promise<UndoResult> {
    const target = await this.repository.findByCommandId(
      userId,
      targetCommandId,
    );
    if (!target) {
      throw new CommandNotFoundError(targetCommandId);
    }

    if (target.undoneAt !== null) {
      throw new CommandAlreadyUndoneError(targetCommandId);
    }

    const handler = this.handlers.get(target.commandType);
    if (!handler) {
      throw new CommandHandlerNotFoundError(target.commandType);
    }

    const undoResult = await handler.undo(userId, target.inversePayload);
    const undoneAt = this.now();

    await this.repository.markUndone(
      userId,
      targetCommandId,
      undoCommandId,
      undoneAt,
    );

    return {
      undoneCommandId: targetCommandId,
      undoCommandId,
      undoneAt: undoneAt.toISOString(),
      result: undoResult,
    };
  }

  async listHistory(userId: string, limit = 50): Promise<CommandHistoryItem[]> {
    const safeLimit = Math.max(1, Math.min(limit, 100));
    const entries = await this.repository.listByUser(userId, safeLimit);

    return entries.map((entry) => ({
      commandId: entry.commandId,
      actor: entry.actor,
      commandType: entry.commandType,
      createdAt: entry.createdAt.toISOString(),
      undoneAt: entry.undoneAt ? entry.undoneAt.toISOString() : null,
      canUndo: entry.undoneAt === null,
      result: entry.result,
    }));
  }
}

export class PostgresCommandLogRepository implements CommandLogRepository {
  constructor(private readonly dbClient: DbClient) {}

  async findByCommandId(
    userId: string,
    commandId: string,
  ): Promise<CommandLogEntry | null> {
    const rows = await this.dbClient.db
      .select()
      .from(commandLog)
      .where(
        and(eq(commandLog.userId, userId), eq(commandLog.commandId, commandId)),
      )
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return {
      commandId: row.commandId,
      userId: row.userId,
      actor: row.actor as CommandActor,
      commandType: row.commandType as CommandType,
      payload: row.payload as Record<string, unknown>,
      result: row.result as Record<string, unknown>,
      inversePayload: row.inversePayload as Record<string, unknown>,
      undoneAt: row.undoneAt,
      undoneByCommandId: row.undoneByCommandId,
      createdAt: row.createdAt,
    };
  }

  async insert(entry: CommandLogEntry): Promise<void> {
    await this.dbClient.db.insert(commandLog).values({
      commandId: entry.commandId,
      userId: entry.userId,
      actor: entry.actor,
      commandType: entry.commandType,
      payload: entry.payload,
      result: entry.result,
      inversePayload: entry.inversePayload,
      undoneAt: entry.undoneAt,
      undoneByCommandId: entry.undoneByCommandId,
      createdAt: entry.createdAt,
    });
  }

  async markUndone(
    userId: string,
    commandId: string,
    undoneByCommandId: string,
    undoneAt: Date,
  ): Promise<boolean> {
    const updated = await this.dbClient.db
      .update(commandLog)
      .set({ undoneAt, undoneByCommandId })
      .where(
        and(eq(commandLog.userId, userId), eq(commandLog.commandId, commandId)),
      )
      .returning({ commandId: commandLog.commandId });

    return updated.length > 0;
  }

  async listByUser(userId: string, limit: number): Promise<CommandLogEntry[]> {
    const rows = await this.dbClient.db
      .select()
      .from(commandLog)
      .where(eq(commandLog.userId, userId))
      .orderBy(desc(commandLog.createdAt))
      .limit(limit);

    return rows.map((row) => ({
      commandId: row.commandId,
      userId: row.userId,
      actor: row.actor as CommandActor,
      commandType: row.commandType as CommandType,
      payload: row.payload as Record<string, unknown>,
      result: row.result as Record<string, unknown>,
      inversePayload: row.inversePayload as Record<string, unknown>,
      undoneAt: row.undoneAt,
      undoneByCommandId: row.undoneByCommandId,
      createdAt: row.createdAt,
    }));
  }
}
