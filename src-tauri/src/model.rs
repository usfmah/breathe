//! Portable data model shared with the frontend.
//!
//! Nothing in here depends on Tauri, so the types (and their validation rules)
//! can be unit-tested without a running application.

use serde::{Deserialize, Serialize};

/// The intervals the UI offers, in minutes.
pub const INTERVAL_CHOICES: [u32; 4] = [20, 30, 45, 60];
pub const DEFAULT_INTERVAL_MINUTES: u32 = 45;
pub const DEFAULT_SNOOZE_MINUTES: u32 = 10;
/// Length of the break the user can take when a reminder is due.
pub const BREAK_MINUTES: u32 = 3;

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

/// Interface language, chosen in Settings independently of the OS locale.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Language {
    #[default]
    En,
    Ar,
}

/// How reminders reach the user: Breathe's own popup, or the operating
/// system's notifications (a notification centre banner or toast).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum NotificationStyle {
    #[default]
    Popup,
    System,
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
///
/// After a countdown ends the schedule is `Awaiting` the user's choice: no
/// clock runs until they take a break (`OnBreak`) or snooze (`Snoozed`). A new
/// countdown is never started silently.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ScheduleState {
    Running,
    Paused,
    Snoozed,
    /// A reminder is due and is waiting for the user to choose.
    Awaiting,
    /// The user is taking the break they chose.
    #[serde(rename = "break")]
    OnBreak,
    #[serde(rename = "quit")]
    Stopped,
}

/// A reminder that is due. The id makes a choice idempotent: acting on a
/// reminder that is no longer waiting is ignored instead of applied twice.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingReminder {
    pub id: u64,
    pub kind: ReminderKind,
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
    /// Whether popups play a short chime.
    pub sound_enabled: bool,
    /// Where reminders are shown.
    pub notification_style: NotificationStyle,
    pub language: Language,
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
            sound_enabled: true,
            notification_style: NotificationStyle::Popup,
            language: Language::En,
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
    pub sound_enabled: Option<bool>,
    pub notification_style: Option<NotificationStyle>,
    pub language: Option<Language>,
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

    pub fn language_changed(&self) -> bool {
        self.language.is_some()
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
        if let Some(value) = self.sound_enabled {
            base.sound_enabled = value;
        }
        if let Some(value) = self.notification_style {
            base.notification_style = value;
        }
        if let Some(value) = self.language {
            base.language = value;
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
    /// The reminder waiting for a choice (`awaiting`) or being acted on (`break`).
    pub pending: Option<PendingReminder>,
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
    /// Used by the Linux probe and the fallback platform; Windows and macOS
    /// never need it.
    #[cfg_attr(any(target_os = "windows", target_os = "macos"), allow(dead_code))]
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
    /// Platform mechanism, for example "XDG autostart" or "Windows Run key".
    pub mechanism: String,
    pub entry_path: Option<String>,
    /// False on Linux sessions that never read `~/.config/autostart`. Always
    /// true on Windows, where the per-user Run key is part of the platform.
    pub session_reads_startup_entry: bool,
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
        assert!(settings.sound_enabled);
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
        assert!(
            result.is_err(),
            "unknown keys must not be silently accepted"
        );
    }

    #[test]
    fn language_defaults_to_english_and_rejects_unknown_values() {
        assert_eq!(Settings::default().language, Language::En);
        let arabic: SettingsPatch =
            serde_json::from_str(r#"{"language":"ar"}"#).expect("deserialises");
        assert_eq!(arabic.language, Some(Language::Ar));
        assert!(arabic.language_changed());
        assert!(serde_json::from_str::<SettingsPatch>(r#"{"language":"fr"}"#).is_err());
    }

    #[test]
    fn patch_rejects_an_unknown_theme() {
        let result = serde_json::from_str::<SettingsPatch>(r#"{"theme":"sepia"}"#);
        assert!(result.is_err());
    }

    #[test]
    fn patch_applies_only_the_fields_present() {
        let patch: SettingsPatch =
            serde_json::from_str(r#"{"intervalMinutes":60,"eyesEnabled":false,"theme":"dark"}"#)
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
            sound_enabled: false,
            notification_style: NotificationStyle::System,
            language: Language::Ar,
            theme: ThemePreference::Dark,
            start_with_session: true,
            start_running: false,
        };
        let encoded = serde_json::to_string(&settings).expect("serialises");
        let decoded: Settings = serde_json::from_str(&encoded).expect("deserialises");
        assert_eq!(settings, decoded);
    }

    #[test]
    fn new_states_use_the_wire_names_the_frontend_expects() {
        let awaiting = serde_json::to_string(&ScheduleState::Awaiting).expect("serialises");
        let on_break = serde_json::to_string(&ScheduleState::OnBreak).expect("serialises");
        assert_eq!(awaiting, "\"awaiting\"");
        assert_eq!(on_break, "\"break\"");

        let reminder = PendingReminder {
            id: 7,
            kind: ReminderKind::Movement,
        };
        assert_eq!(
            serde_json::to_string(&reminder).expect("serialises"),
            r#"{"id":7,"kind":"movement"}"#
        );
    }

    #[test]
    fn stopped_state_is_published_as_quit() {
        let json = serde_json::to_string(&ScheduleState::Stopped).expect("serialises");
        assert_eq!(json, "\"quit\"");
    }

    #[test]
    fn notification_style_defaults_to_the_popup_and_uses_lowercase_names() {
        let old: Settings = serde_json::from_str(r#"{"theme":"dark"}"#).expect("deserialises");
        assert_eq!(old.notification_style, NotificationStyle::Popup);
        assert_eq!(
            serde_json::to_string(&NotificationStyle::System).expect("serialises"),
            r#""system""#
        );
        let patch: SettingsPatch =
            serde_json::from_str(r#"{"notificationStyle":"system"}"#).expect("deserialises");
        let next = patch.apply(Settings::default()).expect("valid");
        assert_eq!(next.notification_style, NotificationStyle::System);
    }
}
