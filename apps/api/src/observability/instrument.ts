import { initSentry } from "./sentry.js";

const rawDsn = process.env.SENTRY_DSN?.trim();
const rawEnv =
  process.env.SENTRY_ENVIRONMENT?.trim() ||
  process.env.NODE_ENV?.trim() ||
  "development";
const rawRelease = process.env.SENTRY_RELEASE?.trim();
const rawSampleRate = process.env.SENTRY_TRACES_SAMPLE_RATE?.trim();
const parsedSampleRate =
  rawSampleRate !== undefined && rawSampleRate !== ""
    ? Number(rawSampleRate)
    : undefined;

initSentry({
  dsn: rawDsn || undefined,
  environment: rawEnv,
  release: rawRelease || undefined,
  tracesSampleRate: parsedSampleRate,
});
