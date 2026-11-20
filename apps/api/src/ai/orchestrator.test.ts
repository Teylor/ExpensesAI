import {
  DEFAULT_USER_PREFERENCES,
  type UserPreferences,
} from "@agenticf/domain";
import { describe, expect, it } from "vitest";
import {
  type AccountsRepository,
  AccountsService,
  registerAccountCommandHandlers,
  type StoredAccount,
} from "../accounts/service.js";
import {
  CommandBus,
  type CommandLogEntry,
  type CommandLogRepository,
} from "../commands/bus.js";
import {
  registerTransactionCommandHandlers,
  type StoredTransaction,
  type TransactionsRepository,
  TransactionsService,
} from "../transactions/service.js";
import {
  AgentOrchestrator,
  type AiConnectionRecord,
  type AiConnectionsRepository,
  AiQuotaExhaustedError,
} from "./orchestrator.js";
import { SecretVault } from "./vault.js";

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACC_EUR_ID = "10000000-0000-4000-8000-000000000001";

function createTestHarness() {
  let userPrefs: UserPreferences = { ...DEFAULT_USER_PREFERENCES };
  const vault = SecretVault.fromPassphrase("orchestrator-test-secret");

  const cmdEntries = new Map<string, CommandLogEntry>();
  const cmdRepo: CommandLogRepository = {
    async findByCommandId(userId, commandId) {
      const e = cmdEntries.get(commandId);
      return e && e.userId === userId ? e : null;
    },
    async insert(entry) {
      cmdEntries.set(entry.commandId, entry);
    },
    async markUndone(userId, commandId, undoneByCommandId, undoneAt) {
      const e = cmdEntries.get(commandId);
      if (!e || e.userId !== userId) return false;
      cmdEntries.set(commandId, { ...e, undoneAt, undoneByCommandId });
      return true;
    },
    async listByUser(userId, limit) {
      return [...cmdEntries.values()]
        .filter((e) => e.userId === userId)
        .slice(0, limit);
    },
  };

  const accStore = new Map<string, StoredAccount>();
  accStore.set(ACC_EUR_ID, {
    id: ACC_EUR_ID,
    userId: USER_A,
    name: "Banco Principal",
    accountType: "bank",
    currency: "EUR",
    initialBalance: "3000",
    currentBalance: "3000",
    isArchived: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const accRepo: AccountsRepository = {
    async listByUser(userId, includeArchived) {
      return [...accStore.values()].filter(
        (a) => a.userId === userId && (includeArchived || !a.isArchived),
      );
    },
    async findById(userId, accountId) {
      const a = accStore.get(accountId);
      return a && a.userId === userId ? a : null;
    },
    async insert(account) {
      accStore.set(account.id, account);
    },
    async update(userId, accountId, patch) {
      const a = accStore.get(accountId);
      if (!a || a.userId !== userId) return null;
      const updated = { ...a, ...patch };
      accStore.set(accountId, updated);
      return updated;
    },
    async deleteById(userId, accountId) {
      const a = accStore.get(accountId);
      if (!a || a.userId !== userId) return false;
      accStore.delete(accountId);
      return true;
    },
  };

  const txStore = new Map<string, StoredTransaction>();
  const txRepo: TransactionsRepository = {
    async insert(tx) {
      txStore.set(tx.id, tx);
    },
    async findById(userId, txId, includeDeleted = false) {
      const tx = txStore.get(txId);
      if (!tx || tx.userId !== userId) return null;
      if (!includeDeleted && tx.deletedAt !== null) return null;
      return tx;
    },
    async setDeletedAt(userId, txId, deletedAt) {
      const tx = txStore.get(txId);
      if (!tx || tx.userId !== userId) return null;
      const updated = { ...tx, deletedAt };
      txStore.set(txId, updated);
      return updated;
    },
    async listByUser(userId) {
      return [...txStore.values()].filter(
        (tx) => tx.userId === userId && tx.deletedAt === null,
      );
    },
  };

  const connStore = new Map<string, AiConnectionRecord>();
  const connRepo: AiConnectionsRepository = {
    async listByUser(userId) {
      return [...connStore.values()]
        .filter((c) => c.userId === userId)
        .sort((a, b) => a.priority - b.priority);
    },
    async upsert(conn) {
      connStore.set(conn.id, conn);
    },
    async deleteById(userId, connId) {
      const c = connStore.get(connId);
      if (!c || c.userId !== userId) return false;
      connStore.delete(connId);
      return true;
    },
  };

  const commandBus = new CommandBus({ repository: cmdRepo });
  const accountsService = new AccountsService({ repository: accRepo });
  const transactionsService = new TransactionsService({
    repository: txRepo,
    accountsRepository: accRepo,
    getUserPreferences: async () => userPrefs,
  });

  registerAccountCommandHandlers(commandBus, accountsService);
  registerTransactionCommandHandlers(commandBus, transactionsService);

  return {
    vault,
    connRepo,
    commandBus,
    accountsService,
    setUserPreferences: (next: Partial<UserPreferences>) => {
      userPrefs = { ...userPrefs, ...next };
    },
    getUserPreferences: async () => userPrefs,
  };
}

describe("AgentOrchestrator (Guardrails, Plan Sharing -> BYOK -> Manual fallback, Impact Confirmation & Undo)", () => {
  it("blocks out-of-scope prompts, falls back from ChatGPT Plan Sharing to BYOK on quota error, and returns impact confirmation or auto-executes", async () => {
    const harness = createTestHarness();

    // Register Tier 1 (ChatGPT Plan Sharing) and Tier 2 (BYOK) connections
    await harness.connRepo.upsert({
      id: "c1000000-0000-4000-8000-000000000001",
      userId: USER_A,
      kind: "chatgpt_oauth",
      provider: "openai",
      label: "ChatGPT Plus Plan Sharing",
      model: "gpt-4o-mini",
      baseUrl: null,
      encryptedCredential: harness.vault.encrypt("oauth-plan-token"),
      maskedPreview: "ChatGPT Plan",
      priority: 1,
      isActive: true,
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await harness.connRepo.upsert({
      id: "c2000000-0000-4000-8000-000000000002",
      userId: USER_A,
      kind: "byok",
      provider: "openai",
      label: "Mi API Key",
      model: "gpt-4o-mini",
      baseUrl: null,
      encryptedCredential: harness.vault.encrypt(
        ["sk", "byok", "fallback", "1234"].join("-"),
      ),
      maskedPreview: "sk-...1234",
      priority: 2,
      isActive: true,
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    let planSharingShouldFailQuota = true;

    const orchestrator = new AgentOrchestrator({
      connectionsRepository: harness.connRepo,
      vault: harness.vault,
      accountsService: harness.accountsService,
      commandBus: harness.commandBus,
      getUserPreferences: harness.getUserPreferences,
      modelGateway: async ({ connection, prompt, defaultAccountId }) => {
        if (connection.kind === "chatgpt_oauth" && planSharingShouldFailQuota) {
          throw new AiQuotaExhaustedError("ChatGPT Plan quota exceeded");
        }
        if (prompt.includes("2000")) {
          return {
            replyText:
              "Preparado el registro del ingreso de 2.000,00 € por Trabajo X.",
            proposedCommand: {
              commandId: "c3000000-0000-4000-8000-000000000001",
              actor: "agent",
              issuedAtUtc: "2026-11-20T07:00:00.000Z",
              type: "transaction.record",
              payload: {
                kind: "income",
                accountId: defaultAccountId ?? ACC_EUR_ID,
                amount: "2000",
                currency: "EUR",
                description: "Pago de Y por trabajo X",
                source: "agent",
              },
            },
          };
        }
        return { replyText: "Tu saldo actual es de 3.000,00 €." };
      },
    });

    // 1. Out-of-scope prompt is rejected by guardrail without calling LLM
    const rejected = await orchestrator.chat(
      USER_A,
      "Dame una receta de tortilla de patatas",
    );
    expect(rejected.status).toBe("rejected_guardrail");
    expect(rejected.replyText).toContain("AgenticF");

    // 2. Plan Sharing fails with quota -> automatically falls back to BYOK and proposes confirmation card (agentConfirmEnabled = true)
    const proposal = await orchestrator.chat(
      USER_A,
      "Nuevo ingreso de 2000 euros por pago de Y por trabajo X",
    );
    expect(proposal.status).toBe("confirmation_required");
    expect(proposal.usedConnectionKind).toBe("byok");
    expect(proposal.impact?.summary).toBe(
      "Nuevo ingreso de 2.000,00 €: tu saldo pasará de 3.000,00 € a 5.000,00 € (Pago de Y por trabajo X).",
    );
    // Balance not mutated yet because confirmation is required
    expect(
      (await harness.accountsService.getAccount(USER_A, ACC_EUR_ID))
        ?.currentBalance,
    ).toBe("3000");

    // 3. When user disables confirmation (agentConfirmEnabled = false), agent executes directly via CommandBus and balance updates to 5000 (reversible with Undo)
    harness.setUserPreferences({ agentConfirmEnabled: false });
    planSharingShouldFailQuota = false;
    const executed = await orchestrator.chat(
      USER_A,
      "Nuevo ingreso de 2000 euros por pago de Y por trabajo X",
    );
    expect(executed.status).toBe("executed");
    expect(executed.usedConnectionKind).toBe("chatgpt_oauth");
    expect(
      (await harness.accountsService.getAccount(USER_A, ACC_EUR_ID))
        ?.currentBalance,
    ).toBe("5000");

    // Undo the agent's action restores balance to 3000
    await harness.commandBus.undo(
      USER_A,
      "c3000000-0000-4000-8000-000000000001",
      "manual",
    );
    expect(
      (await harness.accountsService.getAccount(USER_A, ACC_EUR_ID))
        ?.currentBalance,
    ).toBe("3000");
  });
});
