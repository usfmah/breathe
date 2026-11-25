import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AppInfo,
  AutostartStatus,
  ReminderKind,
  Settings,
  SettingsPatch,
  Snapshot,
  NotificationStatus,
  TestNotificationResult,
  PopupView,
} from "./types";
import { BREAK_MINUTES, SNOOZE_MINUTES } from "./types";

/**
 * All privileged work happens in Rust. The frontend only ever calls these
 * explicitly allow-listed commands in `src-tauri/src/commands.rs`.
 *
 * When the UI is opened in a plain browser (`npm run dev` without Tauri) a small
 * in-memory mock keeps the interface usable for layout work. The mock is never
 * used inside the packaged application.
 */

export const EVENTS = {
  snapshot: "breathe://snapshot",
  settings: "breathe://settings",
  popup: "breathe://popup",
} as const;

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/* -------------------------------------------------------------------------- */
/* Browser-only mock                                                          */
/* -------------------------------------------------------------------------- */

let mockSettings: Settings = {
  intervalMinutes: 45,
  eyesEnabled: true,
  movementEnabled: true,
  snoozeEnabled: true,
  soundEnabled: true,
  // Browser preview only: `?lang=ar` renders the interface in Arabic.
  language:
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("lang") === "ar"
      ? "ar"
      : "en",
  theme: "system",
  startWithSession: false,
  startRunning: true,
};

let mockSnapshot: Snapshot = {
  state: "running",
  windowHidden: false,
  intervalMinutes: 45,
  remainingMs: 45 * 60 * 1000,
  remainingFraction: 1,
  nextKind: "eyes",
  nextAtMs: Date.now() + 45 * 60 * 1000,
  snoozeRemainingMs: null,
  pending: null,
};

function mockRefresh(): Snapshot {
  const total = mockSnapshot.intervalMinutes * 60 * 1000;
  mockSnapshot = {
    ...mockSnapshot,
    remainingFraction:
      total > 0 ? Math.min(1, Math.max(0, mockSnapshot.remainingMs / total)) : 0,
    nextKind:
      mockSettings.eyesEnabled || mockSettings.movementEnabled
        ? mockSettings.eyesEnabled
          ? "eyes"
          : "movement"
        : null,
    nextAtMs:
      mockSnapshot.state === "paused" ? null : Date.now() + mockSnapshot.remainingMs,
  };
  return mockSnapshot;
}

const mockEngine = (() => {
  let started = false;
  let last = Date.now();

  return {
    start(): void {
      if (started) return;
      started = true;
      setInterval(() => {
        const now = Date.now();
        const delta = now - last;
        last = now;
        if (mockSnapshot.state === "paused") return;
        mockSnapshot.remainingMs = Math.max(0, mockSnapshot.remainingMs - delta);
        mockRefresh();
      }, 500);
    },
    resetTo(minutes: number): void {
      mockSnapshot.remainingMs = minutes * 60 * 1000;
      mockRefresh();
    },
    pause(): void {
      mockSnapshot.state = "paused";
      mockRefresh();
    },
    resume(): void {
      mockSnapshot.state = "running";
      if (mockSnapshot.remainingMs <= 0) {
        mockSnapshot.remainingMs = mockSnapshot.intervalMinutes * 60 * 1000;
      }
      mockRefresh();
    },
    snooze(): void {
      mockSnapshot.state = "snoozed";
      mockSnapshot.remainingMs = SNOOZE_MINUTES * 60 * 1000;
      mockSnapshot.snoozeRemainingMs = SNOOZE_MINUTES * 60 * 1000;
      mockSnapshot.pending = null;
      mockRefresh();
    },
    takeBreak(): void {
      if (mockSnapshot.state !== "awaiting") return;
      mockSnapshot.state = "break";
      mockSnapshot.remainingMs = BREAK_MINUTES * 60 * 1000;
      mockRefresh();
    },
  };
})();

async function mockDelay(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 40));
}

/* -------------------------------------------------------------------------- */
/* Commands                                                                   */
/* -------------------------------------------------------------------------- */

export async function getSettings(): Promise<Settings> {
  if (!isTauri()) return { ...mockSettings };
  return invoke<Settings>("get_settings");
}

export async function saveSettings(patch: SettingsPatch): Promise<Settings> {
  if (!isTauri()) {
    const intervalChanged =
      patch.intervalMinutes !== undefined &&
      patch.intervalMinutes !== mockSettings.intervalMinutes;
    mockSettings = { ...mockSettings, ...patch };
    mockSnapshot.intervalMinutes = mockSettings.intervalMinutes;
    if (intervalChanged) mockEngine.resetTo(mockSettings.intervalMinutes);
    return { ...mockSettings };
  }
  return invoke<Settings>("save_settings", { patch });
}

export async function getSnapshot(): Promise<Snapshot> {
  if (!isTauri()) return { ...mockSnapshot };
  return invoke<Snapshot>("get_snapshot");
}

export async function pauseReminders(): Promise<Snapshot> {
  if (!isTauri()) {
    mockEngine.pause();
    return { ...mockSnapshot };
  }
  return invoke<Snapshot>("pause_reminders");
}

export async function resumeReminders(): Promise<Snapshot> {
  if (!isTauri()) {
    mockEngine.resume();
    return { ...mockSnapshot };
  }
  return invoke<Snapshot>("resume_reminders");
}

/**
 * Snoozes. Pass the id of a waiting reminder to snooze only that reminder (a
 * stale id is ignored by Rust); omit it to snooze the current countdown.
 */
export async function snoozeReminders(reminderId?: number): Promise<Snapshot> {
  if (!isTauri()) {
    mockEngine.snooze();
    return { ...mockSnapshot };
  }
  return invoke<Snapshot>("snooze_reminders", { reminderId: reminderId ?? null });
}

/** What the popup should render right now (null when hidden). */
export async function getPopup(): Promise<PopupView | null> {
  if (!isTauri()) return mockPopup;
  return invoke<PopupView | null>("get_popup");
}

/** Hides the popup identified by `seq`. Does not answer a reminder. */
export async function dismissPopup(seq: number): Promise<void> {
  if (!isTauri()) {
    mockPopup = null;
    return;
  }
  await invoke("dismiss_popup", { seq });
}

/** Fits the popup window to its card's height in CSS (logical) pixels. */
export async function resizePopup(height: number): Promise<void> {
  if (!isTauri()) return;
  await invoke("resize_popup", { height });
}

/**
 * Browser preview: `?window=popup&popup=reminder|breakOver|test` renders the
 * popup with sample content for layout work.
 */
let mockPopup: PopupView | null = (() => {
  if (typeof window === "undefined") return null;
  const type = new URLSearchParams(window.location.search).get("popup");
  switch (type) {
    case "breakOver":
      return { seq: 1, content: { type: "breakOver", kind: "eyes" } };
    case "test":
      return { seq: 1, content: { type: "test", kind: "eyes" } };
    case "reminder":
      return {
        seq: 1,
        content: { type: "reminder", reminder: { id: 1, kind: "movement" } },
      };
    default:
      return null;
  }
})();

/** Takes the break for the waiting reminder. A stale id is ignored by Rust. */
export async function takeBreak(reminderId: number): Promise<Snapshot> {
  if (!isTauri()) {
    mockEngine.takeBreak();
    return { ...mockSnapshot };
  }
  return invoke<Snapshot>("take_break", { reminderId });
}

export async function sendTestNotification(
  kind: ReminderKind | null,
): Promise<TestNotificationResult> {
  if (!isTauri()) {
    await mockDelay();
    return {
      delivered: false,
      kind: kind ?? "eyes",
      error: "Notifications are unavailable in the browser preview.",
    };
  }
  return invoke<TestNotificationResult>("send_test_notification", { kind });
}

export async function getNotificationStatus(): Promise<NotificationStatus> {
  if (!isTauri()) {
    return {
      available: false,
      service: null,
      vendor: null,
      version: null,
      specVersion: null,
      error: "Running outside the desktop shell.",
    };
  }
  return invoke<NotificationStatus>("get_notification_status");
}

export async function getAutostartStatus(): Promise<AutostartStatus> {
  if (!isTauri()) {
    return {
      enabled: mockSettings.startWithSession,
      mechanism: "Browser preview",
      entryPath: null,
      sessionReadsStartupEntry: false,
      notes: ["Autostart is only available inside the desktop application."],
    };
  }
  return invoke<AutostartStatus>("get_autostart_status");
}

export async function setAutostart(enabled: boolean): Promise<AutostartStatus> {
  if (!isTauri()) {
    mockSettings = { ...mockSettings, startWithSession: enabled };
    return {
      enabled,
      mechanism: "Browser preview",
      entryPath: null,
      sessionReadsStartupEntry: false,
      notes: ["Autostart is only available inside the desktop application."],
    };
  }
  return invoke<AutostartStatus>("set_autostart", { enabled });
}

export async function getAppInfo(): Promise<AppInfo> {
  if (!isTauri()) {
    return {
      name: "Breathe",
      version: "0.1.0",
      description:
        "A calm, minimal desktop app that reminds you to move and rest your eyes.",
      tauriVersion: "2",
      platform: "browser preview",
    };
  }
  return invoke<AppInfo>("get_app_info");
}

export async function hideWindow(): Promise<void> {
  if (!isTauri()) return;
  await invoke("hide_window");
}

export async function minimizeWindow(): Promise<void> {
  if (!isTauri()) return;
  await invoke("minimize_window");
}

export async function openSettings(): Promise<void> {
  if (!isTauri()) {
    window.open(window.location.href, "_blank", "width=780,height=600");
    return;
  }
  await invoke("open_settings");
}

export async function quitApp(): Promise<void> {
  if (!isTauri()) return;
  await invoke("quit_app");
}

/* -------------------------------------------------------------------------- */
/* Events                                                                     */
/* -------------------------------------------------------------------------- */

export function onSnapshot(handler: (snapshot: Snapshot) => void): UnlistenFn {
  if (!isTauri()) {
    mockEngine.start();
    const id = setInterval(() => handler({ ...mockSnapshot }), 500);
    return () => clearInterval(id);
  }
  let disposed = false;
  let unlisten: UnlistenFn | null = null;
  void listen<Snapshot>(EVENTS.snapshot, (event) => handler(event.payload)).then(
    (fn) => {
      if (disposed) fn();
      else unlisten = fn;
    },
  );
  return () => {
    disposed = true;
    unlisten?.();
  };
}

export function onSettings(handler: (settings: Settings) => void): UnlistenFn {
  if (!isTauri()) return () => undefined;
  let disposed = false;
  let unlisten: UnlistenFn | null = null;
  void listen<Settings>(EVENTS.settings, (event) => handler(event.payload)).then(
    (fn) => {
      if (disposed) fn();
      else unlisten = fn;
    },
  );
  return () => {
    disposed = true;
    unlisten?.();
  };
}

/** Popup content pushed from Rust; `null` means the popup was hidden. */
export function onPopup(handler: (view: PopupView | null) => void): UnlistenFn {
  if (!isTauri()) return () => undefined;
  let disposed = false;
  let unlisten: UnlistenFn | null = null;
  void listen<PopupView | null>(EVENTS.popup, (event) => handler(event.payload)).then(
    (fn) => {
      if (disposed) fn();
      else unlisten = fn;
    },
  );
  return () => {
    disposed = true;
    unlisten?.();
  };
}
