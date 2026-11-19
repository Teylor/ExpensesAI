import {
  assertValidTimeZone,
  formatLocalDateParts,
  localDateTimeToUtc,
  toLocalDateTimeParts,
} from "./timezone.js";

export const FINANCIAL_PERIODS = [
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
] as const;

export type FinancialPeriod = (typeof FINANCIAL_PERIODS)[number];

export interface PeriodBoundsUtc {
  readonly period: FinancialPeriod;
  readonly timeZone: string;
  readonly startLocalDate: string;
  readonly endLocalDate: string;
  readonly startUtc: Date;
  readonly endUtc: Date;
}

function addCalendarDays(
  year: number,
  month: number,
  day: number,
  deltaDays: number,
): string {
  const d = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return formatLocalDateParts(
    d.getUTCFullYear(),
    d.getUTCMonth() + 1,
    d.getUTCDate(),
  );
}

export function getPeriodBoundsUtc(
  period: FinancialPeriod,
  referenceDateUtc: Date,
  timeZone: string,
): PeriodBoundsUtc {
  const validTz = assertValidTimeZone(timeZone);
  const local = toLocalDateTimeParts(referenceDateUtc, validTz);

  let startLocalDate: string;
  let endLocalDate: string;

  switch (period) {
    case "daily": {
      startLocalDate = local.localDate;
      endLocalDate = addCalendarDays(local.year, local.month, local.day, 1);
      break;
    }
    case "weekly": {
      // ISO-8601 week: Monday = 0 ... Sunday = 6
      const utcDayOfWeek = new Date(
        Date.UTC(local.year, local.month - 1, local.day),
      ).getUTCDay();
      const daysSinceMonday = (utcDayOfWeek + 6) % 7;
      startLocalDate = addCalendarDays(
        local.year,
        local.month,
        local.day,
        -daysSinceMonday,
      );
      endLocalDate = addCalendarDays(
        local.year,
        local.month,
        local.day,
        7 - daysSinceMonday,
      );
      break;
    }
    case "monthly": {
      startLocalDate = formatLocalDateParts(local.year, local.month, 1);
      const nextMonthYear = local.month === 12 ? local.year + 1 : local.year;
      const nextMonth = local.month === 12 ? 1 : local.month + 1;
      endLocalDate = formatLocalDateParts(nextMonthYear, nextMonth, 1);
      break;
    }
    case "quarterly": {
      const quarterStartMonth = Math.floor((local.month - 1) / 3) * 3 + 1;
      startLocalDate = formatLocalDateParts(local.year, quarterStartMonth, 1);
      const nextQuarterYear =
        quarterStartMonth === 10 ? local.year + 1 : local.year;
      const nextQuarterMonth =
        quarterStartMonth === 10 ? 1 : quarterStartMonth + 3;
      endLocalDate = formatLocalDateParts(nextQuarterYear, nextQuarterMonth, 1);
      break;
    }
    case "yearly": {
      startLocalDate = formatLocalDateParts(local.year, 1, 1);
      endLocalDate = formatLocalDateParts(local.year + 1, 1, 1);
      break;
    }
  }

  return {
    period,
    timeZone: validTz,
    startLocalDate,
    endLocalDate,
    startUtc: localDateTimeToUtc(startLocalDate, "00:00:00", validTz),
    endUtc: localDateTimeToUtc(endLocalDate, "00:00:00", validTz),
  };
}
