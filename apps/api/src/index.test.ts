import { SUPPORTED_LOCALES, TRANSACTION_SOURCES } from "@agenticf/domain";
import { describe, expect, it } from "vitest";
import { API_BOOTSTRAP_INFO } from "./index.js";

describe("@agenticf/api bootstrap invariants", () => {
  it("enforces stateless server architecture and domain parity", () => {
    expect(API_BOOTSTRAP_INFO.stateless).toBe(true);
    expect(API_BOOTSTRAP_INFO.supportedLocales).toEqual(SUPPORTED_LOCALES);
    expect(API_BOOTSTRAP_INFO.transactionSources).toEqual(TRANSACTION_SOURCES);
  });
});
