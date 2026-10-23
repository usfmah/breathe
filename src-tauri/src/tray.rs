//! System tray integration.
//!
//! Linux uses a StatusNotifierItem on the session bus, so the icon only appears
//! if the user's bar hosts one (`org.kde.StatusNotifierWatcher`). Waybar, KDE,
//! GNOME with the AppIndicator extension, and similar bars do; a bare Wayland
//! compositor does not provide a bar at all.
//!
//! Windows uses the native notification-area tray. The same menu is shown on
//! left and right click, so the controls behave the same on both platforms.
//!
//! Tauri's docs are explicit that `TrayIconEvent::Click` is never emitted on
//! Linux, so every action lives in the menu rather than in a click handler.

use std::sync::Mutex;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Wry};

use crate::model::ScheduleState;

pub const TRAY_ID: &str = "breathe-tray";

/// Menu labels, kept in one place so `sync` and `build` cannot drift apart.
const LABEL_PAUSE: &str = "Pause Reminders";
const LABEL_RESUME: &str = "Resume Reminders";
const LABEL_SNOOZE: &str = "Snooze for 5 minutes";

pub struct TrayHandles {
    pause: MenuItem<Wry>,
    snooze: MenuItem<Wry>,
    /// Last applied labels, so the 500 ms worker tick only touches the menu when
    /// something actually changed.
    applied: Mutex<Applied>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
struct Applied {
    pause_label: String,
    pause_enabled: bool,
    snooze_enabled: bool,
    tooltip: String,
}

impl TrayHandles {
    /// Reflects the current schedule in the menu.
    ///
    /// Only touches the StatusNotifierItem when something actually changed, so
    /// the 500 ms worker tick does not become two D-Bus messages per second.
    /// Returns true when the caller should push `tooltip` to the tray icon.
    pub fn sync(
        &self,
        state: ScheduleState,
        snooze_enabled: bool,
        reminders_enabled: bool,
        tooltip: &str,
    ) -> bool {
        let next = Applied {
            pause_label: if state == ScheduleState::Running {
                LABEL_PAUSE.to_string()
            } else {
                LABEL_RESUME.to_string()
            },
            pause_enabled: reminders_enabled,
            snooze_enabled: snooze_enabled && reminders_enabled && state != ScheduleState::Paused,
            tooltip: tooltip.to_string(),
        };

        let mut applied = match self.applied.lock() {
            Ok(applied) => applied,
            Err(poisoned) => poisoned.into_inner(),
        };

        if applied.pause_label != next.pause_label {
            let _ = self.pause.set_text(&next.pause_label);
        }
        if applied.pause_enabled != next.pause_enabled {
            let _ = self.pause.set_enabled(next.pause_enabled);
        }
        if applied.snooze_enabled != next.snooze_enabled {
            let _ = self.snooze.set_enabled(next.snooze_enabled);
        }

        let tooltip_changed = applied.tooltip != next.tooltip;
        *applied = next;
        tooltip_changed
    }
}

pub fn build(app: &AppHandle) -> tauri::Result<TrayHandles> {
    let open = MenuItem::with_id(app, "open", "Open Breathe", true, None::<&str>)?;
    let pause = MenuItem::with_id(app, "pause", LABEL_PAUSE, true, None::<&str>)?;
    let snooze = MenuItem::with_id(app, "snooze", LABEL_SNOOZE, true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let before_actions = PredefinedMenuItem::separator(app)?;
    let before_quit = PredefinedMenuItem::separator(app)?;

    let menu = Menu::with_items(
        app,
        &[
            &open,
            &before_actions,
            &pause,
            &snooze,
            &settings,
            &before_quit,
            &quit,
        ],
    )?;

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .tooltip("Breathe")
        // Linux ignores this (the StatusNotifierItem host decides), but on
        // Windows it makes the menu reachable with a left click as well.
        .show_menu_on_left_click(true)
        .on_menu_event(on_menu_event);

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }

    builder.build(app)?;

    Ok(TrayHandles {
        pause,
        snooze,
        applied: Mutex::new(Applied::default()),
    })
}

fn on_menu_event(app: &AppHandle, event: tauri::menu::MenuEvent) {
    match event.id().as_ref() {
        "open" => crate::commands::show_main_window(app),
        "pause" => crate::commands::toggle_scheduling(app),
        "snooze" => crate::commands::snooze_from_tray(app),
        "settings" => {
            let app = app.clone();
            tauri::async_runtime::spawn_blocking(move || {
                if let Err(error) = crate::commands::open_settings_window(&app) {
                    eprintln!("[breathe] could not open the settings window: {error}");
                }
            });
        }
        "quit" => crate::commands::quit(app),
        other => eprintln!("[breathe] ignoring unknown tray action {other}"),
    }
}
