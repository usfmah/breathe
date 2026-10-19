import type { ReminderKind, ScheduleState } from "./types";

/** Formats a millisecond duration as MM:SS, rounding up so the last second is visible. */
export function formatDuration(ms: number): string {
  const safe = Number.isFinite(ms) ? ms : 0;
  const totalSeconds = Math.max(0, Math.ceil(safe / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** Formats an epoch-millisecond deadline as a short, locale-aware clock time. */
export function formatClockTime(epochMs: number | null): string | null {
  if (epochMs === null || !Number.isFinite(epochMs)) return null;
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(epochMs));
}

export function formatMinutes(minutes: number): string {
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

export function intervalLabel(minutes: number): string {
  return `Every ${formatMinutes(minutes)}`;
}

export function reminderLabel(kind: ReminderKind | null): string {
  switch (kind) {
    case "eyes":
      return "Eye rest";
    case "movement":
      return "Movement";
    default:
      return "None";
  }
}

export function scheduleLabel(state: ScheduleState): string {
  switch (state) {
    case "running":
      return "Running";
    case "paused":
      return "Paused";
    case "snoozed":
      return "Snoozed";
    case "quit":
      return "Quit";
  }
}

/** Clamps a fraction into 0..1; used for the progress ring. */
export function clampFraction(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}
