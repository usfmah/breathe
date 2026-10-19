//! Reminder delivery over the freedesktop notification specification.
//!
//! Delivery goes through the official `tauri-plugin-notification`, which on
//! Linux talks to `org.freedesktop.Notifications` over the session bus.
//!
//! One caveat drives the shape of this module: on Linux the plugin dispatches on
//! a background task and returns `Ok(())` before the daemon has answered, so a
//! missing or broken notification service cannot be detected from its result.
//! `status()` therefore performs a real `GetServerInformation` round trip, and
//! `deliver()` gates on it. Without that the UI would cheerfully claim a test
//! notification was delivered to a desktop that has no notification service.

use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

use crate::model::{NotificationStatus, ReminderKind};

/// Used as the notification `app_icon` hint, matching `tauri.conf.json`.
const APP_ICON: &str = "dev.breathe.app";
const APP_NAME: &str = "Breathe";

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

/// Asks the session bus which notification daemon is serving us.
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

/// True when a notification service is reachable right now.
pub fn is_available() -> bool {
    status().available
}

/// Delivers one reminder. Never opens a window, never steals focus.
pub fn deliver(app: &AppHandle, kind: ReminderKind) -> Result<(), String> {
    let (title, body) = message_for(kind);

    if is_available() {
        return app
            .notification()
            .builder()
            .title(title)
            .body(body)
            .icon(APP_ICON)
            .show()
            .map_err(|error| format!("the notification plugin rejected the message: {error}"));
    }

    // Nothing advertised itself on the bus. Try the D-Bus call directly so the
    // caller gets the underlying error instead of a silent no-op.
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
}
