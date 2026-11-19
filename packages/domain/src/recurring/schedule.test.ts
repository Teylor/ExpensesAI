import { describe, expect, it } from "vitest";
import { commandEnvelopeSchema } from "../commands/catalog.js";
import { simulateCommandImpact } from "../commands/impact.js";
import { DEFAULT_USER_PREFERENCES } from "../user/preferences.js";
import {
  advanceNextDueLocalDate,
  computeInitialNextDueLocalDate,
  isRecurringRuleDue,
} from "./schedule.js";

describe("Recurring schedule engine (MultiHora localDate & end-of-month clamping)", () => {
  it("computes initial nextDueLocalDate and advances daily, weekly, monthly (clamping 28/29/30/31), quarterly, and yearly", () => {
    // Daily
    expect(
      computeInitialNextDueLocalDate({ frequency: "daily" }, "2026-11-19"),
    ).toBe("2026-11-19");
    expect(advanceNextDueLocalDate({ frequency: "daily" }, "2026-11-19")).toBe(
      "2026-11-20",
    );

    // Weekly (2026-11-19 is Thursday = ISO day 4; target Monday = 1 -> 2026-11-23)
    expect(
      computeInitialNextDueLocalDate(
        { frequency: "weekly", dayOfWeek: 1 },
        "2026-11-19",
      ),
    ).toBe("2026-11-23");
    expect(
      advanceNextDueLocalDate(
        { frequency: "weekly", dayOfWeek: 1 },
        "2026-11-23",
      ),
    ).toBe("2026-11-30");

    // Monthly with dayOfMonth = 31 (clamping across Jan -> Feb -> Mar -> Apr and leap year 2028)
    expect(
      computeInitialNextDueLocalDate(
        { frequency: "monthly", dayOfMonth: 31 },
        "2026-01-15",
      ),
    ).toBe("2026-01-31");
    expect(
      advanceNextDueLocalDate(
        { frequency: "monthly", dayOfMonth: 31 },
        "2026-01-31",
      ),
    ).toBe("2026-02-28");
    expect(
      advanceNextDueLocalDate(
        { frequency: "monthly", dayOfMonth: 31 },
        "2026-02-28",
      ),
    ).toBe("2026-03-31");
    expect(
      advanceNextDueLocalDate(
        { frequency: "monthly", dayOfMonth: 31 },
        "2026-03-31",
      ),
    ).toBe("2026-04-30");
    // Leap year Feb 2028
    expect(
      advanceNextDueLocalDate(
        { frequency: "monthly", dayOfMonth: 31 },
        "2028-01-31",
      ),
    ).toBe("2028-02-29");

    // If today is already past dayOfMonth in the current month, initial due date rolls to next month
    expect(
      computeInitialNextDueLocalDate(
        { frequency: "monthly", dayOfMonth: 5 },
        "2026-11-19",
      ),
    ).toBe("2026-12-05");

    // Quarterly (+3 months with clamping)
    expect(
      advanceNextDueLocalDate(
        { frequency: "quarterly", dayOfMonth: 31 },
        "2026-11-30",
      ),
    ).toBe("2027-02-28");

    // Yearly (+12 months with leap-year clamping)
    expect(
      advanceNextDueLocalDate(
        { frequency: "yearly", dayOfMonth: 29 },
        "2028-02-29",
      ),
    ).toBe("2029-02-28");
  });

  it("evaluates isRecurringRuleDue with idempotency per localDate and active flag", () => {
    expect(
      isRecurringRuleDue(
        {
          isActive: true,
          nextDueLocalDate: "2026-11-19",
          lastTriggeredLocalDate: null,
        },
        "2026-11-19",
      ),
    ).toBe(true);

    // Already triggered today -> false
    expect(
      isRecurringRuleDue(
        {
          isActive: true,
          nextDueLocalDate: "2026-11-19",
          lastTriggeredLocalDate: "2026-11-19",
        },
        "2026-11-19",
      ),
    ).toBe(false);

    // Paused -> false
    expect(
      isRecurringRuleDue(
        {
          isActive: false,
          nextDueLocalDate: "2026-11-19",
          lastTriggeredLocalDate: null,
        },
        "2026-11-19",
      ),
    ).toBe(false);

    // Future due date -> false
    expect(
      isRecurringRuleDue(
        {
          isActive: true,
          nextDueLocalDate: "2026-11-25",
          lastTriggeredLocalDate: null,
        },
        "2026-11-19",
      ),
    ).toBe(false);
  });

  it("validates and simulates impact for recurring.delete", () => {
    const cmd = commandEnvelopeSchema.parse({
      commandId: "80000000-0000-4000-8000-000000000001",
      actor: "manual",
      issuedAtUtc: "2026-11-19T22:00:00.000Z",
      type: "recurring.delete",
      payload: {
        ruleId: "80000000-0000-4000-8000-000000000002",
      },
    });

    const impact = simulateCommandImpact(
      { accounts: {} },
      cmd,
      DEFAULT_USER_PREFERENCES,
    );
    expect(impact.commandType).toBe("recurring.delete");
    expect(impact.summary.length).toBeGreaterThan(5);
  });
});
