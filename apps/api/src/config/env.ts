import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ENV_PATHS = [
  path.resolve(configDir, "../../.env"),
  path.resolve(configDir, "../../../../.env"),
];

/**
 * Carga ficheros .env locales (apps/api/.env y raíz del monorepo) si existen,
 * sin sobrescribir variables ya inyectadas por shell/Docker/Cloud.
 */
export function loadEnvFilesIfPresent(
  paths: readonly string[] = DEFAULT_ENV_PATHS,
): string[] {
  const loaded: string[] = [];
  for (const filePath of paths) {
    if (existsSync(filePath)) {
      process.loadEnvFile(filePath);
      loaded.push(filePath);
    }
  }
  return loaded;
}

const emptyToUndefined = (value: unknown): unknown => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }
  return value;
};

const normalizeEnumInput = (value: unknown): unknown => {
  if (typeof value !== "string") {
    return value;
  }
  const trimmed = value
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .trim();
  return trimmed === "" ? undefined : trimmed.toLowerCase();
};

const normalizeBooleanInput = (value: unknown): unknown => {
  if (typeof value !== "string") {
    return value;
  }
  const normalized = normalizeEnumInput(value);
  if (normalized === undefined) {
    return undefined;
  }
  if (
    normalized === "true" ||
    normalized === "1" ||
    normalized === "yes" ||
    normalized === "on"
  ) {
    return true;
  }
  if (
    normalized === "false" ||
    normalized === "0" ||
    normalized === "no" ||
    normalized === "off"
  ) {
    return false;
  }
  return value;
};

const envSchema = z
  .object({
    NODE_ENV: z.preprocess(
      normalizeEnumInput,
      z.enum(["development", "test", "production"]).default("development"),
    ),
    HOST: z.string().min(1).default("0.0.0.0"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z.preprocess(
      normalizeEnumInput,
      z
        .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
        .default("info"),
    ),
    DATABASE_URL: z
      .string({
        error:
          "DATABASE_URL is required and must be a PostgreSQL connection string",
      })
      .refine(
        (value) =>
          value.startsWith("postgres://") || value.startsWith("postgresql://"),
        {
          message: "DATABASE_URL must start with postgres:// or postgresql://",
        },
      ),
    CORS_ORIGIN: z.string().min(1).default("http://localhost:5173"),
    SENTRY_DSN: z.preprocess(emptyToUndefined, z.url().optional()),
    SENTRY_ENVIRONMENT: z.preprocess(
      emptyToUndefined,
      z.string().min(1).optional(),
    ),
    SENTRY_RELEASE: z.preprocess(
      emptyToUndefined,
      z.string().min(1).optional(),
    ),
    SENTRY_TRACES_SAMPLE_RATE: z.preprocess(
      emptyToUndefined,
      z.coerce.number().min(0).max(1).optional(),
    ),
    AI_VAULT_SECRET: z
      .string()
      .min(16)
      .default("agenticf-dev-aes-256-gcm-master-secret"),
    CHATGPT_OAUTH_CLIENT_ID: z.string().min(1).default("dynamic_agent_client"),
    CHATGPT_OAUTH_REDIRECT_URI: z
      .url()
      .default("http://localhost:5173/oauth/chatgpt/callback"),
    AUTO_MIGRATE: z.preprocess(
      normalizeBooleanInput,
      z.boolean().default(true),
    ),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === "production" && data.CORS_ORIGIN.trim() === "*") {
      ctx.addIssue({
        code: "custom",
        path: ["CORS_ORIGIN"],
        message: "CORS_ORIGIN cannot be '*' in production",
      });
    }
  });

export type AppEnv = Omit<
  z.infer<typeof envSchema>,
  "SENTRY_ENVIRONMENT" | "SENTRY_TRACES_SAMPLE_RATE"
> & {
  SENTRY_ENVIRONMENT: string;
  SENTRY_TRACES_SAMPLE_RATE: number;
};

export function parseEnv(rawEnv: Record<string, string | undefined>): AppEnv {
  const result = envSchema.safeParse(rawEnv);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return {
    ...result.data,
    SENTRY_ENVIRONMENT: result.data.SENTRY_ENVIRONMENT ?? result.data.NODE_ENV,
    SENTRY_TRACES_SAMPLE_RATE:
      result.data.SENTRY_TRACES_SAMPLE_RATE ??
      (result.data.NODE_ENV === "production" ? 0.1 : 1),
  };
}
