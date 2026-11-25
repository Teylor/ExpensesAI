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
  "agent.ui.thinking": "Pensando...",

  "nav.overview": "Resumen",
  "nav.activity": "Movimientos",
  "nav.accounts": "Cuentas",
  "nav.wealth": "Patrimonio",
  "nav.manage": "Gestión",
  "nav.skipToContent": "Saltar al contenido principal",
  "nav.primaryAria": "Navegación principal",
  "nav.mobileAria": "Navegación móvil",
  "nav.subtabsAria": "Secciones",

  "shell.online": "Online",
  "shell.offline": "Sin conexión",
  "shell.sync": "Sincronizar",
  "shell.syncNow": "Sincronizar ahora",
  "shell.syncing": "Sincronizando...",
  "shell.synced": "Sincronizado",
  "shell.pendingCount": "{{count}} pendientes",
  "shell.syncError":
    "No se pudo sincronizar ahora. Tus cambios siguen guardados en local.",
  "shell.retry": "Reintentar",
  "shell.undo": "Deshacer",
  "shell.dismissNotice": "Cerrar aviso",
  "shell.logout": "Salir",
  "shell.localMode": "Modo Offline Local",
  "shell.loading": "Cargando tu espacio financiero...",
  "shell.errorBoundaryTitle": "Algo salió mal en esta pestaña",
  "shell.errorBoundaryDesc":
    "Tus datos locales siguen seguros. Puedes reintentar o cambiar de pestaña.",

  "overview.totalBalance": "Saldo Total",
  "overview.statusTitle": "Estado y Sincronización",
  "overview.accountsSynced": "{{count}} cuentas · Sincronizado",
  "overview.onboardingTitle": "Empieza creando tu primera cuenta",
  "overview.onboardingDesc":
    "Añade una cuenta bancaria, efectivo o ahorro para empezar a registrar movimientos o usar el Agente IA.",
  "overview.createFirstAccount": "Crear primera cuenta",
  "overview.quickRecord": "Registrar movimiento",
  "overview.viewAccounts": "Ver cuentas",
  "overview.chartEmpty": "Sin ingresos ni gastos en este periodo.",
  "overview.chartAria":
    "Gráfico de ingresos ({{income}}) y gastos ({{expense}}) del periodo",

  "activity.subtab.transactions": "Movimientos",
  "activity.subtab.recurring": "Recurrentes",
  "activity.composerToggle": "Registrar movimiento",
  "activity.noAccountsNotice":
    "Crea primero al menos una cuenta para registrar movimientos o reglas recurrentes.",
  "activity.goToAccounts": "Ir a Cuentas",
  "activity.accountLabel": "Cuenta",
  "activity.validationMissingAccount":
    "Selecciona una cuenta válida antes de guardar.",
  "activity.validationMissingDestination":
    "Selecciona una cuenta de destino diferente a la cuenta origen.",
  "activity.validationMissingAmount":
    "Introduce un importe válido mayor que 0.",
  "activity.validationMissingRecurring":
    "Completa cuenta, concepto e importe para crear la regla recurrente.",

  "accounts.portfolioMix": "Cartera de Cuentas",
  "accounts.countSummary": "{{count}} cuentas activas",
  "accounts.addTitle": "Nueva Cuenta",
  "accounts.addSubmit": "Añadir cuenta",
  "accounts.validationMissingName": "Introduce un nombre para la cuenta.",

  "wealth.subtab.investments": "Inversiones",
  "wealth.subtab.networth": "Activos y Deudas",
  "wealth.validationInvestment":
    "Completa nombre, importe invertido y valor actual.",
  "wealth.validationNetWorth": "Completa nombre y valor estimado.",

  "manage.categoriesTitle": "Categorías Editables",
  "manage.categoriesScope.expense": "Gastos",
  "manage.categoriesScope.income": "Ingresos",
  "manage.categoriesScope.investment": "Inversiones",
  "manage.categoriesScope.networth": "Patrimonio",
  "manage.categoriesEmpty": "No hay categorías en este ámbito todavía.",
  "manage.exportsTitle": "Exportación CSV",
  "manage.exportsDesc":
    "Descarga tus datos locales en formato CSV en cualquier momento.",
  "manage.exportsCount": "{{count}} registros",
  "manage.exportsDownloaded": "Archivo {{filename}} descargado.",
  "manage.syncTitle": "Sincronización y Cola Outbox",
  "manage.syncDesc":
    "Tus mutaciones se guardan primero en IndexedDB y se sincronizan automáticamente al reconectar.",
  "manage.prefsTitle": "Preferencias y Sesión",
  "manage.languageLabel": "Idioma de la interfaz",
  "manage.sessionLabel": "Sesión activa",

  "command.undo.success": "Cambio deshecho correctamente.",

  "action.summary.account.create": "Cuenta {{name}} ({{type}}) creada",
  "action.summary.account.update": "Cuenta {{name}} actualizada",
  "action.summary.account.archive": "Cuenta {{name}} archivada",
  "action.summary.transaction.record.income":
    "Nuevo ingreso de {{amount}} ({{description}})",
  "action.summary.transaction.record.expense":
    "Nuevo gasto de {{amount}} ({{description}})",
  "action.summary.transaction.transfer":
    "Transferencia de {{amount}} desde {{fromAccount}} hacia {{toAccount}}",
  "action.summary.transaction.delete": "Movimiento eliminado",
  "action.summary.recurring.upsert":
    "Regla recurrente guardada: {{description}} ({{amount}}, {{period}})",
  "action.summary.recurring.delete": "Regla recurrente eliminada",
  "action.summary.investment.upsert":
    "Inversión {{name}} ({{amount}}) guardada",
  "action.summary.investment.delete": "Inversión eliminada",
  "action.summary.networth.upsert":
    "Elemento de patrimonio {{name}} ({{amount}}) guardado",
  "action.summary.networth.delete": "Elemento de patrimonio eliminado",
  "action.summary.category.upsert": "Categoría {{name}} guardada",
  "action.summary.category.delete": "Categoría eliminada",
  "action.summary.command.undo": "Acción deshecha",
  "action.summary.fallback": "Operación {{type}}",

  "history.triggerButton": "Historial",
  "history.triggerAria": "Historial de acciones",
  "history.triggerAriaCount": "{{count}} acciones activas",
  "history.title": "Historial de acciones",
  "history.closeAria": "Cerrar historial de acciones",
  "history.refreshAria": "Actualizando historial",
  "history.filterAria": "Filtros del historial de acciones",
  "history.filter.all": "Todas",
  "history.filter.active": "Activas",
  "history.filter.undone": "Deshechas",
  "history.actor.manual": "Manual",
  "history.actor.agent": "Agente IA",
  "history.actor.system": "Sistema",
  "history.status.pending": "Pendiente",
  "history.status.synced": "Sincronizado",
  "history.status.failed": "Fallido",
  "history.status.undone": "Deshecha",
  "history.undoAria": "Deshacer acción",
  "history.offlineUndoGuard":
    "Conexión necesaria para deshacer acciones ya sincronizadas.",
  "history.empty.all": "Aún no hay acciones registradas.",
  "history.empty.active": "No hay acciones activas.",
  "history.empty.undone": "No hay acciones deshechas.",
  "history.empty.viewAll": "Ver todas",
  "history.error":
    "No se pudo cargar el historial del servidor. Se muestran las acciones locales.",

  "toast.dismissAria": "Cerrar notificación",
  "toast.undoneSummary": "Acción deshecha.",
  "sync.offlineManualOnly":
    "Sin conexión: el modo manual sigue activo y tus cambios se sincronizarán al reconectar.",
  "error.currencyMismatch":
    "No se pueden combinar divisas distintas sin conversión.",
  "error.invalidTimeZone": "La zona horaria indicada no es válida.",
} as const;

export type MessageKey = keyof typeof messagesEs;
export type MessageCatalog = Record<MessageKey, string>;
