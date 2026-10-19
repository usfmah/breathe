/**
 * Wire types shared with the Rust backend.
 *
 * Every Rust struct in `src-tauri/src/model.rs` that crosses the IPC boundary is
 * serialised as camelCase, so these names must stay in sync with it.
 */

export type ReminderKind = "eyes" | "movement";

export type ThemePreference = "system" | "light" | "dark";

/** Mirrors `ScheduleState` in Rust. `quit` is only observable while shutting down. */
export type ScheduleState = "running" | "paused" | "snoozed" | "quit";

export const INTERVAL_OPTIONS = [20, 30, 45, 60] as const;
export type IntervalMinutes = (typeof INTERVAL_OPTIONS)[number];

export const DEFAULT_INTERVAL_MINUTES: IntervalMinutes = 45;

export interface Settings {
  intervalMinutes: number;
  eyesEnabled: boolean;
  movementEnabled: boolean;
  snoozeEnabled: boolean;
  theme: ThemePreference;
  startWithSession: boolean;
  /** Whether scheduling should be active after the next launch. */
  startRunning: boolean;
}

export type SettingsPatch = Partial<Settings>;

export interface Snapshot {
  state: ScheduleState;
  /** Orthogonal to `state`: a running timer can be hidden and still fire. */
  windowHidden: boolean;
  intervalMinutes: number;
  remainingMs: number;
  /** 0..1, fraction of the interval still remaining. */
  remainingFraction: number;
  nextKind: ReminderKind | null;
  /** Unix epoch milliseconds of the next reminder, if one is scheduled. */
  nextAtMs: number | null;
  snoozeRemainingMs: number | null;
}

export interface NotificationStatus {
  available: boolean;
  service: string | null;
  vendor: string | null;
  version: string | null;
  specVersion: string | null;
  error: string | null;
}

export interface AutostartStatus {
  enabled: boolean;
  entryPath: string | null;
  /** False on sessions that never read XDG autostart entries. */
  sessionHonorsXdgAutostart: boolean;
  notes: string[];
}

export interface AppInfo {
  name: string;
  version: string;
  description: string;
  tauriVersion: string;
  platform: string;
}

export interface TestNotificationResult {
  delivered: boolean;
  kind: ReminderKind;
  error: string | null;
}
