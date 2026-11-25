import { t } from "../i18n/i18n.js";
import type { MessageKey } from "../i18n/messages.es.js";
import {
  formatMoneyWithBase,
  type NumberFormatPreferences,
} from "../money/format.js";
import { createMoney } from "../money/money.js";
import type { UserPreferences } from "../user/preferences.js";
import type { CommandEnvelope } from "./catalog.js";

/**
 * Human-readable display names that live outside the command payload (e.g.
 * account names resolved from application state). Kept optional so the
 * formatter stays pure and deterministic when no state is available.
 */
export interface CommandSummaryContext {
  readonly accountNames?: Readonly<Record<string, string>>;
}

/**
 * Pure, localized one-line summary for any mutating command (all 14 mutating
 * command types plus `command.undo`) in both `es` and `en`.
 *
 * The full {@link CommandEnvelope} is accepted so the discriminated-union payload
 * stays type-safe; `preferences` drive locale + number formatting and
 * `context` optionally supplies display names for referenced accounts.
 */
export function formatCommandActionSummary(
  command: CommandEnvelope,
  preferences: UserPreferences,
  context?: CommandSummaryContext,
): string {
  const locale = preferences.locale;
  const numberFormat: NumberFormatPreferences = {
    thousandsSeparator: preferences.thousandsSeparator,
    decimalSeparator: preferences.decimalSeparator,
    symbolPosition: preferences.symbolPosition,
  };

  const formatAmount = (amount: string, currency: string): string =>
    formatMoneyWithBase(
      createMoney(amount, currency),
      preferences.baseCurrency,
      undefined,
      numberFormat,
    );

  const accountName = (accountId: string): string =>
    context?.accountNames?.[accountId] ?? accountId;

  switch (command.type) {
    case "account.create": {
      const { name, accountType } = command.payload;
      const typeKey = `account.type.${accountType}` as MessageKey;
      return t(locale, "action.summary.account.create", {
        name,
        type: t(locale, typeKey),
      });
    }

    case "account.update": {
      const { name, accountId } = command.payload;
      return t(locale, "action.summary.account.update", {
        name: name ?? accountName(accountId),
      });
    }

    case "account.archive": {
      const { accountId } = command.payload;
      return t(locale, "action.summary.account.archive", {
        name: accountName(accountId),
      });
    }

    case "transaction.record": {
      const { kind, amount, currency, description } = command.payload;
      const key: MessageKey =
        kind === "income"
          ? "action.summary.transaction.record.income"
          : "action.summary.transaction.record.expense";
      return t(locale, key, {
        description,
        amount: formatAmount(amount, currency),
      });
    }

    case "transaction.transfer": {
      const { amount, currency, fromAccountId, toAccountId } = command.payload;
      return t(locale, "action.summary.transaction.transfer", {
        amount: formatAmount(amount, currency),
        fromAccount: accountName(fromAccountId),
        toAccount: accountName(toAccountId),
      });
    }

    case "transaction.delete": {
      return t(locale, "action.summary.transaction.delete");
    }

    case "recurring.upsert": {
      const { description, amount, currency, frequency } = command.payload;
      const periodKey = `period.${frequency}` as MessageKey;
      return t(locale, "action.summary.recurring.upsert", {
        description,
        amount: formatAmount(amount, currency),
        period: t(locale, periodKey),
      });
    }

    case "recurring.delete": {
      return t(locale, "action.summary.recurring.delete");
    }

    case "investment.upsert": {
      const { name, investedAmount, currency } = command.payload;
      return t(locale, "action.summary.investment.upsert", {
        name,
        amount: formatAmount(investedAmount, currency),
      });
    }

    case "investment.delete": {
      return t(locale, "action.summary.investment.delete");
    }

    case "networth.upsert": {
      const { name, estimatedValue, currency } = command.payload;
      return t(locale, "action.summary.networth.upsert", {
        name,
        amount: formatAmount(estimatedValue, currency),
      });
    }

    case "networth.delete": {
      return t(locale, "action.summary.networth.delete");
    }

    case "category.upsert": {
      const { name } = command.payload;
      return t(locale, "action.summary.category.upsert", { name });
    }

    case "category.delete": {
      return t(locale, "action.summary.category.delete");
    }

    case "command.undo": {
      return t(locale, "action.summary.command.undo");
    }

    default: {
      // Exhaustive fallback: keeps a safe, localized, non-empty summary if a
      // future command type is added to the catalog.
      const unknown = command as { type: string };
      return t(locale, "action.summary.fallback", { type: unknown.type });
    }
  }
}
