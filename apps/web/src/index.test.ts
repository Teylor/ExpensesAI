import { ACCOUNT_TYPES, SUPPORTED_LOCALES } from "@agenticf/domain";
import { describe, expect, it } from "vitest";
import { WEB_BOOTSTRAP_INFO } from "./index.js";

describe("@agenticf/web bootstrap invariants", () => {
  it("enforces offline-first PWA configuration and domain parity", () => {
    expect(WEB_BOOTSTRAP_INFO.pwaOfflineFirst).toBe(true);
    expect(WEB_BOOTSTRAP_INFO.supportedLocales).toEqual(SUPPORTED_LOCALES);
    expect(WEB_BOOTSTRAP_INFO.accountTypes).toEqual(ACCOUNT_TYPES);
  });
});
