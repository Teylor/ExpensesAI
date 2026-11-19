import type { MessageCatalog } from "./messages.es.js";

export const messagesEn: MessageCatalog = {
  "account.type.bank": "Bank",
  "account.type.cash": "Cash",
  "account.type.savings": "Savings",
  "account.type.credit": "Credit",
  "account.type.other": "Other",

  "transaction.type.income": "Income",
  "transaction.type.expense": "Expense",
  "transaction.type.transfer": "Transfer",

  "period.daily": "Daily",
  "period.weekly": "Weekly",
  "period.monthly": "Monthly",
  "period.quarterly": "Quarterly",
  "period.yearly": "Yearly",

  "agent.confirm.income":
    "New income of {{amount}}: your balance will change from {{balanceBefore}} to {{balanceAfter}} ({{description}}).",
  "agent.confirm.expense":
    "New expense of {{amount}}: your balance will change from {{balanceBefore}} to {{balanceAfter}} ({{description}}).",
  "agent.confirm.transfer":
    "Transfer of {{amount}} from {{fromAccount}} to {{toAccount}}.",
  "agent.confirm.recurring":
    "Recurring rule scheduled: {{description}} ({{amount}}) on a {{period}} schedule.",
  "agent.guardrail.outOfScope":
    "I can only help with your personal finance queries and actions inside AgenticF.",
  "agent.quota.exhausted":
    "Your AI provider quota is exhausted. You can keep working manually or add your own API Key in Settings.",

  "command.undo.success": "Change undone successfully.",
  "sync.offlineManualOnly":
    "You are offline: manual mode stays available and changes will sync automatically once reconnected.",
  "error.currencyMismatch":
    "Cannot combine different currencies without conversion.",
  "error.invalidTimeZone": "The provided timezone is not valid.",
};
