/** Idiomas soportados en V1 (estructura extensible). */
export const SUPPORTED_LOCALES = ["es", "en"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/** Orígenes de un movimiento financiero (prepara V2 sin migrar esquema). */
export const TRANSACTION_SOURCES = [
  "manual",
  "agent",
  "recurring",
  "csv_import",
  "bank_sync",
] as const;
export type TransactionSource = (typeof TRANSACTION_SOURCES)[number];

/** Tipos de cuenta financiera soportados en V1. */
export const ACCOUNT_TYPES = ["bank", "cash", "savings", "credit"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** Versión de contrato del dominio compartido. */
export const DOMAIN_CONTRACT_VERSION = "0.1.0" as const;
