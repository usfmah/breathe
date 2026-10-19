import type { ReminderKind, Settings, Snapshot } from "./types";
import { formatClockTime, formatDuration } from "./format";

export type Phase = "running" | "paused" | "snoozed" | "disabled";

export interface MainWindowCopy {
  /** Caption shown above the countdown inside the ring. */
  label: string;
  /** Already-formatted MM:SS (or `--:--` when reminders are off). */
  time: string;
  /** Two short lines of supporting copy under the ring. */
  support: string;
  phase: Phase;
  /** Whether the ring should be dimmed. */
  muted: boolean;
}

export function remindersDisabled(settings: Settings): boolean {
  return !settings.eyesEnabled && !settings.movementEnabled;
}

/**
 * Maps the authoritative scheduler snapshot onto what the main window shows.
 *
 * Kept as a pure function (no React, no IPC) so the state-to-copy mapping is
 * unit-testable and the component stays declarative.
 */
export function describeMainWindow(
  settings: Settings,
  snapshot: Snapshot,
): MainWindowCopy {
  if (remindersDisabled(settings)) {
    return {
      label: "Reminders are off",
      time: "--:--",
      support: "Turn on eye rest or movement reminders in Settings.",
      phase: "disabled",
      muted: true,
    };
  }

  if (snapshot.state === "paused") {
    return {
      label: "Paused",
      time: formatDuration(snapshot.remainingMs),
      support: "Reminders are paused. You can resume them anytime.",
      phase: "paused",
      muted: true,
    };
  }

  if (snapshot.state === "snoozed") {
    return {
      label: "Snoozed",
      time: formatDuration(snapshot.snoozeRemainingMs ?? snapshot.remainingMs),
      support: snoozeSupport(snapshot.nextAtMs),
      phase: "snoozed",
      muted: true,
    };
  }

  return {
    label: runningLabel(snapshot.nextKind),
    time: formatDuration(snapshot.remainingMs),
    support: "A short break now helps you focus better later.",
    phase: "running",
    muted: false,
  };
}

function runningLabel(kind: ReminderKind | null): string {
  switch (kind) {
    case "movement":
      return "Next movement break in";
    case "eyes":
      return "Next eye break in";
    default:
      return "Next break in";
  }
}

function snoozeSupport(nextAtMs: number | null): string {
  const at = formatClockTime(nextAtMs);
  return at ? `Next reminder at ${at}.` : "The next reminder is scheduled shortly.";
}

/** Label for the single primary action in the main window. */
export function primaryActionLabel(phase: Phase): string {
  switch (phase) {
    case "snoozed":
      return "Resume now";
    case "paused":
      return "Resume";
    default:
      return "Pause";
  }
}

/**
 * `intervalMinutes` is stored in settings but must be read back from the
 * snapshot, which is what the scheduler actually runs on.
 */
export function effectiveIntervalMinutes(
  settings: Settings,
  snapshot: Snapshot,
): number {
  return snapshot.intervalMinutes || settings.intervalMinutes;
}
