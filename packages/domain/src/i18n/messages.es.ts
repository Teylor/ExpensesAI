export const messagesEs = {
  "account.type.bank": "Banco",
  "account.type.cash": "Efectivo",
  "account.type.savings": "Ahorro",
  "account.type.credit": "Crédito",

  "transaction.type.income": "Ingreso",
  "transaction.type.expense": "Gasto",
  "transaction.type.transfer": "Transferencia",

  "period.daily": "Diario",
  "period.weekly": "Semanal",
  "period.monthly": "Mensual",
  "period.quarterly": "Trimestral",
  "period.yearly": "Anual",

  "agent.confirm.income":
    "Nuevo ingreso de {{amount}}: tu saldo pasará de {{balanceBefore}} a {{balanceAfter}} ({{description}}).",
  "agent.confirm.expense":
    "Nuevo gasto de {{amount}}: tu saldo pasará de {{balanceBefore}} a {{balanceAfter}} ({{description}}).",
  "agent.confirm.transfer":
    "Transferencia de {{amount}} desde {{fromAccount}} hacia {{toAccount}}.",
  "agent.confirm.recurring":
    "Regla recurrente configurada: {{description}} ({{amount}}) con frecuencia {{period}}.",
  "agent.guardrail.outOfScope":
    "Solo puedo ayudarte con tus finanzas personales y operaciones dentro de AgenticF.",
  "agent.quota.exhausted":
    "Te has quedado sin cuota en tu proveedor de IA. Puedes continuar manualmente o configurar tu propia API Key en Ajustes.",

  "command.undo.success": "Cambio deshecho correctamente.",
  "sync.offlineManualOnly":
    "Sin conexión: el modo manual sigue activo y tus cambios se sincronizarán al reconectar.",
  "error.currencyMismatch":
    "No se pueden combinar divisas distintas sin conversión.",
  "error.invalidTimeZone": "La zona horaria indicada no es válida.",
} as const;

export type MessageKey = keyof typeof messagesEs;
export type MessageCatalog = Record<MessageKey, string>;
