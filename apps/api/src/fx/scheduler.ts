import { Cron } from "croner";
import type { FxService } from "./service.js";

export interface FxSchedulerOptions {
  fxService: FxService;
  /** Default: 16:30 UTC daily (shortly after ECB daily reference rate publication). */
  cronExpression?: string;
  onError?: (error: unknown, context: Record<string, unknown>) => void;
}

export function startFxDailyScheduler(options: FxSchedulerOptions): {
  stop: () => void;
} {
  const job = new Cron(
    options.cronExpression ?? "30 16 * * *",
    { timezone: "UTC", protect: true },
    async () => {
      try {
        await options.fxService.refreshDailyRates();
      } catch (error) {
        options.onError?.(error, { job: "fx-daily-refresh" });
      }
    },
  );

  return {
    stop() {
      job.stop();
    },
  };
}
