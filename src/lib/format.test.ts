import { describe, expect, it } from "vitest";
import {
  clampFraction,
  formatClockTime,
  formatDuration,
  formatMinutes,
  intervalLabel,
  reminderLabel,
  scheduleLabel,
} from "./format";

describe("formatDuration", () => {
  it("formats whole minutes as MM:SS", () => {
    expect(formatDuration(45 * 60 * 1000)).toBe("45:00");
    expect(formatDuration(20 * 60 * 1000)).toBe("20:00");
    expect(formatDuration(0)).toBe("00:00");
  });

  it("rounds up so the final second is still visible", () => {
    expect(formatDuration(1)).toBe("00:01");
    expect(formatDuration(999)).toBe("00:01");
    expect(formatDuration(1000)).toBe("00:01");
    expect(formatDuration(1001)).toBe("00:02");
  });

  it("never renders a negative or invalid countdown", () => {
    expect(formatDuration(-5000)).toBe("00:00");
    expect(formatDuration(Number.NaN)).toBe("00:00");
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe("00:00");
  });

  it("does not roll over past 60 minutes", () => {
    expect(formatDuration(90 * 60 * 1000)).toBe("90:00");
  });
});

describe("formatMinutes / intervalLabel", () => {
  it("uses a singular noun only for one minute", () => {
    expect(formatMinutes(1)).toBe("1 minute");
    expect(formatMinutes(45)).toBe("45 minutes");
  });

  it("labels the interval options used in the picker", () => {
    expect(intervalLabel(20)).toBe("Every 20 minutes");
    expect(intervalLabel(60)).toBe("Every 60 minutes");
  });
});

describe("formatClockTime", () => {
  it("returns null for an absent deadline", () => {
    expect(formatClockTime(null)).toBeNull();
    expect(formatClockTime(Number.NaN)).toBeNull();
  });

  it("formats a real deadline", () => {
    const formatted = formatClockTime(Date.UTC(2026, 3, 13, 10, 29));
    expect(formatted).toBeTruthy();
    expect(formatted).toMatch(/\d/);
  });
});

describe("labels", () => {
  it("names reminder categories", () => {
    expect(reminderLabel("eyes")).toBe("Eye rest");
    expect(reminderLabel("movement")).toBe("Movement");
    expect(reminderLabel(null)).toBe("None");
  });

  it("covers every schedule state", () => {
    expect(scheduleLabel("running")).toBe("Running");
    expect(scheduleLabel("paused")).toBe("Paused");
    expect(scheduleLabel("snoozed")).toBe("Snoozed");
    expect(scheduleLabel("quit")).toBe("Quit");
  });
});

describe("clampFraction", () => {
  it("clamps into 0..1 and handles junk input", () => {
    expect(clampFraction(-1)).toBe(0);
    expect(clampFraction(0.5)).toBe(0.5);
    expect(clampFraction(2)).toBe(1);
    expect(clampFraction(Number.NaN)).toBe(0);
  });
});
