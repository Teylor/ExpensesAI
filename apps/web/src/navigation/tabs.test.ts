import { describe, expect, it } from "vitest";
import {
  APP_TABS,
  buildTabUrl,
  DEFAULT_APP_TAB,
  isAppTab,
  parseAppTab,
} from "./tabs.js";

describe("navigation/tabs (URL-backed 5-tab contract)", () => {
  it("exposes the 5 confirmed application tabs in canonical order", () => {
    expect(APP_TABS).toEqual([
      "overview",
      "activity",
      "accounts",
      "wealth",
      "manage",
    ]);
    expect(DEFAULT_APP_TAB).toBe("overview");
  });

  it("validates tab identifiers strictly via isAppTab", () => {
    for (const tab of APP_TABS) {
      expect(isAppTab(tab)).toBe(true);
    }
    expect(isAppTab("settings")).toBe(false);
    expect(isAppTab("")).toBe(false);
    expect(isAppTab("OVERVIEW")).toBe(false);
  });

  it("parses valid ?tab query parameters and falls back safely to overview", () => {
    expect(parseAppTab("")).toBe("overview");
    expect(parseAppTab("?tab=overview")).toBe("overview");
    expect(parseAppTab("?tab=activity")).toBe("activity");
    expect(parseAppTab("?tab=accounts")).toBe("accounts");
    expect(parseAppTab("?tab=wealth")).toBe("wealth");
    expect(parseAppTab("?tab=manage")).toBe("manage");

    // Case-insensitive and trimmed input
    expect(parseAppTab("?foo=1&tab=ACCOUNTS")).toBe("accounts");
    expect(parseAppTab("tab=%20wealth%20")).toBe("wealth");
    expect(parseAppTab(new URLSearchParams("tab=manage"))).toBe("manage");

    // Invalid or empty values fall back to overview
    expect(parseAppTab("?tab=")).toBe("overview");
    expect(parseAppTab("?tab=invalid")).toBe("overview");
    expect(parseAppTab("?tab=__proto__")).toBe("overview");
    expect(parseAppTab("?other=123")).toBe("overview");
  });

  it("builds relative URLs with updated ?tab while preserving pathname, unrelated params, and hash", () => {
    expect(buildTabUrl("/", "accounts")).toBe("/?tab=accounts");
    expect(buildTabUrl("/?tab=overview", "wealth")).toBe("/?tab=wealth");
    expect(buildTabUrl("/?foo=bar&tab=activity#top", "manage")).toBe(
      "/?foo=bar&tab=manage#top",
    );
    expect(
      buildTabUrl("http://localhost:5173/app?tab=wealth", "overview"),
    ).toBe("/app?tab=overview");
  });
});
