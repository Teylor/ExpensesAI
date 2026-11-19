import {
  ACCOUNT_TYPES,
  DOMAIN_CONTRACT_VERSION,
  SUPPORTED_LOCALES,
} from "@agenticf/domain";

/** Metadatos base de la PWA offline-first (ampliada con React + Vite en Seeds posteriores). */
export const WEB_BOOTSTRAP_INFO = {
  app: "agenticf-web",
  pwaOfflineFirst: true,
  domainVersion: DOMAIN_CONTRACT_VERSION,
  supportedLocales: SUPPORTED_LOCALES,
  accountTypes: ACCOUNT_TYPES,
} as const;
