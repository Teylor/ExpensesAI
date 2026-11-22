export const APP_TABS = [
  "overview",
  "activity",
  "accounts",
  "wealth",
  "manage",
] as const;

export type AppTab = (typeof APP_TABS)[number];

export const DEFAULT_APP_TAB: AppTab = "overview";

export const ACTIVITY_SUBTABS = ["transactions", "recurring"] as const;
export type ActivitySubTab = (typeof ACTIVITY_SUBTABS)[number];

export const WEALTH_SUBTABS = ["investments", "networth"] as const;
export type WealthSubTab = (typeof WEALTH_SUBTABS)[number];

const APP_TAB_SET: ReadonlySet<string> = new Set(APP_TABS);

export function isAppTab(value: string): value is AppTab {
  return APP_TAB_SET.has(value);
}

export function parseAppTab(search: string | URLSearchParams): AppTab {
  const params =
    typeof search === "string"
      ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
      : search;
  const raw = params.get("tab");
  if (!raw) {
    return DEFAULT_APP_TAB;
  }
  const normalized = raw.trim().toLowerCase();
  return isAppTab(normalized) ? normalized : DEFAULT_APP_TAB;
}

export function buildTabUrl(currentHrefOrPath: string, tab: AppTab): string {
  const parsed = new URL(currentHrefOrPath, "http://agenticf.local");
  parsed.searchParams.set("tab", tab);
  const query = parsed.searchParams.toString();
  return `${parsed.pathname}${query ? `?${query}` : ""}${parsed.hash}`;
}
