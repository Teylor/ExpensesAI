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

  "agent.ui.triggerButton": "Agente IA",
  "agent.ui.triggerAria": "Abrir Agente Financiero",
  "agent.ui.title": "Agente AgenticF",
  "agent.ui.settingsAria": "Ajustes IA",
  "agent.ui.closeAria": "Cerrar agente",
  "agent.ui.emptyPrompt":
    'Habla o escribe cualquier operación financiera (p. ej. "Nuevo ingreso de 2000 EUR por Trabajo X"). Guardrail financiero activo.',
  "agent.ui.guardrailBadge": "Guardrail de Dominio",
  "agent.ui.confirm": "Confirmar",
  "agent.ui.cancel": "Cancelar",
  "agent.ui.cancelled": "Acción cancelada. No se ha modificado tu saldo.",
  "agent.ui.balanceFallback":
    'Tu saldo total consolidado es de {{balance}}. Indícame un ingreso o gasto (ej. "Nuevo ingreso de 2000 EUR por Trabajo X") para simular su impacto exacto.',
  "agent.ui.voiceSupportedTitle": "Push-to-Talk (Web Speech API gratis)",
  "agent.ui.voiceUnsupportedTitle":
    "Voz no soportada en este navegador (usa texto)",
  "agent.ui.voiceAria": "Push to Talk",
  "agent.ui.inputPlaceholder": "Ej. Nuevo ingreso de 2000 EUR...",
  "agent.ui.inputAria": "Mensaje para el agente",
  "agent.ui.sendAria": "Enviar mensaje",
  "agent.ui.confirmToggleTitle": "Confirmación previa del agente",
  "agent.ui.confirmToggleDesc":
    "Muestra impacto exacto antes de modificar saldos",
  "agent.ui.chatgptTitle": "1. Sign in with ChatGPT (Plan Sharing)",
  "agent.ui.chatgptDesc":
    "Usa tu suscripción de ChatGPT mediante OAuth 2.0 + PKCE.",
  "agent.ui.chatgptConnect": "Conectar con ChatGPT",
  "agent.ui.chatgptError": "Error iniciando OAuth ChatGPT",
  "agent.ui.chatgptStarted": "Flujo OAuth PKCE iniciado: {{url}}",
  "agent.ui.byokTitle": "2. Fallback BYOK (AES-256-GCM)",
  "agent.ui.byokDefaultLabel": "Mi API Key OpenAI",
  "agent.ui.byokLabelPlaceholder": "Etiqueta",
  "agent.ui.byokLabelAria": "Etiqueta BYOK",
  "agent.ui.byokModelPlaceholder": "Modelo (ej. gpt-4o-mini)",
  "agent.ui.byokModelAria": "Modelo BYOK",
  "agent.ui.byokKeyPlaceholder": "API Key (sk-...)",
  "agent.ui.byokKeyAria": "API Key BYOK",
  "agent.ui.byokSave": "Guardar Key Cifrada",
  "agent.ui.byokSaved": "API Key cifrada con AES-256-GCM y guardada.",
  "agent.ui.byokError": "Error guardando Key",
  "agent.ui.activeConnections": "Conexiones activas",
  "agent.ui.deleteConnectionAria": "Eliminar conexión {{label}}",

  "command.undo.success": "Cambio deshecho correctamente.",
  "sync.offlineManualOnly":
    "Sin conexión: el modo manual sigue activo y tus cambios se sincronizarán al reconectar.",
  "error.currencyMismatch":
    "No se pueden combinar divisas distintas sin conversión.",
  "error.invalidTimeZone": "La zona horaria indicada no es válida.",
} as const;

export type MessageKey = keyof typeof messagesEs;
export type MessageCatalog = Record<MessageKey, string>;
