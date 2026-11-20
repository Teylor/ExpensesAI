import type { CommandEnvelope } from "../commands/catalog.js";
import type { SupportedLocale } from "../contracts.js";
import { t } from "../i18n/i18n.js";

export interface GuardrailEvaluation {
  readonly allowed: boolean;
  readonly rejectionMessage?: string;
}

const OUT_OF_SCOPE_PATTERNS: readonly RegExp[] = [
  /\b(poema|poem|poes[ií]a|haiku|canción|song|chiste|joke)\b/i,
  /\b(receta|recipe|cocinar|paella|tortilla|ingredientes)\b/i,
  /\b(python|javascript|typescript|scrape|html|css|c\+\+|java|sql|algoritmo|leetcode)\b/i,
  /\b(ignore\s+(all\s+)?previous\s+instructions|system\s+prompt|jailbreak|act\s+as\s+a\s+general)\b/i,
  /\b(mundial\s+de\s+f[uú]tbol|world\s+cup|capital\s+de|quién\s+ganó|who\s+won)\b/i,
];

const FINANCIAL_DOMAIN_KEYWORDS: readonly RegExp[] = [
  /\b(saldo|balance|cuenta|account|banco|bank|efectivo|cash|ahorro|saving|crédito|credit)\b/i,
  /\b(ingreso|income|cobrado|cobro|sueldo|nómina|salary|gasto|expense|pagado|pago|compra|factura|transferencia|transfer)\b/i,
  /\b(recurrente|recurring|alquiler|rent|suscripci[oó]n|subscription|mensual|monthly|anual|yearly|semanal|weekly|diario|daily|trimestral|quarterly)\b/i,
  /\b(inversi[oó]n|investment|crypto|btc|bitcoin|eth|acciones|stock|etf|fondo|fund|patrimonio|net\s*worth|hipoteca|mortgage|préstamo|loan|activo|pasivo|carta|coleccionable)\b/i,
  /\b(categor[ií]a|category|divisa|moneda|currency|eur|euro|usd|d[oó]lar|gbp|jpy|chf|deshaz|deshacer|undo|csv|exportar|export)\b/i,
  /\d+([.,]\d+)?\s*(€|\$|eur|euros?|usd|dólares?)/i,
];

export function evaluateFinancialDomainGuardrail(
  rawPrompt: string,
  locale: SupportedLocale = "es",
): GuardrailEvaluation {
  const prompt = rawPrompt.trim();
  if (!prompt) {
    return {
      allowed: false,
      rejectionMessage: t(locale, "agent.guardrail.outOfScope"),
    };
  }

  for (const blocked of OUT_OF_SCOPE_PATTERNS) {
    if (blocked.test(prompt)) {
      return {
        allowed: false,
        rejectionMessage: t(locale, "agent.guardrail.outOfScope"),
      };
    }
  }

  const hasFinancialSignal = FINANCIAL_DOMAIN_KEYWORDS.some((rx) =>
    rx.test(prompt),
  );
  if (!hasFinancialSignal) {
    return {
      allowed: false,
      rejectionMessage: t(locale, "agent.guardrail.outOfScope"),
    };
  }

  return { allowed: true };
}

export interface NaturalIntentContext {
  readonly defaultAccountId?: string;
  readonly defaultCurrency: string;
  readonly commandId?: string;
  readonly nowIso?: string;
}

export function parseNaturalFinanceIntent(
  rawPrompt: string,
  context: NaturalIntentContext,
): CommandEnvelope | null {
  if (!context.defaultAccountId) {
    return null;
  }

  const prompt = rawPrompt.trim();
  const amountMatch = prompt.match(
    /(\d+(?:[.,]\d{1,8})?)\s*(?:€|\$|eur|euros?|usd|d[oó]lares?)?/i,
  );
  if (!amountMatch?.[1]) {
    return null;
  }

  const normalizedAmount = amountMatch[1].replace(",", ".");
  if (Number(normalizedAmount) <= 0) {
    return null;
  }

  const currency = /\b(usd|d[oó]lares?)\b|\$/i.test(prompt)
    ? "USD"
    : /\b(eur|euros?)\b|€/i.test(prompt)
      ? "EUR"
      : context.defaultCurrency;

  const isIncome =
    /\b(ingreso|income|cobrado|cobro|nómina|salary|recibido)\b/i.test(prompt);
  const isExpense =
    /\b(gasto|expense|pagado|pago\s+en|comprado|compra|supermercado|cena|comida)\b/i.test(
      prompt,
    );

  if (!isIncome && !isExpense) {
    return null;
  }

  const kind: "income" | "expense" = isIncome ? "income" : "expense";
  const commandId = context.commandId ?? "00000000-0000-4000-8000-000000000001";
  const issuedAtUtc = context.nowIso ?? new Date().toISOString();

  return {
    commandId,
    actor: "agent",
    issuedAtUtc,
    type: "transaction.record",
    payload: {
      kind,
      accountId: context.defaultAccountId,
      amount: normalizedAmount,
      currency,
      description: prompt.slice(0, 140),
      source: "agent",
    },
  };
}
