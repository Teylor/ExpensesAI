import { randomUUID } from "node:crypto";
import {
  type CommandEnvelope,
  type CommandImpactPreview,
  computeBalancesSummary,
  evaluateFinancialDomainGuardrail,
  type FxRateSnapshot,
  parseNaturalFinanceIntent,
  simulateCommandImpact,
  t,
  type UserPreferences,
} from "@agenticf/domain";
import { and, asc, eq } from "drizzle-orm";
import type { AccountsService } from "../accounts/service.js";
import type { CommandBus } from "../commands/bus.js";
import type { DbClient } from "../db/client.js";
import { aiConnections } from "../db/schema/ai.js";
import type { FxRateReader } from "../routes/fx.js";
import type { SecretVault } from "./vault.js";

export type AiConnectionKind = "chatgpt_oauth" | "byok";
export type AiProviderId = "openai" | "anthropic" | "openai_compatible";

export interface AiConnectionRecord {
  readonly id: string;
  readonly userId: string;
  readonly kind: AiConnectionKind;
  readonly provider: AiProviderId;
  readonly label: string;
  readonly model: string;
  readonly baseUrl: string | null;
  readonly encryptedCredential: string;
  readonly maskedPreview: string;
  readonly priority: number;
  readonly isActive: boolean;
  readonly lastError: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface AiConnectionsRepository {
  listByUser(userId: string): Promise<AiConnectionRecord[]>;
  upsert(connection: AiConnectionRecord): Promise<void>;
  deleteById(userId: string, connectionId: string): Promise<boolean>;
}

export class AiQuotaExhaustedError extends Error {
  constructor(message = "AI provider quota exhausted") {
    super(message);
    this.name = "AiQuotaExhaustedError";
  }
}

export interface AgentModelGatewayInput {
  readonly connection: AiConnectionRecord;
  readonly decryptedCredential: string;
  readonly prompt: string;
  readonly preferences: UserPreferences;
  readonly defaultAccountId: string | undefined;
  readonly formattedTotalBalance: string;
}

export interface AgentModelGatewayOutput {
  readonly replyText: string;
  readonly proposedCommand?: CommandEnvelope;
}

export type AgentChatStatus =
  | "answered"
  | "confirmation_required"
  | "executed"
  | "rejected_guardrail"
  | "quota_exhausted";

export interface AgentChatResponse {
  readonly status: AgentChatStatus;
  readonly replyText: string;
  readonly usedConnectionKind: AiConnectionKind | null;
  readonly proposedCommand?: CommandEnvelope;
  readonly executedCommandId?: string;
  readonly impact?: CommandImpactPreview;
}

export interface AgentOrchestratorOptions {
  connectionsRepository: AiConnectionsRepository;
  vault: SecretVault;
  accountsService: AccountsService;
  commandBus: CommandBus;
  getUserPreferences: (userId: string) => Promise<UserPreferences>;
  fxRateReader?: FxRateReader;
  modelGateway?: (
    input: AgentModelGatewayInput,
  ) => Promise<AgentModelGatewayOutput>;
}

export class AgentOrchestrator {
  private readonly connectionsRepository: AiConnectionsRepository;
  private readonly vault: SecretVault;
  private readonly accountsService: AccountsService;
  private readonly commandBus: CommandBus;
  private readonly getUserPreferences: (
    userId: string,
  ) => Promise<UserPreferences>;
  private readonly fxRateReader?: FxRateReader;
  private readonly modelGateway: (
    input: AgentModelGatewayInput,
  ) => Promise<AgentModelGatewayOutput>;

  constructor(options: AgentOrchestratorOptions) {
    this.connectionsRepository = options.connectionsRepository;
    this.vault = options.vault;
    this.accountsService = options.accountsService;
    this.commandBus = options.commandBus;
    this.getUserPreferences = options.getUserPreferences;
    if (options.fxRateReader) {
      this.fxRateReader = options.fxRateReader;
    }
    this.modelGateway =
      options.modelGateway ?? ((input) => this.defaultModelGateway(input));
  }

  async chat(userId: string, rawPrompt: string): Promise<AgentChatResponse> {
    const preferences = await this.getUserPreferences(userId);
    const guardrail = evaluateFinancialDomainGuardrail(
      rawPrompt,
      preferences.locale,
    );
    if (!guardrail.allowed) {
      return {
        status: "rejected_guardrail",
        replyText:
          guardrail.rejectionMessage ??
          t(preferences.locale, "agent.guardrail.outOfScope"),
        usedConnectionKind: null,
      };
    }

    const activeConnections = (
      await this.connectionsRepository.listByUser(userId)
    )
      .filter((c) => c.isActive)
      .sort((a, b) => a.priority - b.priority);

    if (activeConnections.length === 0) {
      return {
        status: "quota_exhausted",
        replyText: t(preferences.locale, "agent.quota.exhausted"),
        usedConnectionKind: null,
      };
    }

    const [storedAccounts, fxSnapshot] = await Promise.all([
      this.accountsService.listAccounts(userId, false),
      this.loadOptionalFxSnapshot(),
    ]);

    const balancesSummary = computeBalancesSummary(
      storedAccounts.map((a) => ({
        id: a.id,
        name: a.name,
        accountType: a.accountType,
        currency: a.currency,
        balance: a.currentBalance,
        isArchived: a.isArchived,
      })),
      preferences,
      fxSnapshot,
    );

    const defaultAccountId = storedAccounts[0]?.id;
    let gatewayOutput: AgentModelGatewayOutput | null = null;
    let usedConnectionKind: AiConnectionKind | null = null;

    for (const connection of activeConnections) {
      try {
        const decryptedCredential = this.vault.decrypt(
          connection.encryptedCredential,
        );
        gatewayOutput = await this.modelGateway({
          connection,
          decryptedCredential,
          prompt: rawPrompt,
          preferences,
          defaultAccountId,
          formattedTotalBalance: balancesSummary.formattedTotalBalance,
        });
        usedConnectionKind = connection.kind;
        break;
      } catch (error) {
        if (error instanceof AiQuotaExhaustedError) {
          continue;
        }
        throw error;
      }
    }

    if (!gatewayOutput || !usedConnectionKind) {
      return {
        status: "quota_exhausted",
        replyText: t(preferences.locale, "agent.quota.exhausted"),
        usedConnectionKind: null,
      };
    }

    if (!gatewayOutput.proposedCommand) {
      return {
        status: "answered",
        replyText: gatewayOutput.replyText,
        usedConnectionKind,
      };
    }

    const accountsStateMap: Record<
      string,
      { id: string; name: string; currency: string; balance: string }
    > = {};
    for (const acc of storedAccounts) {
      accountsStateMap[acc.id] = {
        id: acc.id,
        name: acc.name,
        currency: acc.currency,
        balance: acc.currentBalance,
      };
    }

    const impact = simulateCommandImpact(
      { accounts: accountsStateMap },
      gatewayOutput.proposedCommand,
      preferences,
      fxSnapshot,
    );

    if (preferences.agentConfirmEnabled) {
      return {
        status: "confirmation_required",
        replyText: impact.summary,
        usedConnectionKind,
        proposedCommand: gatewayOutput.proposedCommand,
        impact,
      };
    }

    await this.commandBus.dispatch(userId, gatewayOutput.proposedCommand);
    return {
      status: "executed",
      replyText: impact.summary,
      usedConnectionKind,
      executedCommandId: gatewayOutput.proposedCommand.commandId,
      impact,
    };
  }

  private async defaultModelGateway(
    input: AgentModelGatewayInput,
  ): Promise<AgentModelGatewayOutput> {
    const parsedCommand = parseNaturalFinanceIntent(input.prompt, {
      ...(input.defaultAccountId
        ? { defaultAccountId: input.defaultAccountId }
        : {}),
      defaultCurrency: input.preferences.baseCurrency,
      commandId: randomUUID(),
      nowIso: new Date().toISOString(),
    });

    if (parsedCommand) {
      return {
        replyText: parsedCommand.type,
        proposedCommand: parsedCommand,
      };
    }

    const isEn = input.preferences.locale === "en";
    return {
      replyText: isEn
        ? `Your consolidated total balance is ${input.formattedTotalBalance}.`
        : `Tu saldo total consolidado es de ${input.formattedTotalBalance}.`,
    };
  }

  private async loadOptionalFxSnapshot(): Promise<FxRateSnapshot | undefined> {
    if (!this.fxRateReader) return undefined;
    try {
      return (await this.fxRateReader.getLatestSnapshot()) ?? undefined;
    } catch {
      return undefined;
    }
  }
}

export class PostgresAiConnectionsRepository
  implements AiConnectionsRepository
{
  constructor(private readonly dbClient: DbClient) {}

  async listByUser(userId: string): Promise<AiConnectionRecord[]> {
    const rows = await this.dbClient.db
      .select()
      .from(aiConnections)
      .where(eq(aiConnections.userId, userId))
      .orderBy(asc(aiConnections.priority), asc(aiConnections.createdAt));

    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      kind: row.kind as AiConnectionKind,
      provider: row.provider as AiProviderId,
      label: row.label,
      model: row.model,
      baseUrl: row.baseUrl,
      encryptedCredential: row.encryptedCredential,
      maskedPreview: row.maskedPreview,
      priority: row.priority,
      isActive: row.isActive,
      lastError: row.lastError,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async upsert(connection: AiConnectionRecord): Promise<void> {
    await this.dbClient.db
      .insert(aiConnections)
      .values({
        id: connection.id,
        userId: connection.userId,
        kind: connection.kind,
        provider: connection.provider,
        label: connection.label,
        model: connection.model,
        baseUrl: connection.baseUrl,
        encryptedCredential: connection.encryptedCredential,
        maskedPreview: connection.maskedPreview,
        priority: connection.priority,
        isActive: connection.isActive,
        lastError: connection.lastError,
        createdAt: connection.createdAt,
        updatedAt: connection.updatedAt,
      })
      .onConflictDoUpdate({
        target: aiConnections.id,
        set: {
          label: connection.label,
          model: connection.model,
          baseUrl: connection.baseUrl,
          encryptedCredential: connection.encryptedCredential,
          maskedPreview: connection.maskedPreview,
          priority: connection.priority,
          isActive: connection.isActive,
          lastError: connection.lastError,
          updatedAt: connection.updatedAt,
        },
      });
  }

  async deleteById(userId: string, connectionId: string): Promise<boolean> {
    const rows = await this.dbClient.db
      .delete(aiConnections)
      .where(
        and(
          eq(aiConnections.userId, userId),
          eq(aiConnections.id, connectionId),
        ),
      )
      .returning({ id: aiConnections.id });
    return rows.length > 0;
  }
}
