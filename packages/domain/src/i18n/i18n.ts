import { SUPPORTED_LOCALES, type SupportedLocale } from "../contracts.js";
import { messagesEn } from "./messages.en.js";
import {
  type MessageCatalog,
  type MessageKey,
  messagesEs,
} from "./messages.es.js";

const CATALOGS: Record<SupportedLocale, MessageCatalog> = {
  es: messagesEs,
  en: messagesEn,
};

export function resolveLocale(
  rawLocale: string | null | undefined,
  fallback: SupportedLocale = "es",
): SupportedLocale {
  if (!rawLocale) {
    return fallback;
  }
  const primaryTag = rawLocale.trim().toLowerCase().split(/[-_]/)[0];
  if (
    primaryTag &&
    (SUPPORTED_LOCALES as readonly string[]).includes(primaryTag)
  ) {
    return primaryTag as SupportedLocale;
  }
  return fallback;
}

export function t(
  locale: SupportedLocale,
  key: MessageKey,
  params?: Readonly<Record<string, string | number>>,
): string {
  const template = CATALOGS[locale][key];
  if (!params) {
    return template;
  }

  return template.replace(/\{\{(\w+)\}\}/g, (match, token: string) => {
    const value = params[token];
    return value !== undefined ? String(value) : match;
  });
}
