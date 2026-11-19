import type { ErrorEvent, Log } from "@sentry/node";
import { describe, expect, it } from "vitest";
import {
  initSentry,
  resolveTracesSampleRate,
  scrubSentryEvent,
  scrubSentryLog,
} from "./sentry.js";

describe("Sentry observability and sensitive data scrubbing", () => {
  it("stays disabled cleanly when SENTRY_DSN is omitted", () => {
    const result = initSentry({ dsn: undefined, environment: "test" });
    expect(result.enabled).toBe(false);
  });

  it("redacts sensitive headers while keeping safe request metadata", () => {
    const event: ErrorEvent = {
      type: undefined,
      request: {
        url: "https://api.agenticf.local/api/v1/accounts",
        headers: {
          Authorization: "Bearer super-secret-jwt-value",
          Cookie: "session_id=abc123",
          "X-Api-Key": "custom-api-key",
          "Content-Type": "application/json",
        },
      },
    };

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.request?.headers).toEqual({
      Authorization: "[REDACTED]",
      Cookie: "[REDACTED]",
      "X-Api-Key": "[REDACTED]",
      "Content-Type": "application/json",
    });
  });

  it("deeply redacts financial fields and credentials in extra and request body", () => {
    const event: ErrorEvent = {
      type: undefined,
      extra: {
        userAction: "create_income",
        payload: {
          amount: "2400.00",
          balance: "5400.00",
          salary: "2400",
          iban: "ES9121000418450200051332",
          password: "my-password",
          apiKey: "secret-val",
          currency: "EUR",
        },
      },
      request: {
        data: {
          accessToken: "oauth-token",
          note: "Monthly payroll",
        },
      },
    };

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.extra).toEqual({
      userAction: "create_income",
      payload: {
        amount: "[REDACTED]",
        balance: "[REDACTED]",
        salary: "[REDACTED]",
        iban: "[REDACTED]",
        password: "[REDACTED]",
        apiKey: "[REDACTED]",
        currency: "EUR",
      },
    });
    expect(scrubbed.request?.data).toEqual({
      accessToken: "[REDACTED]",
      note: "Monthly payroll",
    });
  });

  it("redacts inline bearer tokens, postgres credentials, and sk- keys in error messages", () => {
    const fakeKey = `${"sk"}-proj-abcdefghijklmnopqrstuvwxyz123456`;
    const fakeDbUrl = [
      "postgresql://",
      "agenticf",
      ":",
      "topsecret",
      "@db:5432/agenticf",
    ].join("");
    const event: ErrorEvent = {
      type: undefined,
      message: `Failed connecting to ${fakeDbUrl} with Bearer my.jwt.token`,
      exception: {
        values: [
          {
            type: "Error",
            value: `Provider rejected key ${fakeKey}`,
          },
        ],
      },
    };

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.message).toBe(
      "Failed connecting to postgresql://[REDACTED]@db:5432/agenticf with Bearer [REDACTED]",
    );
    expect(scrubbed.exception?.values?.[0]?.value).toBe(
      "Provider rejected key [REDACTED]",
    );
  });

  it("resolves default trace sample rates by environment and honors explicit overrides", () => {
    expect(resolveTracesSampleRate("development")).toBe(1);
    expect(resolveTracesSampleRate("test")).toBe(1);
    expect(resolveTracesSampleRate("production")).toBe(0.1);
    expect(resolveTracesSampleRate("nas-prod")).toBe(0.1);
    expect(resolveTracesSampleRate("production", 0.5)).toBe(0.5);
    expect(resolveTracesSampleRate("development", 0)).toBe(0);
  });

  it("scrubs sensitive tokens and financial fields from structured Sentry logs", () => {
    const fakeKey = `${"sk"}-proj-abcdefghijklmnopqrstuvwxyz123456`;
    const log: Log = {
      level: "error",
      message: `Sync failed with Bearer my.jwt.token and key ${fakeKey}`,
      attributes: {
        route: "/api/v1/transactions",
        currency: "EUR",
        amount: "1500.00",
        balance: "9200.50",
        iban: "ES9121000418450200051332",
        password: "secret-password",
        nested: {
          apiKey: "another-secret",
          status: "failed",
        },
      },
    };

    const scrubbed = scrubSentryLog(log);

    expect(scrubbed.message).toBe(
      "Sync failed with Bearer [REDACTED] and key [REDACTED]",
    );
    expect(scrubbed.attributes).toEqual({
      route: "/api/v1/transactions",
      currency: "EUR",
      amount: "[REDACTED]",
      balance: "[REDACTED]",
      iban: "[REDACTED]",
      password: "[REDACTED]",
      nested: {
        apiKey: "[REDACTED]",
        status: "failed",
      },
    });
  });
});
