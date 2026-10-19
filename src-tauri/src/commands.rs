//! The complete IPC surface exposed to the webview.
//!
//! Everything privileged lives behind these commands: the frontend cannot touch
//! the filesystem, spawn processes, or talk to D-Bus directly. The capability
//! file grants the webview nothing beyond the default core surface and window
//! dragging, so this list *is* the security boundary.

use tauri::{
    AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

use crate::model::{
    AppInfo, AutostartStatus, NotificationStatus, ReminderKind, ScheduleState, Settings,
    SettingsPatch, Snapshot, TestNotificationResult, EVENT_SETTINGS, EVENT_SNAPSHOT,
};
use crate::scheduler::SchedulerConfig;
use crate::theme::{self, MAIN_WINDOW, SETTINGS_WINDOW};
use crate::{autostart, notify, settings_store, AppState};

/// The settings dialog is a fixed-size panel; see `open_settings_window`.
const SETTINGS_WIDTH: f64 = 780.0;
const SETTINGS_HEIGHT: f64 = 600.0;

/* -------------------------------------------------------------------------- */
/* Queries                                                                    */
/* -------------------------------------------------------------------------- */

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Settings {
    state.current_settings()
}

#[tauri::command]
pub fn get_snapshot(state: State<'_, AppState>) -> Snapshot {
    state.snapshot()
}

#[tauri::command]
pub fn get_notification_status() -> NotificationStatus {
    notify::status()
}

#[tauri::command]
pub fn get_autostart_status(app: AppHandle) -> AutostartStatus {
    autostart::status(&app)
}

#[tauri::command]
pub fn get_app_info(app: AppHandle) -> AppInfo {
    let config = app.config();
    AppInfo {
        name: config
            .product_name
            .clone()
            .unwrap_or_else(|| "Breathe".to_string()),
        version: app.package_info().version.to_string(),
        description: config
            .bundle
            .short_description
            .clone()
            .unwrap_or_else(|| {
                "A calm, minimal desktop companion that reminds you to take short breaks."
                    .to_string()
            }),
        tauri_version: tauri::VERSION.to_string(),
        platform: format!(
            "{} · {} · {}",
            std::env::consts::OS,
            env_or("XDG_SESSION_TYPE", "unknown session"),
            env_or("XDG_CURRENT_DESKTOP", "unknown desktop"),
        ),
    }
}

fn env_or(key: &str, fallback: &str) -> String {
    std::env::var(key)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| fallback.to_string())
}

/* -------------------------------------------------------------------------- */
/* Mutations                                                                  */
/* -------------------------------------------------------------------------- */

#[tauri::command]
pub fn save_settings(app: AppHandle, patch: SettingsPatch) -> Result<Settings, String> {
    let state = app.state::<AppState>();
    let base = state.current_settings();
    let next = patch.clone().apply(base)?;

    // The autostart entry is a real side effect, so it is attempted before
    // anything is persisted: a failure leaves the stored settings untouched.
    if let Some(enabled) = patch.start_with_session() {
        autostart::set(&app, enabled)?;
    }

    settings_store::save(&app, &next)?;

    {
        let mut settings = state.settings.lock().map_err(lock_error)?;
        *settings = next.clone();
    }

    {
        let mut scheduler = state.scheduler.lock().map_err(lock_error)?;
        scheduler.set_config(SchedulerConfig::from(&next));
        if let Some(running) = patch.start_running() {
            scheduler.set_running(running);
        }
    }

    if patch.appearance_changed() {
        theme::apply(&app, next.theme);
    }

    let _ = app.emit(EVENT_SETTINGS, next.clone());
    emit_snapshot(&app);

    Ok(next)
}

#[tauri::command]
pub fn pause_reminders(app: AppHandle) -> Result<Snapshot, String> {
    apply_running(&app, false)?;
    Ok(app.state::<AppState>().snapshot())
}

#[tauri::command]
pub fn resume_reminders(app: AppHandle) -> Result<Snapshot, String> {
    apply_running(&app, true)?;
    Ok(app.state::<AppState>().snapshot())
}

#[tauri::command]
pub fn snooze_reminders(app: AppHandle) -> Result<Snapshot, String> {
    snooze(&app)?;
    Ok(app.state::<AppState>().snapshot())
}

#[tauri::command]
pub fn send_test_notification(
    app: AppHandle,
    kind: Option<ReminderKind>,
) -> TestNotificationResult {
    let resolved = kind
        .or_else(|| app.state::<AppState>().snapshot().next_kind)
        .unwrap_or(ReminderKind::Eyes);

    match notify::deliver(&app, resolved) {
        Ok(()) => TestNotificationResult {
            delivered: true,
            kind: resolved,
            error: None,
        },
        Err(error) => {
            eprintln!("[breathe] test notification failed: {error}");
            TestNotificationResult {
                delivered: false,
                kind: resolved,
                error: Some(error),
            }
        }
    }
}

#[tauri::command]
pub fn set_autostart(app: AppHandle, enabled: bool) -> Result<AutostartStatus, String> {
    let status = autostart::set(&app, enabled)?;
    let state = app.state::<AppState>();

    let updated = {
        let mut settings = state.settings.lock().map_err(lock_error)?;
        if settings.start_with_session == status.enabled {
            None
        } else {
            settings.start_with_session = status.enabled;
            Some(settings.clone())
        }
    };

    if let Some(settings) = updated {
        settings_store::save(&app, &settings)?;
        let _ = app.emit(EVENT_SETTINGS, settings);
    }

    Ok(status)
}

/* -------------------------------------------------------------------------- */
/* Window lifecycle                                                           */
/* -------------------------------------------------------------------------- */

/// Hides the window that invoked the command. Closing the main window must never
/// terminate the process — the scheduler keeps running behind the scenes.
#[tauri::command]
pub fn hide_window(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    let is_main = window.label() == MAIN_WINDOW;
    if is_main {
        app.state::<AppState>().set_hidden(true);
    }

    window
        .hide()
        .map_err(|error| format!("could not hide the window: {error}"))?;

    if is_main {
        emit_snapshot(&app);
    }

    Ok(())
}

#[tauri::command]
pub fn minimize_window(window: WebviewWindow) -> Result<(), String> {
    window
        .minimize()
        .map_err(|error| format!("could not minimize the window: {error}"))
}

#[tauri::command]
pub fn open_settings(app: AppHandle) -> Result<(), String> {
    open_settings_window(&app)
}

/// Stops the scheduler and terminates. This is the only path that ends the
/// process apart from a signal.
#[tauri::command]
pub fn quit_app(app: AppHandle) {
    quit(&app);
}

/* -------------------------------------------------------------------------- */
/* Helpers callable from the tray and the worker                              */
/* -------------------------------------------------------------------------- */

pub fn emit_snapshot(app: &AppHandle) {
    let snapshot = app.state::<AppState>().snapshot();
    sync_tray(app, &snapshot);
    let _ = app.emit(EVENT_SNAPSHOT, snapshot);
}

pub fn show_main_window(app: &AppHandle) {
    let state = app.state::<AppState>();
    state.set_hidden(false);

    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }

    emit_snapshot(app);
}

pub fn open_settings_window(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(SETTINGS_WINDOW) {
        window
            .show()
            .map_err(|error| format!("could not show the settings window: {error}"))?;
        let _ = window.set_focus();
        return Ok(());
    }

    let preference = app.state::<AppState>().current_settings().theme;

    let window = WebviewWindowBuilder::new(
        app,
        SETTINGS_WINDOW,
        WebviewUrl::App("index.html".into()),
    )
    .title("Breathe Settings")
    // Fixed size: the dialog has one layout, and pinning min == max is what
    // makes tiling compositors (niri) float it instead of stretching it into a
    // column. The window is created hidden and shown below, because a size
    // requested while the surface is already mapped is not honoured.
    .inner_size(SETTINGS_WIDTH, SETTINGS_HEIGHT)
    .min_inner_size(SETTINGS_WIDTH, SETTINGS_HEIGHT)
    .max_inner_size(SETTINGS_WIDTH, SETTINGS_HEIGHT)
    .resizable(false)
    .maximizable(false)
    .decorations(false)
    .visible(false)
    .background_color(theme::initial_background(preference))
    .build()
    .map_err(|error| format!("could not create the settings window: {error}"))?;

    let _ = window.set_theme(theme::tauri_theme(preference));
    attach_close_behaviour(&window);

    let _ = window.set_size(tauri::LogicalSize::new(
        SETTINGS_WIDTH,
        SETTINGS_HEIGHT,
    ));
    let _ = window.center();
    let _ = window.show();
    let _ = window.set_focus();

    Ok(())
}

/// Closing either window hides it; only Quit ends the process.
pub fn attach_close_behaviour(window: &WebviewWindow) {
    let handle = window.clone();

    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();

            if handle.label() == MAIN_WINDOW {
                if let Some(state) = handle.try_state::<AppState>() {
                    state.set_hidden(true);
                }
            }

            let _ = handle.hide();
        }
    });
}

/// Tray action: flip between running and paused.
pub fn toggle_scheduling(app: &AppHandle) {
    let running = {
        let state = app.state::<AppState>();
        let is_running = match state.scheduler.lock() {
            Ok(scheduler) => scheduler.state() == ScheduleState::Running,
            Err(poisoned) => poisoned.into_inner().state() == ScheduleState::Running,
        };
        is_running
    };

    if let Err(error) = apply_running(app, !running) {
        eprintln!("[breathe] could not change the schedule: {error}");
    }
}

pub fn snooze_from_tray(app: &AppHandle) {
    if let Err(error) = snooze(app) {
        eprintln!("[breathe] snooze refused: {error}");
    }
}

pub fn quit(app: &AppHandle) {
    let state = app.state::<AppState>();
    if let Ok(mut scheduler) = state.scheduler.lock() {
        scheduler.stop();
    }
    state.stop_worker();
    app.exit(0);
}

/* -------------------------------------------------------------------------- */
/* Internals                                                                  */
/* -------------------------------------------------------------------------- */

fn snooze(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    {
        let mut scheduler = state.scheduler.lock().map_err(lock_error)?;
        scheduler.snooze()?;
    }
    emit_snapshot(app);
    Ok(())
}

/// Applies a running/paused change and persists the preference. The countdown
/// itself is never persisted.
fn apply_running(app: &AppHandle, running: bool) -> Result<(), String> {
    let state = app.state::<AppState>();

    {
        let mut scheduler = state.scheduler.lock().map_err(lock_error)?;
        scheduler.set_running(running);
    }

    let updated = {
        let mut settings = state.settings.lock().map_err(lock_error)?;
        settings.start_running = running;
        settings.clone()
    };

    settings_store::save(app, &updated)?;
    let _ = app.emit(EVENT_SETTINGS, updated);
    emit_snapshot(app);

    Ok(())
}

fn sync_tray(app: &AppHandle, snapshot: &Snapshot) {
    let state = app.state::<AppState>();
    let settings = state.current_settings();

    let Ok(handles) = state.tray.lock() else {
        return;
    };
    let Some(handles) = handles.as_ref() else {
        return;
    };

    let tooltip = tooltip_for(snapshot);
    let tooltip_changed = handles.sync(
        snapshot.state,
        settings.snooze_enabled,
        settings.eyes_enabled || settings.movement_enabled,
        &tooltip,
    );

    if tooltip_changed {
        if let Some(icon) = app.tray_by_id(crate::tray::TRAY_ID) {
            let _ = icon.set_tooltip(Some(tooltip));
        }
    }
}

fn tooltip_for(snapshot: &Snapshot) -> String {
    let seconds = snapshot.remaining_ms.div_euclid(1000).max(0);
    let minutes = seconds / 60;
    let seconds = seconds % 60;

    if snapshot.next_kind.is_none() && snapshot.state == ScheduleState::Running {
        return "Breathe — reminders are turned off".to_string();
    }

    match snapshot.state {
        ScheduleState::Running => format!("Breathe — next break in {minutes:02}:{seconds:02}"),
        ScheduleState::Paused => format!("Breathe — paused at {minutes:02}:{seconds:02}"),
        ScheduleState::Snoozed => format!("Breathe — snoozed, {minutes:02}:{seconds:02} left"),
        ScheduleState::Stopped => "Breathe — stopped".to_string(),
    }
}

fn lock_error<T>(error: std::sync::PoisonError<T>) -> String {
    format!("an internal lock was poisoned: {error}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snapshot(state: ScheduleState, remaining_ms: i64, kind: Option<ReminderKind>) -> Snapshot {
        Snapshot {
            state,
            window_hidden: false,
            interval_minutes: 45,
            remaining_ms,
            remaining_fraction: 1.0,
            next_kind: kind,
            next_at_ms: None,
            snooze_remaining_ms: None,
        }
    }

    #[test]
    fn tooltip_counts_down_while_running() {
        assert_eq!(
            tooltip_for(&snapshot(
                ScheduleState::Running,
                32 * 60 * 1000 + 15 * 1000,
                Some(ReminderKind::Eyes)
            )),
            "Breathe — next break in 32:15"
        );
    }

    #[test]
    fn tooltip_marks_a_paused_schedule() {
        assert_eq!(
            tooltip_for(&snapshot(
                ScheduleState::Paused,
                15 * 60 * 1000,
                Some(ReminderKind::Movement)
            )),
            "Breathe — paused at 15:00"
        );
    }

    #[test]
    fn tooltip_reports_snoozing() {
        assert_eq!(
            tooltip_for(&snapshot(
                ScheduleState::Snoozed,
                4 * 60 * 1000 + 30 * 1000,
                Some(ReminderKind::Eyes)
            )),
            "Breathe — snoozed, 04:30 left"
        );
    }

    #[test]
    fn tooltip_says_so_when_every_category_is_off() {
        assert_eq!(
            tooltip_for(&snapshot(ScheduleState::Running, 60_000, None)),
            "Breathe — reminders are turned off"
        );
    }

    #[test]
    fn tooltip_never_shows_negative_time() {
        assert_eq!(
            tooltip_for(&snapshot(
                ScheduleState::Running,
                -5000,
                Some(ReminderKind::Eyes)
            )),
            "Breathe — next break in 00:00"
        );
    }
}
