import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadEnvFilesIfPresent, parseEnv } from "./env.js";

const VALID_BASE_ENV = {
  DATABASE_URL: [
    "postgresql://",
    "agenticf",
    ":",
    "localtest",
    "@localhost:5432/agenticf",
  ].join(""),
};

describe("parseEnv (12-factor stateless config)", () => {
  it("parses minimal valid env with safe defaults", () => {
    const env = parseEnv(VALID_BASE_ENV);

    expect(env.NODE_ENV).toBe("development");
    expect(env.HOST).toBe("0.0.0.0");
    expect(env.PORT).toBe(3000);
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.CORS_ORIGIN).toBe("http://localhost:5173");
    expect(env.SENTRY_DSN).toBeUndefined();
    expect(env.SENTRY_ENVIRONMENT).toBe("development");
    expect(env.SENTRY_RELEASE).toBeUndefined();
    expect(env.SENTRY_TRACES_SAMPLE_RATE).toBe(1);
  });

  it("coerces PORT from string and accepts valid SENTRY_DSN, SENTRY_RELEASE, and sample rate", () => {
    const env = parseEnv({
      ...VALID_BASE_ENV,
      NODE_ENV: "production",
      PORT: "8080",
      CORS_ORIGIN: "https://finanzas.ejemplo.com",
      SENTRY_DSN: "https://public@sentry.example.com/1",
      SENTRY_ENVIRONMENT: "nas-prod",
      SENTRY_RELEASE: "agenticf-api@0.1.0",
      SENTRY_TRACES_SAMPLE_RATE: "0.25",
    });

    expect(env.PORT).toBe(8080);
    expect(env.SENTRY_DSN).toBe("https://public@sentry.example.com/1");
    expect(env.SENTRY_ENVIRONMENT).toBe("nas-prod");
    expect(env.SENTRY_RELEASE).toBe("agenticf-api@0.1.0");
    expect(env.SENTRY_TRACES_SAMPLE_RATE).toBe(0.25);
  });

  it("defaults SENTRY_TRACES_SAMPLE_RATE to 0.1 in production", () => {
    const env = parseEnv({
      ...VALID_BASE_ENV,
      NODE_ENV: "production",
      CORS_ORIGIN: "https://finanzas.ejemplo.com",
    });

    expect(env.SENTRY_TRACES_SAMPLE_RATE).toBe(0.1);
  });

  it("normalizes empty SENTRY_DSN, SENTRY_RELEASE, and SENTRY_TRACES_SAMPLE_RATE strings", () => {
    const env = parseEnv({
      ...VALID_BASE_ENV,
      SENTRY_DSN: "   ",
      SENTRY_RELEASE: "  ",
      SENTRY_TRACES_SAMPLE_RATE: " ",
    });

    expect(env.SENTRY_DSN).toBeUndefined();
    expect(env.SENTRY_RELEASE).toBeUndefined();
    expect(env.SENTRY_TRACES_SAMPLE_RATE).toBe(1);
  });

  it("rejects out-of-range SENTRY_TRACES_SAMPLE_RATE values", () => {
    expect(() =>
      parseEnv({ ...VALID_BASE_ENV, SENTRY_TRACES_SAMPLE_RATE: "-0.1" }),
    ).toThrow(/SENTRY_TRACES_SAMPLE_RATE/i);
    expect(() =>
      parseEnv({ ...VALID_BASE_ENV, SENTRY_TRACES_SAMPLE_RATE: "1.5" }),
    ).toThrow(/SENTRY_TRACES_SAMPLE_RATE/i);
    expect(() =>
      parseEnv({ ...VALID_BASE_ENV, SENTRY_TRACES_SAMPLE_RATE: "abc" }),
    ).toThrow(/SENTRY_TRACES_SAMPLE_RATE/i);
  });

  it("rejects missing or non-postgres DATABASE_URL", () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/i);
    expect(() =>
      parseEnv({ DATABASE_URL: "mysql://user:pass@localhost/db" }),
    ).toThrow(/DATABASE_URL/i);
  });

  it("rejects invalid PORT values", () => {
    expect(() => parseEnv({ ...VALID_BASE_ENV, PORT: "0" })).toThrow();
    expect(() => parseEnv({ ...VALID_BASE_ENV, PORT: "70000" })).toThrow();
    expect(() => parseEnv({ ...VALID_BASE_ENV, PORT: "not-a-port" })).toThrow();
  });

  it("rejects wildcard CORS_ORIGIN in production", () => {
    expect(() =>
      parseEnv({
        ...VALID_BASE_ENV,
        NODE_ENV: "production",
        CORS_ORIGIN: "*",
      }),
    ).toThrow(/CORS_ORIGIN/i);
  });

  it("normalizes empty, quoted, uppercase, or whitespace-padded LOG_LEVEL and NODE_ENV", () => {
    const emptyLevel = parseEnv({
      ...VALID_BASE_ENV,
      LOG_LEVEL: "",
      NODE_ENV: "PRODUCTION ",
    });
    expect(emptyLevel.LOG_LEVEL).toBe("info");
    expect(emptyLevel.NODE_ENV).toBe("production");

    const quotedLevel = parseEnv({
      ...VALID_BASE_ENV,
      LOG_LEVEL: ' "DEBUG"\r',
    });
    expect(quotedLevel.LOG_LEVEL).toBe("debug");
  });
});

describe("loadEnvFilesIfPresent", () => {
  it("loads missing env variables from an existing .env file without overriding existing ones", () => {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), "agenticf-env-test-"));
    const envPath = path.join(tmpDir, ".env");
    const uniqueNewKey = "AGENTICF_TEST_LOADED_KEY";
    const uniqueExistingKey = "AGENTICF_TEST_EXISTING_KEY";

    writeFileSync(
      envPath,
      `${uniqueNewKey}=from-file\n${uniqueExistingKey}=from-file\n`,
      "utf8",
    );

    process.env[uniqueExistingKey] = "from-shell";
    delete process.env[uniqueNewKey];

    try {
      const loaded = loadEnvFilesIfPresent([
        path.join(tmpDir, "missing.env"),
        envPath,
      ]);

      expect(loaded).toEqual([envPath]);
      expect(process.env[uniqueNewKey]).toBe("from-file");
      expect(process.env[uniqueExistingKey]).toBe("from-shell");
    } finally {
      delete process.env[uniqueNewKey];
      delete process.env[uniqueExistingKey];
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
