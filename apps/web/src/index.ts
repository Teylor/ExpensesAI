import {
  ACCOUNT_TYPES,
  DOMAIN_CONTRACT_VERSION,
  SUPPORTED_LOCALES,
} from "@agenticf/domain";

export * from "./api/client.js";
export * from "./offline/db.js";
export * from "./offline/outbox.js";

/** Metadatos base de la PWA offline-first (React 19 + Vite + Workbox + Dexie.js + Outbox). */
export const WEB_BOOTSTRAP_INFO = {
  app: "agenticf-web",
  pwaOfflineFirst: true,
  domainVersion: DOMAIN_CONTRACT_VERSION,
  supportedLocales: SUPPORTED_LOCALES,
  accountTypes: ACCOUNT_TYPES,
} as const;
