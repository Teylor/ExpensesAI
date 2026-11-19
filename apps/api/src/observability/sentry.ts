import type { ErrorEvent, Log } from "@sentry/node";
import * as Sentry from "@sentry/node";

const REDACTED = "[REDACTED]";

const SENSITIVE_KEY_PATTERNS = [
  /pass(word)?/i,
  /secret/i,
  /token/i,
  /api[-_]?key/i,
  /^authorization$/i,
  /cookie/i,
  /iban/i,
  /card[-_]?num/i,
  /cvv/i,
  /^amount$/i,
  /^balance$/i,
  /^salary$/i,
  /database[-_]?url/i,
];

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

export function scrubSensitiveText(input: string): string {
  return input
    .replace(/(Bearer\s+)[^\s,;]+/gi, `$1${REDACTED}`)
    .replace(/(postgres(?:ql)?:\/\/)([^@\s/]+)@/gi, `$1${REDACTED}@`)
    .replace(
      /\b(?:sk-[a-zA-Z0-9_-]{16,}|gh[pousr]_[a-zA-Z0-9]{20,})\b/g,
      REDACTED,
    );
}

function scrubValue(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === "string") {
    return scrubSensitiveText(value);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (seen.has(value)) {
    return REDACTED;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(item, seen));
  }

  const record = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(record)) {
    if (isSensitiveKey(key)) {
      result[key] = REDACTED;
    } else {
      result[key] = scrubValue(val, seen);
    }
  }
  return result;
}

export function scrubSentryEvent(event: ErrorEvent): ErrorEvent {
  const seen = new WeakSet<object>();
  const cloned: ErrorEvent = { ...event };

  if (typeof cloned.message === "string") {
    cloned.message = scrubSensitiveText(cloned.message);
  }

  if (cloned.exception?.values) {
    cloned.exception = {
      ...cloned.exception,
      values: cloned.exception.values.map((ex) => ({
        ...ex,
        ...(typeof ex.value === "string"
          ? { value: scrubSensitiveText(ex.value) }
          : {}),
      })),
    };
  }

  if (cloned.request) {
    const req = { ...cloned.request };
    if (req.headers) {
      const scrubbedHeaders: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) {
        scrubbedHeaders[k] = isSensitiveKey(k)
          ? REDACTED
          : scrubSensitiveText(String(v));
      }
      req.headers = scrubbedHeaders;
    }
    if (req.data !== undefined) {
      req.data = scrubValue(req.data, seen);
    }
    if (req.cookies) {
      req.cookies = {};
    }
    cloned.request = req;
  }

  if (cloned.extra) {
    cloned.extra = scrubValue(cloned.extra, seen) as Record<string, unknown>;
  }

  if (cloned.contexts) {
    cloned.contexts = scrubValue(cloned.contexts, seen) as NonNullable<
      ErrorEvent["contexts"]
    >;
  }

  if (cloned.tags) {
    const scrubbedTags: Record<
      string,
      string | number | boolean | bigint | symbol | null | undefined
    > = {};
    for (const [k, v] of Object.entries(cloned.tags)) {
      scrubbedTags[k] = isSensitiveKey(k)
        ? REDACTED
        : typeof v === "string"
          ? scrubSensitiveText(v)
          : v;
    }
    cloned.tags = scrubbedTags;
  }

  if (cloned.breadcrumbs) {
    cloned.breadcrumbs = cloned.breadcrumbs.map((crumb) => ({
      ...crumb,
      ...(typeof crumb.message === "string"
        ? { message: scrubSensitiveText(crumb.message) }
        : {}),
      ...(crumb.data
        ? { data: scrubValue(crumb.data, seen) as Record<string, unknown> }
        : {}),
    }));
  }

  return cloned;
}

export function scrubSentryLog(log: Log): Log {
  const seen = new WeakSet<object>();
  const cloned: Log = { ...log };

  if (typeof cloned.message === "string") {
    cloned.message = scrubSensitiveText(cloned.message);
  }

  if (cloned.attributes) {
    cloned.attributes = scrubValue(cloned.attributes, seen) as Record<
      string,
      unknown
    >;
  }

  return cloned;
}

export function resolveTracesSampleRate(
  environment: string,
  explicitRate?: number,
): number {
  if (
    typeof explicitRate === "number" &&
    !Number.isNaN(explicitRate) &&
    explicitRate >= 0 &&
    explicitRate <= 1
  ) {
    return explicitRate;
  }

  const normalized = environment.trim().toLowerCase();
  if (normalized === "development" || normalized === "test") {
    return 1;
  }
  return 0.1;
}

export interface SentryInitOptions {
  dsn: string | undefined;
  environment: string;
  release?: string | undefined;
  tracesSampleRate?: number | undefined;
}

let sentryEnabled = false;
let initializedDsn: string | undefined;

export function initSentry(options: SentryInitOptions): { enabled: boolean } {
  if (!options.dsn) {
    if (!Sentry.isInitialized()) {
      sentryEnabled = false;
      initializedDsn = undefined;
    }
    return { enabled: sentryEnabled };
  }

  if (Sentry.isInitialized() && initializedDsn === options.dsn) {
    sentryEnabled = true;
    return { enabled: true };
  }

  Sentry.init({
    dsn: options.dsn,
    environment: options.environment,
    ...(options.release ? { release: options.release } : {}),
    tracesSampleRate: resolveTracesSampleRate(
      options.environment,
      options.tracesSampleRate,
    ),
    integrations: [
      Sentry.fastifyIntegration(),
      Sentry.pinoIntegration({
        log: { levels: ["info", "warn", "error", "fatal"] },
      }),
    ],
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpBodies: [],
      databaseQueryData: false,
      genAI: {
        inputs: false,
        outputs: false,
      },
    },
    beforeSend(event) {
      return scrubSentryEvent(event);
    },
    beforeSendLog(log) {
      return scrubSentryLog(log);
    },
  });

  sentryEnabled = true;
  initializedDsn = options.dsn;
  return { enabled: true };
}

export function captureExceptionSafe(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (!sentryEnabled) {
    return;
  }
  Sentry.withScope((scope) => {
    if (context) {
      const seen = new WeakSet<object>();
      scope.setExtras(scrubValue(context, seen) as Record<string, unknown>);
    }
    Sentry.captureException(error);
  });
}

export async function flushSentry(timeoutMs = 2000): Promise<boolean> {
  if (!sentryEnabled) {
    return true;
  }
  return Sentry.flush(timeoutMs);
}
