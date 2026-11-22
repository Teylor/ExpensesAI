import type { MessageCatalog } from "./messages.es.js";

export const messagesEn: MessageCatalog = {
  "account.type.bank": "Bank",
  "account.type.cash": "Cash",
  "account.type.savings": "Savings",
  "account.type.credit": "Credit",

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

  "agent.ui.triggerButton": "AI Agent",
  "agent.ui.triggerAria": "Open Financial Agent",
  "agent.ui.title": "AgenticF Agent",
  "agent.ui.settingsAria": "AI Settings",
  "agent.ui.closeAria": "Close agent",
  "agent.ui.emptyPrompt":
    'Speak or type any financial operation (e.g. "New income of 2000 EUR for Project X"). Financial guardrail active.',
  "agent.ui.guardrailBadge": "Domain Guardrail",
  "agent.ui.confirm": "Confirm",
  "agent.ui.cancel": "Cancel",
  "agent.ui.cancelled": "Action cancelled. Your balance was not modified.",
  "agent.ui.balanceFallback":
    'Your consolidated balance is {{balance}}. Tell me an income or expense (e.g. "New income of 2000 EUR for Project X") to preview its exact impact.',
  "agent.ui.voiceSupportedTitle": "Push-to-Talk (free Web Speech API)",
  "agent.ui.voiceUnsupportedTitle":
    "Voice not supported in this browser (use text)",
  "agent.ui.voiceAria": "Push to Talk",
  "agent.ui.inputPlaceholder": "E.g. New income of 2000 EUR...",
  "agent.ui.inputAria": "Message for the agent",
  "agent.ui.sendAria": "Send message",
  "agent.ui.confirmToggleTitle": "Agent pre-confirmation",
  "agent.ui.confirmToggleDesc": "Shows exact impact before modifying balances",
  "agent.ui.chatgptTitle": "1. Sign in with ChatGPT (Plan Sharing)",
  "agent.ui.chatgptDesc": "Use your ChatGPT subscription via OAuth 2.0 + PKCE.",
  "agent.ui.chatgptConnect": "Connect with ChatGPT",
  "agent.ui.chatgptError": "Error starting ChatGPT OAuth",
  "agent.ui.chatgptStarted": "OAuth PKCE flow started: {{url}}",
  "agent.ui.byokTitle": "2. BYOK Fallback (AES-256-GCM)",
  "agent.ui.byokDefaultLabel": "My OpenAI API Key",
  "agent.ui.byokLabelPlaceholder": "Label",
  "agent.ui.byokLabelAria": "BYOK Label",
  "agent.ui.byokModelPlaceholder": "Model (e.g. gpt-4o-mini)",
  "agent.ui.byokModelAria": "BYOK Model",
  "agent.ui.byokKeyPlaceholder": "API Key (sk-...)",
  "agent.ui.byokKeyAria": "BYOK API Key",
  "agent.ui.byokSave": "Save Encrypted Key",
  "agent.ui.byokSaved": "API Key encrypted with AES-256-GCM and saved.",
  "agent.ui.byokError": "Error saving key",
  "agent.ui.activeConnections": "Active connections",
  "agent.ui.deleteConnectionAria": "Delete connection {{label}}",
  "agent.ui.thinking": "Thinking...",

  "nav.overview": "Overview",
  "nav.activity": "Activity",
  "nav.accounts": "Accounts",
  "nav.wealth": "Wealth",
  "nav.manage": "Manage",
  "nav.skipToContent": "Skip to main content",
  "nav.primaryAria": "Primary navigation",
  "nav.mobileAria": "Mobile navigation",
  "nav.subtabsAria": "Sections",

  "shell.online": "Online",
  "shell.offline": "Offline",
  "shell.sync": "Sync",
  "shell.syncNow": "Sync now",
  "shell.syncing": "Syncing...",
  "shell.synced": "Synced",
  "shell.pendingCount": "{{count}} pending",
  "shell.syncError":
    "Could not sync right now. Your changes remain safely stored locally.",
  "shell.retry": "Retry",
  "shell.undo": "Undo",
  "shell.dismissNotice": "Dismiss notice",
  "shell.logout": "Log out",
  "shell.localMode": "Local Offline Mode",
  "shell.loading": "Loading your financial workspace...",
  "shell.errorBoundaryTitle": "Something went wrong in this tab",
  "shell.errorBoundaryDesc":
    "Your local data is still safe. You can retry or switch tabs.",

  "overview.totalBalance": "Total Balance",
  "overview.statusTitle": "Status & Sync",
  "overview.accountsSynced": "{{count}} accounts · Synced",
  "overview.onboardingTitle": "Start by creating your first account",
  "overview.onboardingDesc":
    "Add a bank, cash, or savings account to start tracking transactions or using the AI Agent.",
  "overview.createFirstAccount": "Create first account",
  "overview.quickRecord": "Record transaction",
  "overview.viewAccounts": "View accounts",
  "overview.chartEmpty": "No income or expenses in this period.",
  "overview.chartAria":
    "Chart of period income ({{income}}) and expenses ({{expense}})",

  "activity.subtab.transactions": "Transactions",
  "activity.subtab.recurring": "Recurring",
  "activity.composerToggle": "Record transaction",
  "activity.noAccountsNotice":
    "Create at least one account first to record transactions or recurring rules.",
  "activity.goToAccounts": "Go to Accounts",
  "activity.accountLabel": "Account",
  "activity.validationMissingAccount": "Select a valid account before saving.",
  "activity.validationMissingDestination":
    "Select a destination account different from the source account.",
  "activity.validationMissingAmount": "Enter a valid amount greater than 0.",
  "activity.validationMissingRecurring":
    "Fill in account, description, and amount to create the recurring rule.",

  "accounts.portfolioMix": "Account Portfolio",
  "accounts.countSummary": "{{count}} active accounts",
  "accounts.addTitle": "New Account",
  "accounts.addSubmit": "Add account",
  "accounts.validationMissingName": "Enter a name for the account.",

  "wealth.subtab.investments": "Investments",
  "wealth.subtab.networth": "Assets & Debts",
  "wealth.validationInvestment":
    "Fill in name, invested amount, and current value.",
  "wealth.validationNetWorth": "Fill in name and estimated value.",

  "manage.categoriesTitle": "Editable Categories",
  "manage.categoriesScope.expense": "Expenses",
  "manage.categoriesScope.income": "Income",
  "manage.categoriesScope.investment": "Investments",
  "manage.categoriesScope.networth": "Net Worth",
  "manage.categoriesEmpty": "No categories in this scope yet.",
  "manage.exportsTitle": "CSV Exports",
  "manage.exportsDesc": "Download your local data as CSV files at any time.",
  "manage.exportsCount": "{{count}} records",
  "manage.exportsDownloaded": "Downloaded {{filename}}.",
  "manage.syncTitle": "Sync & Outbox Queue",
  "manage.syncDesc":
    "Mutations are saved locally in IndexedDB first and sync automatically when online.",
  "manage.prefsTitle": "Preferences & Session",
  "manage.languageLabel": "Interface language",
  "manage.sessionLabel": "Active session",

  "command.undo.success": "Change undone successfully.",
  "sync.offlineManualOnly":
    "You are offline: manual mode stays available and changes will sync automatically once reconnected.",
  "error.currencyMismatch":
    "Cannot combine different currencies without conversion.",
  "error.invalidTimeZone": "The provided timezone is not valid.",
};
