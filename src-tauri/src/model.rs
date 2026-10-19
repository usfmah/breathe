//! Portable data model shared with the frontend.
//!
//! Nothing in here depends on Tauri, so the types (and their validation rules)
//! can be unit-tested without a running application.

use serde::{Deserialize, Serialize};

/// The intervals the UI offers, in minutes.
pub const INTERVAL_CHOICES: [u32; 4] = [20, 30, 45, 60];
pub const DEFAULT_INTERVAL_MINUTES: u32 = 45;
pub const DEFAULT_SNOOZE_MINUTES: u32 = 5;

/// Events pushed from Rust to the webviews.
pub const EVENT_SNAPSHOT: &str = "breathe://snapshot";
pub const EVENT_SETTINGS: &str = "breathe://settings";

/* -------------------------------------------------------------------------- */
/* Enumerations                                                               */
/* -------------------------------------------------------------------------- */

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum ThemePreference {
    #[default]
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ReminderKind {
    Eyes,
    Movement,
}

/// The lifecycle of the reminder schedule.
///
/// `Hidden` is intentionally absent: hiding the window is orthogonal to the
/// schedule (a hidden app keeps counting down and still delivers), so it travels
/// as [`Snapshot::window_hidden`] instead. `Stopped` is what the UI calls the
/// Quit state — it is only reached while the process is shutting down.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ScheduleState {
    Running,
    Paused,
    Snoozed,
    #[serde(rename = "quit")]
    Stopped,
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub interval_minutes: u32,
    pub eyes_enabled: bool,
    pub movement_enabled: bool,
    pub snooze_enabled: bool,
    pub theme: ThemePreference,
    pub start_with_session: bool,
    /// Whether the schedule should be running the next time the app launches.
    pub start_running: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            interval_minutes: DEFAULT_INTERVAL_MINUTES,
            eyes_enabled: true,
            movement_enabled: true,
            snooze_enabled: true,
            theme: ThemePreference::System,
            start_with_session: false,
            start_running: true,
        }
    }
}

impl Settings {
    /// Repairs values that came from disk. Used on load only — anything arriving
    /// over IPC goes through [`SettingsPatch::apply`], which rejects bad input.
    pub fn sanitized(mut self) -> Self {
        if !INTERVAL_CHOICES.contains(&self.interval_minutes) {
            self.interval_minutes = DEFAULT_INTERVAL_MINUTES;
        }
        self
    }
}

/// A partial settings update. `deny_unknown_fields` turns unexpected keys from
/// the webview into a hard error instead of silently ignoring them.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct SettingsPatch {
    pub interval_minutes: Option<u32>,
    pub eyes_enabled: Option<bool>,
    pub movement_enabled: Option<bool>,
    pub snooze_enabled: Option<bool>,
    pub theme: Option<ThemePreference>,
    pub start_with_session: Option<bool>,
    pub start_running: Option<bool>,
}

impl SettingsPatch {
    pub fn start_running(&self) -> Option<bool> {
        self.start_running
    }

    pub fn appearance_changed(&self) -> bool {
        self.theme.is_some()
    }

    pub fn start_with_session(&self) -> Option<bool> {
        self.start_with_session
    }

    /// Applies the patch to `base`, validating every field.
    pub fn apply(self, mut base: Settings) -> Result<Settings, String> {
        if let Some(minutes) = self.interval_minutes {
            if !INTERVAL_CHOICES.contains(&minutes) {
                return Err(format!(
                    "intervalMinutes must be one of {INTERVAL_CHOICES:?}, received {minutes}"
                ));
            }
            base.interval_minutes = minutes;
        }
        if let Some(value) = self.eyes_enabled {
            base.eyes_enabled = value;
        }
        if let Some(value) = self.movement_enabled {
            base.movement_enabled = value;
        }
        if let Some(value) = self.snooze_enabled {
            base.snooze_enabled = value;
        }
        if let Some(value) = self.theme {
            base.theme = value;
        }
        if let Some(value) = self.start_with_session {
            base.start_with_session = value;
        }
        if let Some(value) = self.start_running {
            base.start_running = value;
        }
        Ok(base)
    }
}

/* -------------------------------------------------------------------------- */
/* Snapshot                                                                   */
/* -------------------------------------------------------------------------- */

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub state: ScheduleState,
    /// True while the window is hidden. Never conflated with `state`.
    pub window_hidden: bool,
    pub interval_minutes: u32,
    pub remaining_ms: i64,
    /// Fraction of the current cycle still remaining, 0.0..=1.0.
    pub remaining_fraction: f64,
    pub next_kind: Option<ReminderKind>,
    /// Unix epoch milliseconds of the next reminder, or null when nothing is scheduled.
    pub next_at_ms: Option<i64>,
    pub snooze_remaining_ms: Option<i64>,
}

/* -------------------------------------------------------------------------- */
/* Diagnostics                                                                */
/* -------------------------------------------------------------------------- */

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationStatus {
    pub available: bool,
    pub service: Option<String>,
    pub vendor: Option<String>,
    pub version: Option<String>,
    pub spec_version: Option<String>,
    pub error: Option<String>,
}

impl NotificationStatus {
    pub fn unavailable(error: impl Into<String>) -> Self {
        Self {
            available: false,
            service: None,
            vendor: None,
            version: None,
            spec_version: None,
            error: Some(error.into()),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutostartStatus {
    pub enabled: bool,
    pub entry_path: Option<String>,
    /// False on sessions that never read `~/.config/autostart`.
    pub session_honors_xdg_autostart: bool,
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub description: String,
    pub tauri_version: String,
    pub platform: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestNotificationResult {
    pub delivered: bool,
    pub kind: ReminderKind,
    pub error: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_match_the_product_spec() {
        let settings = Settings::default();
        assert_eq!(settings.interval_minutes, 45);
        assert!(settings.eyes_enabled);
        assert!(settings.movement_enabled);
        assert_eq!(settings.theme, ThemePreference::System);
        assert!(!settings.start_with_session);
    }

    #[test]
    fn sanitize_repairs_an_interval_that_is_no_longer_offered() {
        let broken = Settings {
            interval_minutes: 7,
            ..Settings::default()
        };
        assert_eq!(sanitized_interval(broken), DEFAULT_INTERVAL_MINUTES);
    }

    fn sanitized_interval(settings: Settings) -> u32 {
        settings.sanitized().interval_minutes
    }

    #[test]
    fn missing_keys_fall_back_to_defaults() {
        let settings: Settings = serde_json::from_str("{}").expect("empty object");
        assert_eq!(settings, Settings::default());
    }

    #[test]
    fn unknown_keys_are_ignored_when_reading_a_stale_file() {
        let settings: Settings =
            serde_json::from_str(r#"{"intervalMinutes":30,"legacyOption":true}"#)
                .expect("tolerates unknown keys on load");
        assert_eq!(settings.interval_minutes, 30);
    }

    #[test]
    fn patch_rejects_an_unsupported_interval() {
        let patch: SettingsPatch =
            serde_json::from_str(r#"{"intervalMinutes":17}"#).expect("deserialises");
        let error = patch
            .apply(Settings::default())
            .expect_err("17 minutes is not offered");
        assert!(error.contains("intervalMinutes"));
    }

    #[test]
    fn patch_rejects_unknown_fields() {
        let result = serde_json::from_str::<SettingsPatch>(r#"{"nope":1}"#);
        assert!(result.is_err(), "unknown keys must not be silently accepted");
    }

    #[test]
    fn patch_rejects_an_unknown_theme() {
        let result = serde_json::from_str::<SettingsPatch>(r#"{"theme":"sepia"}"#);
        assert!(result.is_err());
    }

    #[test]
    fn patch_applies_only_the_fields_present() {
        let patch: SettingsPatch = serde_json::from_str(
            r#"{"intervalMinutes":60,"eyesEnabled":false,"theme":"dark"}"#,
        )
        .expect("deserialises");

        let updated = patch.apply(Settings::default()).expect("valid patch");

        assert_eq!(updated.interval_minutes, 60);
        assert!(!updated.eyes_enabled);
        assert!(updated.movement_enabled, "untouched field must survive");
        assert_eq!(updated.theme, ThemePreference::Dark);
        assert!(updated.start_running, "untouched field must survive");
    }

    #[test]
    fn patch_reports_which_groups_changed() {
        let patch: SettingsPatch =
            serde_json::from_str(r#"{"intervalMinutes":20}"#).expect("deserialises");
        assert_eq!(patch.interval_minutes, Some(20));
        assert_eq!(patch.start_running, None);
        assert!(!patch.appearance_changed());

        let themed: SettingsPatch =
            serde_json::from_str(r#"{"theme":"dark"}"#).expect("deserialises");
        assert!(themed.appearance_changed());
    }

    #[test]
    fn settings_round_trip_through_json() {
        let settings = Settings {
            interval_minutes: 30,
            eyes_enabled: false,
            movement_enabled: true,
            snooze_enabled: false,
            theme: ThemePreference::Dark,
            start_with_session: true,
            start_running: false,
        };
        let encoded = serde_json::to_string(&settings).expect("serialises");
        let decoded: Settings = serde_json::from_str(&encoded).expect("deserialises");
        assert_eq!(settings, decoded);
    }

    #[test]
    fn stopped_state_is_published_as_quit() {
        let json = serde_json::to_string(&ScheduleState::Stopped).expect("serialises");
        assert_eq!(json, "\"quit\"");
    }
}
