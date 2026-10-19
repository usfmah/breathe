import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getAppInfo,
  getAutostartStatus,
  getNotificationStatus,
  getSettings,
  getSnapshot,
  hideWindow,
  isTauri,
  minimizeWindow,
  onSettings,
  onSnapshot,
  openSettings,
  pauseReminders,
  quitApp,
  resumeReminders,
  saveSettings,
  sendTestNotification,
  setAutostart,
  snoozeReminders,
} from "@/lib/ipc";
import { applyTheme, resolveTheme, systemPrefersDark, watchSystemTheme } from "@/lib/theme";
import type {
  AppInfo,
  AutostartStatus,
  NotificationStatus,
  Settings,
  SettingsPatch,
  Snapshot,
  TestNotificationResult,
} from "@/lib/types";

export interface BreatheController {
  /** Resolved Tauri window label, or null until it has been read. */
  windowLabel: string | null;
  ready: boolean;
  settings: Settings | null;
  snapshot: Snapshot | null;
  notificationStatus: NotificationStatus | null;
  autostartStatus: AutostartStatus | null;
  appInfo: AppInfo | null;
  autostartBusy: boolean;
  testing: boolean;
  testResult: TestNotificationResult | null;
  lastError: string | null;
  clearError: () => void;
  update: (patch: SettingsPatch) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  snooze: () => Promise<void>;
  openSettings: () => Promise<void>;
  hide: () => Promise<void>;
  minimize: () => Promise<void>;
  quit: () => Promise<void>;
  sendTest: () => Promise<void>;
  toggleAutostart: (enabled: boolean) => Promise<void>;
}

/**
 * Single source of truth for both windows.
 *
 * Nothing here schedules anything: the Rust scheduler owns the clock and pushes
 * `breathe://snapshot` events. This hook only mirrors that state into React and
 * forwards user intent back over IPC, which is what keeps notifications from
 * being duplicated by re-renders.
 */
export function useBreathe(): BreatheController {
  const [windowLabel, setWindowLabel] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [notificationStatus, setNotificationStatus] =
    useState<NotificationStatus | null>(null);
  const [autostartStatus, setAutostartStatus] = useState<AutostartStatus | null>(
    null,
  );
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [autostartBusy, setAutostartBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestNotificationResult | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const mounted = useRef(true);

  const fail = useCallback((error: unknown) => {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Something went wrong.";
    console.error("[breathe]", message);
    if (mounted.current) setLastError(message);
  }, []);

  /* ---------------------------------------------------------------- boot --- */

  useEffect(() => {
    mounted.current = true;

    void (async () => {
      const label = await import("@tauri-apps/api/window")
        .then((mod) =>
          isTauri() ? mod.getCurrentWindow().label : "main",
        )
        .catch(() => "main");
      if (mounted.current) setWindowLabel(label);
    })();

    void (async () => {
      try {
        const [nextSettings, nextSnapshot] = await Promise.all([
          getSettings(),
          getSnapshot(),
        ]);
        if (!mounted.current) return;
        setSettings(nextSettings);
        setSnapshot(nextSnapshot);
      } catch (error) {
        fail(error);
      }
    })();

    void (async () => {
      try {
        const [notifications, autostart, info] = await Promise.all([
          getNotificationStatus(),
          getAutostartStatus(),
          getAppInfo(),
        ]);
        if (!mounted.current) return;
        setNotificationStatus(notifications);
        setAutostartStatus(autostart);
        setAppInfo(info);
      } catch (error) {
        fail(error);
      }
    })();

    return () => {
      mounted.current = false;
    };
  }, [fail]);

  /* -------------------------------------------------------------- events --- */

  useEffect(() => {
    const offSnapshot = onSnapshot((next) => setSnapshot(next));
    const offSettings = onSettings((next) => setSettings(next));
    return () => {
      offSnapshot();
      offSettings();
    };
  }, []);

  /* --------------------------------------------------------------- theme --- */

  const theme = settings?.theme;

  useEffect(() => {
    if (!theme) return;

    const apply = () => {
      applyTheme(resolveTheme(theme, systemPrefersDark()), theme);
    };
    apply();

    if (theme !== "system") return;
    return watchSystemTheme(() => apply());
  }, [theme]);

  /* ------------------------------------------------------------- actions --- */

  const refreshSnapshot = useCallback(async () => {
    try {
      const next = await getSnapshot();
      if (mounted.current) setSnapshot(next);
    } catch (error) {
      fail(error);
    }
  }, [fail]);

  const update = useCallback(
    async (patch: SettingsPatch) => {
      try {
        const next = await saveSettings(patch);
        if (mounted.current) setSettings(next);
        if (patch.intervalMinutes !== undefined || patch.startRunning !== undefined) {
          await refreshSnapshot();
        }
      } catch (error) {
        fail(error);
      }
    },
    [fail, refreshSnapshot],
  );

  const pause = useCallback(async () => {
    try {
      if (mounted.current) setSnapshot(await pauseReminders());
    } catch (error) {
      fail(error);
    }
  }, [fail]);

  const resume = useCallback(async () => {
    try {
      if (mounted.current) setSnapshot(await resumeReminders());
    } catch (error) {
      fail(error);
    }
  }, [fail]);

  const snooze = useCallback(async () => {
    try {
      if (mounted.current) setSnapshot(await snoozeReminders());
    } catch (error) {
      fail(error);
    }
  }, [fail]);

  const handleOpenSettings = useCallback(async () => {
    try {
      await openSettings();
    } catch (error) {
      fail(error);
    }
  }, [fail]);

  const hide = useCallback(async () => {
    try {
      await hideWindow();
    } catch (error) {
      fail(error);
    }
  }, [fail]);

  const minimize = useCallback(async () => {
    try {
      await minimizeWindow();
    } catch (error) {
      fail(error);
    }
  }, [fail]);

  const quit = useCallback(async () => {
    try {
      await quitApp();
    } catch (error) {
      fail(error);
    }
  }, [fail]);

  const sendTest = useCallback(async () => {
    setTesting(true);
    try {
      const kind = snapshot?.nextKind ?? "eyes";
      const result = await sendTestNotification(kind);
      if (mounted.current) {
        setTestResult(result);
        if (!result.delivered && result.error) setLastError(result.error);
      }
    } catch (error) {
      fail(error);
    } finally {
      if (mounted.current) setTesting(false);
    }
  }, [fail, snapshot?.nextKind]);

  const toggleAutostart = useCallback(async (enabled: boolean) => {
    setAutostartBusy(true);
    try {
      const status = await setAutostart(enabled);
      if (mounted.current) {
        setAutostartStatus(status);
        setSettings((current) =>
          current ? { ...current, startWithSession: status.enabled } : current,
        );
      }
    } catch (error) {
      fail(error);
    } finally {
      if (mounted.current) setAutostartBusy(false);
    }
  }, [fail]);

  const clearError = useCallback(() => setLastError(null), []);

  return useMemo(
    () => ({
      windowLabel,
      ready: settings !== null && snapshot !== null && windowLabel !== null,
      settings,
      snapshot,
      notificationStatus,
      autostartStatus,
      appInfo,
      autostartBusy,
      testing,
      testResult,
      lastError,
      clearError,
      update,
      pause,
      resume,
      snooze,
      openSettings: handleOpenSettings,
      hide,
      minimize,
      quit,
      sendTest,
      toggleAutostart,
    }),
    [
      windowLabel,
      settings,
      snapshot,
      notificationStatus,
      autostartStatus,
      appInfo,
      autostartBusy,
      testing,
      testResult,
      lastError,
      clearError,
      update,
      pause,
      resume,
      snooze,
      handleOpenSettings,
      hide,
      minimize,
      quit,
      sendTest,
      toggleAutostart,
    ],
  );
}
