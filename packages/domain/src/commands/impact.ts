import { type FxRateSnapshot, resolveCrossRate } from "../fx/triangulation.js";
import { t } from "../i18n/i18n.js";
import type { MessageKey } from "../i18n/messages.es.js";
import {
  formatMoneyWithBase,
  type NumberFormatPreferences,
} from "../money/format.js";
import {
  addMoney,
  createMoney,
  negateMoney,
  subtractMoney,
} from "../money/money.js";
import type { UserPreferences } from "../user/preferences.js";
import type { CommandEnvelope } from "./catalog.js";
import { formatCommandActionSummary } from "./summary.js";

export interface AccountBalanceSnapshot {
  readonly id: string;
  readonly name: string;
  readonly currency: string;
  readonly balance: string;
}

export interface ImpactSimulationState {
  readonly accounts: Readonly<Record<string, AccountBalanceSnapshot>>;
}

export interface AccountBalanceImpact {
  readonly accountId: string;
  readonly accountName: string;
  readonly currency: string;
  readonly balanceBefore: string;
  readonly balanceAfter: string;
  readonly delta: string;
}

export interface CommandImpactPreview {
  readonly commandId: string;
  readonly commandType: CommandEnvelope["type"];
  readonly summary: string;
  readonly accountImpacts: readonly AccountBalanceImpact[];
}

function getNumberFormat(
  preferences: UserPreferences,
): NumberFormatPreferences {
  return {
    thousandsSeparator: preferences.thousandsSeparator,
    decimalSeparator: preferences.decimalSeparator,
    symbolPosition: preferences.symbolPosition,
  };
}

function resolveFxRateToBase(
  currency: string,
  baseCurrency: string,
  overrideRate: string | undefined,
  fxSnapshot: FxRateSnapshot | undefined,
): string | undefined {
  if (currency.toUpperCase() === baseCurrency.toUpperCase()) {
    return "1";
  }
  if (overrideRate) {
    return overrideRate;
  }
  if (!fxSnapshot) {
    return undefined;
  }
  try {
    return resolveCrossRate(fxSnapshot, currency, baseCurrency);
  } catch {
    return undefined;
  }
}

export function simulateCommandImpact(
  state: ImpactSimulationState,
  command: CommandEnvelope,
  preferences: UserPreferences,
  fxSnapshot?: FxRateSnapshot,
): CommandImpactPreview {
  const numberFormat = getNumberFormat(preferences);

  switch (command.type) {
    case "transaction.record": {
      const account = state.accounts[command.payload.accountId];
      const currency = account?.currency ?? command.payload.currency;
      const before = createMoney(account?.balance ?? "0", currency);
      const amount = createMoney(command.payload.amount, currency);
      const after =
        command.payload.kind === "income"
          ? addMoney(before, amount)
          : subtractMoney(before, amount);
      const delta =
        command.payload.kind === "income" ? amount : negateMoney(amount);

      const rateToBase = resolveFxRateToBase(
        currency,
        preferences.baseCurrency,
        command.payload.fxRateToBaseOverride,
        fxSnapshot,
      );

      const key: MessageKey =
        command.payload.kind === "income"
          ? "agent.confirm.income"
          : "agent.confirm.expense";

      const summary = t(preferences.locale, key, {
        amount: formatMoneyWithBase(
          amount,
          preferences.baseCurrency,
          rateToBase,
          numberFormat,
        ),
        balanceBefore: formatMoneyWithBase(
          before,
          preferences.baseCurrency,
          rateToBase,
          numberFormat,
        ),
        balanceAfter: formatMoneyWithBase(
          after,
          preferences.baseCurrency,
          rateToBase,
          numberFormat,
        ),
        description: command.payload.description,
      });

      return {
        commandId: command.commandId,
        commandType: command.type,
        summary,
        accountImpacts: [
          {
            accountId: command.payload.accountId,
            accountName: account?.name ?? command.payload.accountId,
            currency,
            balanceBefore: before.amount,
            balanceAfter: after.amount,
            delta: delta.amount,
          },
        ],
      };
    }

    case "transaction.transfer": {
      const fromAccount = state.accounts[command.payload.fromAccountId];
      const toAccount = state.accounts[command.payload.toAccountId];
      const fromCurrency = fromAccount?.currency ?? command.payload.currency;
      const toCurrency =
        toAccount?.currency ??
        command.payload.destinationCurrency ??
        command.payload.currency;

      const fromBefore = createMoney(fromAccount?.balance ?? "0", fromCurrency);
      const outAmount = createMoney(command.payload.amount, fromCurrency);
      const fromAfter = subtractMoney(fromBefore, outAmount);

      const toBefore = createMoney(toAccount?.balance ?? "0", toCurrency);
      const inAmount = createMoney(
        command.payload.destinationAmount ?? command.payload.amount,
        toCurrency,
      );
      const toAfter = addMoney(toBefore, inAmount);

      const fromRate = resolveFxRateToBase(
        fromCurrency,
        preferences.baseCurrency,
        undefined,
        fxSnapshot,
      );

      const summary = t(preferences.locale, "agent.confirm.transfer", {
        amount: formatMoneyWithBase(
          outAmount,
          preferences.baseCurrency,
          fromRate,
          numberFormat,
        ),
        fromAccount: fromAccount?.name ?? command.payload.fromAccountId,
        toAccount: toAccount?.name ?? command.payload.toAccountId,
      });

      return {
        commandId: command.commandId,
        commandType: command.type,
        summary,
        accountImpacts: [
          {
            accountId: command.payload.fromAccountId,
            accountName: fromAccount?.name ?? command.payload.fromAccountId,
            currency: fromCurrency,
            balanceBefore: fromBefore.amount,
            balanceAfter: fromAfter.amount,
            delta: negateMoney(outAmount).amount,
          },
          {
            accountId: command.payload.toAccountId,
            accountName: toAccount?.name ?? command.payload.toAccountId,
            currency: toCurrency,
            balanceBefore: toBefore.amount,
            balanceAfter: toAfter.amount,
            delta: inAmount.amount,
          },
        ],
      };
    }

    case "recurring.upsert": {
      const amount = createMoney(
        command.payload.amount,
        command.payload.currency,
      );
      const rateToBase = resolveFxRateToBase(
        command.payload.currency,
        preferences.baseCurrency,
        undefined,
        fxSnapshot,
      );
      const periodKey = `period.${command.payload.frequency}` as MessageKey;
      const summary = t(preferences.locale, "agent.confirm.recurring", {
        description: command.payload.description,
        amount: formatMoneyWithBase(
          amount,
          preferences.baseCurrency,
          rateToBase,
          numberFormat,
        ),
        period: t(preferences.locale, periodKey),
      });

      return {
        commandId: command.commandId,
        commandType: command.type,
        summary,
        accountImpacts: [],
      };
    }

    case "command.undo": {
      return {
        commandId: command.commandId,
        commandType: command.type,
        summary: t(preferences.locale, "command.undo.success"),
        accountImpacts: [],
      };
    }

    default: {
      const accountNames: Record<string, string> = {};
      for (const [accountId, account] of Object.entries(state.accounts)) {
        accountNames[accountId] = account.name;
      }
      return {
        commandId: command.commandId,
        commandType: command.type,
        summary: formatCommandActionSummary(command, preferences, {
          accountNames,
        }),
        accountImpacts: [],
      };
    }
  }
}
