import { describe, expect, it } from "vitest";
import {
  DEFAULT_USER_PREFERENCES,
  loginRequestSchema,
  mergeUserPreferences,
  registerRequestSchema,
  userPreferencesSchema,
} from "./preferences.js";

describe("UserPreferences and Auth domain schemas", () => {
  it("provides valid default user preferences", () => {
    const parsed = userPreferencesSchema.parse(DEFAULT_USER_PREFERENCES);
    expect(parsed).toEqual({
      baseCurrency: "EUR",
      timezone: "Europe/Madrid",
      locale: "es",
      thousandsSeparator: ".",
      decimalSeparator: ",",
      symbolPosition: "after",
      agentConfirmEnabled: true,
    });
  });

  it("rejects conflicting thousands and decimal separators on full and partial merges", () => {
    expect(() =>
      userPreferencesSchema.parse({
        ...DEFAULT_USER_PREFERENCES,
        thousandsSeparator: ".",
        decimalSeparator: ".",
      }),
    ).toThrow(/different/i);

    // Partial patch sets decimalSeparator to '.' while current thousandsSeparator is '.' -> must fail!
    expect(() =>
      mergeUserPreferences(DEFAULT_USER_PREFERENCES, {
        decimalSeparator: ".",
      }),
    ).toThrow(/different/i);

    // Updating both together succeeds cleanly
    const updated = mergeUserPreferences(DEFAULT_USER_PREFERENCES, {
      baseCurrency: "usd",
      thousandsSeparator: ",",
      decimalSeparator: ".",
      symbolPosition: "before",
      agentConfirmEnabled: false,
    });
    expect(updated.baseCurrency).toBe("USD");
    expect(updated.thousandsSeparator).toBe(",");
    expect(updated.decimalSeparator).toBe(".");
    expect(updated.agentConfirmEnabled).toBe(false);
  });

  it("normalizes registration email and enforces minimum password length of 12 chars", () => {
    const valid = registerRequestSchema.parse({
      email: "  Alice@Example.COM ",
      password: "correct-horse-battery-staple",
      displayName: " Alice ",
    });
    expect(valid.email).toBe("alice@example.com");
    expect(valid.displayName).toBe("Alice");

    expect(() =>
      registerRequestSchema.parse({
        email: "alice@example.com",
        password: "short",
      }),
    ).toThrow();

    expect(() =>
      registerRequestSchema.parse({
        email: "not-an-email",
        password: "correct-horse-battery-staple",
      }),
    ).toThrow();
  });

  it("normalizes login email and rejects empty password", () => {
    const login = loginRequestSchema.parse({
      email: "BOB@EXAMPLE.COM",
      password: "any-non-empty-password",
    });
    expect(login.email).toBe("bob@example.com");

    expect(() =>
      loginRequestSchema.parse({ email: "bob@example.com", password: "" }),
    ).toThrow();
  });
});
