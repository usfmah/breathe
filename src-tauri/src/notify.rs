//! Reminder delivery over each platform's native notification service.
//!
//! Delivery uses the official `tauri-plugin-notification` on both platforms.
//! Linux needs an extra pre-flight because the plugin dispatches on a background
//! task and returns `Ok(())` before the daemon has answered, so a missing
//! notification daemon would otherwise look like success. Windows has no
//! equivalent "is a daemon running?" probe: the toast platform is part of the
//! OS, so the status describes that platform. The plugin dispatches Windows
//! toast delivery asynchronously; Focus Assist and notification settings can
//! suppress a toast without producing an error, so the UI cannot promise that a
//! reminder was visibly displayed.

use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

use crate::model::{NotificationStatus, ReminderKind};

/// Used as the Linux notification `app_icon` hint, matching `tauri.conf.json`.
/// Windows toasts take their identity/icon from the installed shortcut instead,
/// so this must not be sent as an icon path there.
#[cfg(target_os = "linux")]
const APP_ICON: &str = "dev.breathe.app";

/// The copy is intentionally short, calm and free of any call to action that
/// assumes notification buttons or sounds are available.
pub fn message_for(kind: ReminderKind) -> (&'static str, &'static str) {
    match kind {
        ReminderKind::Eyes => (
            "Time to rest your eyes",
            "Look away from the screen and focus on something in the distance for a little while.",
        ),
        ReminderKind::Movement => (
            "Time to move a little",
            "Stand up, stretch, and give your body a chance to move.",
        ),
    }
}

/// Asks the platform whether reminders can be shown right now.
pub fn status() -> NotificationStatus {
    platform::status()
}

/// True when a notification service is reachable right now.
pub fn is_available() -> bool {
    status().available
}

/// Delivers one reminder. Never opens a window, never steals focus.
pub fn deliver(app: &AppHandle, kind: ReminderKind) -> Result<(), String> {
    let (title, body) = message_for(kind);
    platform::deliver(app, title, body)
}

/// The shared plugin path. The Linux pre-flight and fallback live in the
/// platform module; Windows uses the plugin's native toast backend directly.
fn plugin_deliver(app: &AppHandle, title: &str, body: &str) -> Result<(), String> {
    let builder = app.notification().builder().title(title).body(body);
    // `app_icon` is a freedesktop hint. On Windows it would be treated as an
    // icon path, so only add it on Linux; Windows uses the shortcut identity.
    #[cfg(target_os = "linux")]
    let builder = builder.icon(APP_ICON);
    builder
        .show()
        .map_err(|error| format!("the notification plugin rejected the message: {error}"))
}

/// The status Windows reports without a session-bus probe.
///
/// Kept outside the `cfg(windows)` module so the mapping can be unit-tested on
/// the Linux CI runner as well.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn windows_status() -> NotificationStatus {
    NotificationStatus {
        available: true,
        service: Some("Windows toast notifications".to_string()),
        vendor: Some("Microsoft".to_string()),
        version: None,
        spec_version: None,
        error: None,
    }
}

#[cfg(target_os = "linux")]
mod platform {
    use super::*;

    const APP_NAME: &str = "Breathe";

    pub fn status() -> NotificationStatus {
        match notify_rust::get_server_information() {
            Ok(info) => NotificationStatus {
                available: true,
                service: Some(info.name),
                vendor: Some(info.vendor),
                version: Some(info.version),
                spec_version: Some(info.spec_version),
                error: None,
            },
            Err(error) => NotificationStatus::unavailable(error.to_string()),
        }
    }

    pub fn deliver(app: &AppHandle, title: &str, body: &str) -> Result<(), String> {
        if is_available() {
            return plugin_deliver(app, title, body);
        }

        // Nothing advertised itself on the bus. Try the D-Bus call directly so
        // the caller gets the underlying error instead of a silent no-op.
        notify_rust::Notification::new()
            .appname(APP_NAME)
            .summary(title)
            .body(body)
            .icon(APP_ICON)
            .show()
            .map(|_| ())
            .map_err(|error| {
                let detail = status()
                    .error
                    .unwrap_or_else(|| "no service name on the session bus".to_string());
                format!("{detail} (direct D-Bus attempt: {error})")
            })
    }
}

#[cfg(target_os = "windows")]
mod platform {
    use super::*;

    pub fn status() -> NotificationStatus {
        windows_status()
    }

    pub fn deliver(app: &AppHandle, title: &str, body: &str) -> Result<(), String> {
        plugin_deliver(app, title, body)
    }
}

/// Keeps the crate compiling on platforms we do not ship yet (for example a
/// future macOS build), while still routing through the official plugin.
#[cfg(not(any(target_os = "linux", target_os = "windows")))]
mod platform {
    use super::*;

    pub fn status() -> NotificationStatus {
        NotificationStatus::unavailable(
            "notification status is only implemented for Linux and Windows",
        )
    }

    pub fn deliver(app: &AppHandle, title: &str, body: &str) -> Result<(), String> {
        plugin_deliver(app, title, body)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn eye_rest_copy_matches_the_agreed_wording() {
        let (title, body) = message_for(ReminderKind::Eyes);
        assert_eq!(title, "Time to rest your eyes");
        assert!(body.starts_with("Look away from the screen"));
    }

    #[test]
    fn movement_copy_matches_the_agreed_wording() {
        let (title, body) = message_for(ReminderKind::Movement);
        assert_eq!(title, "Time to move a little");
        assert!(body.starts_with("Stand up, stretch"));
    }

    #[test]
    fn copy_stays_concise_enough_for_a_notification_bubble() {
        for kind in [ReminderKind::Eyes, ReminderKind::Movement] {
            let (title, body) = message_for(kind);
            assert!(title.len() < 48, "title too long: {title}");
            assert!(body.len() < 120, "body too long: {body}");
        }
    }

    #[test]
    fn windows_status_describes_the_toast_platform_without_a_freedesktop_claim() {
        let status = windows_status();
        assert!(status.available);
        assert_eq!(
            status.service.as_deref(),
            Some("Windows toast notifications")
        );
        assert_eq!(status.vendor.as_deref(), Some("Microsoft"));
        assert!(
            status.spec_version.is_none(),
            "Windows must not claim a freedesktop notification spec version"
        );
        assert!(status.error.is_none());
    }
}
