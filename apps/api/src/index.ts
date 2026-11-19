import {
  ACCOUNT_TYPES,
  DOMAIN_CONTRACT_VERSION,
  SUPPORTED_LOCALES,
  TRANSACTION_SOURCES,
} from "@agenticf/domain";

/** Metadatos base del servicio API stateless (ampliado con Fastify en Seed 03). */
export const API_BOOTSTRAP_INFO = {
  service: "agenticf-api",
  stateless: true,
  domainVersion: DOMAIN_CONTRACT_VERSION,
  supportedLocales: SUPPORTED_LOCALES,
  accountTypes: ACCOUNT_TYPES,
  transactionSources: TRANSACTION_SOURCES,
} as const;
