import { describe, expect, it } from "vitest";
import {
  assertValidTimeZone,
  InvalidLocalDateError,
  InvalidTimeZoneError,
  isValidTimeZone,
  localDateTimeToUtc,
  toLocalDate,
  toLocalDateTimeParts,
} from "./timezone.js";

describe("timezone engine (IANA validation, UTC <-> local, DST)", () => {
  it("validates IANA timezone identifiers and rejects invalid ones", () => {
    expect(isValidTimeZone("Europe/Madrid")).toBe(true);
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("Asia/Tokyo")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);

    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(() => assertValidTimeZone("Not/A_Zone")).toThrow(
      InvalidTimeZoneError,
    );
  });

  it("maps the same UTC instant to different local dates across timezones", () => {
    const instant = new Date("2026-03-15T23:30:45.000Z");

    expect(toLocalDate(instant, "Europe/Madrid")).toBe("2026-03-16");
    expect(toLocalDate(instant, "America/New_York")).toBe("2026-03-15");
    expect(toLocalDate(instant, "Asia/Tokyo")).toBe("2026-03-16");
  });

  it("returns exact h23 local datetime parts (never hour 24 at midnight)", () => {
    const instant = new Date("2026-03-15T23:30:45.000Z");

    expect(toLocalDateTimeParts(instant, "Europe/Madrid")).toEqual({
      year: 2026,
      month: 3,
      day: 16,
      hour: 0,
      minute: 30,
      second: 45,
      localDate: "2026-03-16",
    });
  });

  it("converts local date/time to exact UTC across winter, summer, and DST transition days", () => {
    // Winter in Madrid (CET = UTC+1)
    expect(
      localDateTimeToUtc(
        "2026-01-28",
        "09:00:00",
        "Europe/Madrid",
      ).toISOString(),
    ).toBe("2026-01-28T08:00:00.000Z");

    // Summer in Madrid (CEST = UTC+2)
    expect(
      localDateTimeToUtc(
        "2026-07-28",
        "09:00:00",
        "Europe/Madrid",
      ).toISOString(),
    ).toBe("2026-07-28T07:00:00.000Z");

    // Spring-forward DST transition day in Europe/Madrid (2026-03-29)
    expect(
      localDateTimeToUtc(
        "2026-03-29",
        "00:00:00",
        "Europe/Madrid",
      ).toISOString(),
    ).toBe("2026-03-28T23:00:00.000Z");
    expect(
      localDateTimeToUtc(
        "2026-03-29",
        "09:00:00",
        "Europe/Madrid",
      ).toISOString(),
    ).toBe("2026-03-29T07:00:00.000Z");

    // Fall-back DST transition day in Europe/Madrid (2026-10-25)
    expect(
      localDateTimeToUtc(
        "2026-10-25",
        "00:00:00",
        "Europe/Madrid",
      ).toISOString(),
    ).toBe("2026-10-24T22:00:00.000Z");
    expect(
      localDateTimeToUtc(
        "2026-10-25",
        "09:00:00",
        "Europe/Madrid",
      ).toISOString(),
    ).toBe("2026-10-25T08:00:00.000Z");
  });

  it("rejects impossible calendar dates like February 30", () => {
    expect(() =>
      localDateTimeToUtc("2026-02-30", "09:00:00", "Europe/Madrid"),
    ).toThrow(InvalidLocalDateError);
    expect(() => localDateTimeToUtc("2026-13-01", "00:00:00", "UTC")).toThrow(
      InvalidLocalDateError,
    );
    expect(() => localDateTimeToUtc("2026-03-15", "25:00:00", "UTC")).toThrow(
      InvalidLocalDateError,
    );
  });
});
