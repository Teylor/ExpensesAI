import { Cron } from "croner";
import type { RecurringService } from "./service.js";

export interface RecurringSchedulerOptions {
  recurringService: RecurringService;
  /** Default: every 15 minutes in UTC to catch midnight day-rollover across all IANA timezones. */
  cronExpression?: string;
  onError?: (error: unknown, context: Record<string, unknown>) => void;
}

export function startRecurringScheduler(options: RecurringSchedulerOptions): {
  stop: () => void;
} {
  const job = new Cron(
    options.cronExpression ?? "*/15 * * * *",
    { timezone: "UTC", protect: true },
    async () => {
      try {
        await options.recurringService.processDueRecurringRules();
      } catch (error) {
        options.onError?.(error, { job: "recurring-rules-worker" });
      }
    },
  );

  return {
    stop() {
      job.stop();
    },
  };
}
