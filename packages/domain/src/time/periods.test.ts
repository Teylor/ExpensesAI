import { describe, expect, it } from "vitest";
import { FINANCIAL_PERIODS, getPeriodBoundsUtc } from "./periods.js";

describe("getPeriodBoundsUtc (timezone-aware financial period windows)", () => {
  it("exposes all 5 V1 financial periods", () => {
    expect(FINANCIAL_PERIODS).toEqual([
      "daily",
      "weekly",
      "monthly",
      "quarterly",
      "yearly",
    ]);
  });

  it("computes daily windows accurately including 23h and 25h DST transition days", () => {
    const normal = getPeriodBoundsUtc(
      "daily",
      new Date("2026-01-15T14:00:00.000Z"),
      "Europe/Madrid",
    );
    expect(normal.startLocalDate).toBe("2026-01-15");
    expect(normal.endLocalDate).toBe("2026-01-16");
    expect(normal.startUtc.toISOString()).toBe("2026-01-14T23:00:00.000Z");
    expect(normal.endUtc.toISOString()).toBe("2026-01-15T23:00:00.000Z");
    expect(
      (normal.endUtc.getTime() - normal.startUtc.getTime()) / 3_600_000,
    ).toBe(24);

    // Spring-forward 23h day in Europe/Madrid (2026-03-29)
    const springForward = getPeriodBoundsUtc(
      "daily",
      new Date("2026-03-29T12:00:00.000Z"),
      "Europe/Madrid",
    );
    expect(springForward.startUtc.toISOString()).toBe(
      "2026-03-28T23:00:00.000Z",
    );
    expect(springForward.endUtc.toISOString()).toBe("2026-03-29T22:00:00.000Z");
    expect(
      (springForward.endUtc.getTime() - springForward.startUtc.getTime()) /
        3_600_000,
    ).toBe(23);

    // Fall-back 25h day in Europe/Madrid (2026-10-25)
    const fallBack = getPeriodBoundsUtc(
      "daily",
      new Date("2026-10-25T12:00:00.000Z"),
      "Europe/Madrid",
    );
    expect(fallBack.startUtc.toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(fallBack.endUtc.toISOString()).toBe("2026-10-25T23:00:00.000Z");
    expect(
      (fallBack.endUtc.getTime() - fallBack.startUtc.getTime()) / 3_600_000,
    ).toBe(25);
  });

  it("computes ISO Monday-to-Monday weekly windows respecting local midnight crossover", () => {
    const stillSunday = getPeriodBoundsUtc(
      "weekly",
      new Date("2026-03-15T22:00:00.000Z"),
      "Europe/Madrid",
    );
    expect(stillSunday.startLocalDate).toBe("2026-03-09");
    expect(stillSunday.endLocalDate).toBe("2026-03-16");

    const alreadyMonday = getPeriodBoundsUtc(
      "weekly",
      new Date("2026-03-15T23:30:00.000Z"),
      "Europe/Madrid",
    );
    expect(alreadyMonday.startLocalDate).toBe("2026-03-16");
    expect(alreadyMonday.endLocalDate).toBe("2026-03-23");
  });

  it("computes monthly windows across leap years and New Year timezone crossover", () => {
    const leapFeb = getPeriodBoundsUtc(
      "monthly",
      new Date("2024-02-15T12:00:00.000Z"),
      "UTC",
    );
    expect(leapFeb.startLocalDate).toBe("2024-02-01");
    expect(leapFeb.endLocalDate).toBe("2024-03-01");

    const newYearInMadrid = getPeriodBoundsUtc(
      "monthly",
      new Date("2026-12-31T23:30:00.000Z"),
      "Europe/Madrid",
    );
    expect(newYearInMadrid.startLocalDate).toBe("2027-01-01");
    expect(newYearInMadrid.endLocalDate).toBe("2027-02-01");
  });

  it("computes quarterly and yearly windows accurately", () => {
    const q1 = getPeriodBoundsUtc(
      "quarterly",
      new Date("2026-02-10T10:00:00.000Z"),
      "UTC",
    );
    expect(q1.startLocalDate).toBe("2026-01-01");
    expect(q1.endLocalDate).toBe("2026-04-01");

    const q4 = getPeriodBoundsUtc(
      "quarterly",
      new Date("2026-11-19T10:00:00.000Z"),
      "UTC",
    );
    expect(q4.startLocalDate).toBe("2026-10-01");
    expect(q4.endLocalDate).toBe("2027-01-01");

    const yearlyNy = getPeriodBoundsUtc(
      "yearly",
      new Date("2026-06-15T12:00:00.000Z"),
      "America/New_York",
    );
    expect(yearlyNy.startLocalDate).toBe("2026-01-01");
    expect(yearlyNy.endLocalDate).toBe("2027-01-01");
    expect(yearlyNy.startUtc.toISOString()).toBe("2026-01-01T05:00:00.000Z");
    expect(yearlyNy.endUtc.toISOString()).toBe("2027-01-01T05:00:00.000Z");
  });
});
