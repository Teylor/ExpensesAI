export interface LocalDateTimeParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly localDate: string;
}

export class InvalidTimeZoneError extends Error {
  readonly timeZone: string;

  constructor(timeZone: string) {
    super(`Invalid IANA timezone: "${timeZone}"`);
    this.name = "InvalidTimeZoneError";
    this.timeZone = timeZone;
  }
}

export class InvalidLocalDateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidLocalDateError";
  }
}

export const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_TIME_PATTERN = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getDateTimeFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) {
    return cached;
  }
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
}

export function isValidTimeZone(timeZone: string): boolean {
  const trimmed = timeZone.trim();
  if (!trimmed) {
    return false;
  }
  try {
    getDateTimeFormatter(trimmed);
    return true;
  } catch {
    return false;
  }
}

export function assertValidTimeZone(timeZone: string): string {
  const trimmed = timeZone.trim();
  if (!isValidTimeZone(trimmed)) {
    throw new InvalidTimeZoneError(timeZone);
  }
  return trimmed;
}

export function parseLocalDateParts(localDate: string): {
  year: number;
  month: number;
  day: number;
} {
  const match = LOCAL_DATE_PATTERN.exec(localDate.trim());
  if (!match) {
    throw new InvalidLocalDateError(
      `Invalid local date format (expected YYYY-MM-DD): "${localDate}"`,
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() + 1 !== month ||
    probe.getUTCDate() !== day
  ) {
    throw new InvalidLocalDateError(
      `Non-existent calendar date: "${localDate}"`,
    );
  }

  return { year, month, day };
}

function parseLocalTimeParts(localTime: string): {
  hour: number;
  minute: number;
  second: number;
} {
  const match = LOCAL_TIME_PATTERN.exec(localTime.trim());
  if (!match) {
    throw new InvalidLocalDateError(
      `Invalid local time format (expected HH:MM or HH:MM:SS): "${localTime}"`,
    );
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] !== undefined ? Number(match[3]) : 0;

  if (hour > 23 || minute > 59 || second > 59) {
    throw new InvalidLocalDateError(`Out-of-range local time: "${localTime}"`);
  }

  return { hour, minute, second };
}

export function formatLocalDateParts(
  year: number,
  month: number,
  day: number,
): string {
  const yyyy = String(year).padStart(4, "0");
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function toLocalDateTimeParts(
  utcDate: Date,
  timeZone: string,
): LocalDateTimeParts {
  const validTz = assertValidTimeZone(timeZone);
  if (Number.isNaN(utcDate.getTime())) {
    throw new InvalidLocalDateError("Invalid Date instance");
  }

  const parts = getDateTimeFormatter(validTz).formatToParts(utcDate);
  let year = 0;
  let month = 0;
  let day = 0;
  let hour = 0;
  let minute = 0;
  let second = 0;

  for (const part of parts) {
    switch (part.type) {
      case "year":
        year = Number(part.value);
        break;
      case "month":
        month = Number(part.value);
        break;
      case "day":
        day = Number(part.value);
        break;
      case "hour":
        hour = Number(part.value) % 24;
        break;
      case "minute":
        minute = Number(part.value);
        break;
      case "second":
        second = Number(part.value);
        break;
    }
  }

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    localDate: formatLocalDateParts(year, month, day),
  };
}

export function toLocalDate(utcDate: Date, timeZone: string): string {
  return toLocalDateTimeParts(utcDate, timeZone).localDate;
}

function getTimeZoneOffsetMs(utcDate: Date, timeZone: string): number {
  const local = toLocalDateTimeParts(utcDate, timeZone);
  const asUtcMs = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second,
  );
  return asUtcMs - Math.floor(utcDate.getTime() / 1000) * 1000;
}

export function localDateTimeToUtc(
  localDate: string,
  localTime: string,
  timeZone: string,
): Date {
  const validTz = assertValidTimeZone(timeZone);
  const { year, month, day } = parseLocalDateParts(localDate);
  const { hour, minute, second } = parseLocalTimeParts(localTime);

  const wallClockAsUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);

  // Two-pass fixed-point offset resolution to handle DST transitions accurately.
  const firstGuess = new Date(wallClockAsUtcMs);
  const offset1 = getTimeZoneOffsetMs(firstGuess, validTz);
  const secondGuess = new Date(wallClockAsUtcMs - offset1);
  const offset2 = getTimeZoneOffsetMs(secondGuess, validTz);

  return new Date(wallClockAsUtcMs - offset2);
}
