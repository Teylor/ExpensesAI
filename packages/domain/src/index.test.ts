import { describe, expect, it } from "vitest";
import {
  ACCOUNT_TYPES,
  DOMAIN_CONTRACT_VERSION,
  SUPPORTED_LOCALES,
  TRANSACTION_SOURCES,
} from "./index.js";

describe("@agenticf/domain base contracts", () => {
  it("exposes V1 supported locales (es and en)", () => {
    expect(SUPPORTED_LOCALES).toEqual(["es", "en"]);
  });

  it("preserves V1 and V2 transaction source hooks without breaking schema evolution", () => {
    expect(TRANSACTION_SOURCES).toContain("manual");
    expect(TRANSACTION_SOURCES).toContain("agent");
    expect(TRANSACTION_SOURCES).toContain("recurring");
    expect(TRANSACTION_SOURCES).toContain("csv_import");
    expect(TRANSACTION_SOURCES).toContain("bank_sync");
  });

  it("includes required account categories and semantic contract version", () => {
    expect(ACCOUNT_TYPES).toEqual(["bank", "cash", "savings", "credit"]);
    expect(DOMAIN_CONTRACT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
