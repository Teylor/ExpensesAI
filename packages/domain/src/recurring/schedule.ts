import type { FinancialPeriod } from "../time/index.js";

export interface RecurringScheduleConfig {
  readonly frequency: FinancialPeriod;
  readonly dayOfMonth?: number;
  readonly dayOfWeek?: number;
}

export interface RecurringRuleDueState {
  readonly isActive: boolean;
  readonly nextDueLocalDate: string;
  readonly lastTriggeredLocalDate: string | null;
}

function parseYmd(localDate: string): {
  year: number;
  month: number;
  day: number;
} {
  const [y = "2026", m = "01", d = "01"] = localDate.split("-");
  return {
    year: Number(y),
    month: Number(m),
    day: Number(d),
  };
}

function formatYmd(year: number, month: number, day: number): string {
  const y = String(year).padStart(4, "0");
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function clampDayOfMonth(
  year: number,
  month: number,
  targetDay: number,
): string {
  const maxDay = getDaysInMonth(year, month);
  const clamped = Math.max(1, Math.min(targetDay, maxDay));
  return formatYmd(year, month, clamped);
}

function addDays(localDate: string, days: number): string {
  const { year, month, day } = parseYmd(localDate);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return formatYmd(
    utc.getUTCFullYear(),
    utc.getUTCMonth() + 1,
    utc.getUTCDate(),
  );
}

function getIsoDayOfWeek(localDate: string): number {
  const { year, month, day } = parseYmd(localDate);
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

function addMonthsClamped(
  year: number,
  month: number,
  monthsToAdd: number,
  targetDay: number,
): string {
  const totalMonths = year * 12 + (month - 1) + monthsToAdd;
  const nextYear = Math.floor(totalMonths / 12);
  const nextMonth = (totalMonths % 12) + 1;
  return clampDayOfMonth(nextYear, nextMonth, targetDay);
}

export function computeInitialNextDueLocalDate(
  config: RecurringScheduleConfig,
  todayLocalDate: string,
): string {
  const { year, month, day } = parseYmd(todayLocalDate);

  switch (config.frequency) {
    case "daily":
      return todayLocalDate;

    case "weekly": {
      const targetDow = config.dayOfWeek ?? getIsoDayOfWeek(todayLocalDate);
      const currentDow = getIsoDayOfWeek(todayLocalDate);
      const diff = (targetDow - currentDow + 7) % 7;
      return addDays(todayLocalDate, diff);
    }

    case "monthly": {
      const targetDay = config.dayOfMonth ?? day;
      const thisMonthDue = clampDayOfMonth(year, month, targetDay);
      if (thisMonthDue >= todayLocalDate) {
        return thisMonthDue;
      }
      return addMonthsClamped(year, month, 1, targetDay);
    }

    case "quarterly": {
      const targetDay = config.dayOfMonth ?? day;
      const thisMonthDue = clampDayOfMonth(year, month, targetDay);
      if (thisMonthDue >= todayLocalDate) {
        return thisMonthDue;
      }
      return addMonthsClamped(year, month, 3, targetDay);
    }

    case "yearly": {
      const targetDay = config.dayOfMonth ?? day;
      const thisYearDue = clampDayOfMonth(year, month, targetDay);
      if (thisYearDue >= todayLocalDate) {
        return thisYearDue;
      }
      return addMonthsClamped(year, month, 12, targetDay);
    }
  }
}

export function advanceNextDueLocalDate(
  config: RecurringScheduleConfig,
  triggeredOnLocalDate: string,
): string {
  const { year, month, day } = parseYmd(triggeredOnLocalDate);

  switch (config.frequency) {
    case "daily":
      return addDays(triggeredOnLocalDate, 1);

    case "weekly":
      return addDays(triggeredOnLocalDate, 7);

    case "monthly":
      return addMonthsClamped(year, month, 1, config.dayOfMonth ?? day);

    case "quarterly":
      return addMonthsClamped(year, month, 3, config.dayOfMonth ?? day);

    case "yearly":
      return addMonthsClamped(year, month, 12, config.dayOfMonth ?? day);
  }
}

export function isRecurringRuleDue(
  state: RecurringRuleDueState,
  currentLocalDate: string,
): boolean {
  if (!state.isActive) {
    return false;
  }
  if (state.lastTriggeredLocalDate === currentLocalDate) {
    return false;
  }
  return currentLocalDate >= state.nextDueLocalDate;
}
