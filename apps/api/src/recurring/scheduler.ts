import { Cron } from "croner";
import type { RecurringService } from "./service.js";

export interface RecurringSchedulerOptions {
  recurringService: RecurringService;
  /** Default: every hour at :00 UTC to catch midnight day-rollover across full-hour IANA timezones (within 30-45m for :30/:45 zones). */
  cronExpression?: string;
  onError?: (error: unknown, context: Record<string, unknown>) => void;
}

export function startRecurringScheduler(options: RecurringSchedulerOptions): {
  stop: () => void;
} {
  const job = new Cron(
    options.cronExpression ?? "0 * * * *",
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
