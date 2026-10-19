import { describe, expect, it } from "vitest";
import {
  describeMainWindow,
  effectiveIntervalMinutes,
  primaryActionLabel,
  remindersDisabled,
} from "./presentation";
import type { Settings, Snapshot } from "./types";

const settings: Settings = {
  intervalMinutes: 45,
  eyesEnabled: true,
  movementEnabled: true,
  snoozeEnabled: true,
  theme: "system",
  startWithSession: false,
  startRunning: true,
};

function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    state: "running",
    windowHidden: false,
    intervalMinutes: 45,
    remainingMs: 32 * 60 * 1000 + 15 * 1000,
    remainingFraction: 32.25 / 45,
    nextKind: "eyes",
    nextAtMs: Date.UTC(2026, 3, 13, 10, 29),
    snoozeRemainingMs: null,
    ...overrides,
  };
}

describe("describeMainWindow", () => {
  it("shows the real time remaining and names the upcoming category", () => {
    const copy = describeMainWindow(settings, snapshot());
    expect(copy.label).toBe("Next eye break in");
    expect(copy.time).toBe("32:15");
    expect(copy.phase).toBe("running");
    expect(copy.muted).toBe(false);
  });

  it("names movement as the next break while alternating", () => {
    const copy = describeMainWindow(settings, snapshot({ nextKind: "movement" }));
    expect(copy.label).toBe("Next movement break in");
  });

  it("falls back to a neutral caption when no category is available", () => {
    const copy = describeMainWindow(settings, snapshot({ nextKind: null }));
    expect(copy.label).toBe("Next break in");
  });

  it("renders the paused state without losing the countdown", () => {
    const copy = describeMainWindow(settings, snapshot({ state: "paused" }));
    expect(copy.phase).toBe("paused");
    expect(copy.label).toBe("Paused");
    expect(copy.time).toBe("32:15");
    expect(copy.muted).toBe(true);
  });

  it("counts down the snooze window and shows the resume time", () => {
    const copy = describeMainWindow(
      settings,
      snapshot({
        state: "snoozed",
        remainingMs: 5 * 60 * 1000,
        snoozeRemainingMs: 4 * 60 * 1000 + 30 * 1000,
      }),
    );
    expect(copy.phase).toBe("snoozed");
    expect(copy.label).toBe("Snoozed");
    expect(copy.time).toBe("04:30");
    expect(copy.support).toMatch(/^Next reminder at /);
  });

  it("hides the countdown when every reminder category is off", () => {
    const copy = describeMainWindow(
      { ...settings, eyesEnabled: false, movementEnabled: false },
      snapshot(),
    );
    expect(copy.phase).toBe("disabled");
    expect(copy.time).toBe("--:--");
    expect(copy.label).toBe("Reminders are off");
    expect(copy.muted).toBe(true);
  });
});

describe("primaryActionLabel", () => {
  it("offers resume from paused and snoozed, otherwise pause", () => {
    expect(primaryActionLabel("running")).toBe("Pause");
    expect(primaryActionLabel("paused")).toBe("Resume");
    expect(primaryActionLabel("snoozed")).toBe("Resume now");
    expect(primaryActionLabel("disabled")).toBe("Pause");
  });
});

describe("remindersDisabled", () => {
  it("is only true when both categories are disabled", () => {
    expect(remindersDisabled(settings)).toBe(false);
    expect(remindersDisabled({ ...settings, eyesEnabled: false })).toBe(false);
    expect(
      remindersDisabled({ ...settings, movementEnabled: false, eyesEnabled: false }),
    ).toBe(true);
  });
});

describe("effectiveIntervalMinutes", () => {
  it("prefers the scheduler's interval over the stored setting", () => {
    expect(effectiveIntervalMinutes(settings, snapshot({ intervalMinutes: 60 }))).toBe(
      60,
    );
  });

  it("falls back to the stored setting when the snapshot has none", () => {
    expect(effectiveIntervalMinutes(settings, snapshot({ intervalMinutes: 0 }))).toBe(
      45,
    );
  });
});
