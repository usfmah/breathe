//! Local persistence for user settings.
//!
//! Only preferences are stored — never the countdown — so restarting Breathe can
//! never resurrect a stale deadline.

use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

use crate::model::Settings;

pub const STORE_PATH: &str = "settings.json";
pub const SETTINGS_KEY: &str = "settings";

/// Reads the persisted settings, repairing anything that no longer makes sense.
/// Falls back to defaults rather than refusing to start.
pub fn load(app: &AppHandle) -> Settings {
    let store = match app.store(STORE_PATH) {
        Ok(store) => store,
        Err(error) => {
            eprintln!("[breathe] could not open the settings store: {error}");
            return Settings::default();
        }
    };

    let Some(value) = store.get(SETTINGS_KEY) else {
        return Settings::default();
    };

    match serde_json::from_value::<Settings>(value) {
        Ok(settings) => settings.sanitized(),
        Err(error) => {
            eprintln!("[breathe] stored settings were unreadable ({error}); using defaults");
            Settings::default()
        }
    }
}

pub fn save(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let store = app
        .store(STORE_PATH)
        .map_err(|error| format!("could not open the settings store: {error}"))?;

    let value = serde_json::to_value(settings)
        .map_err(|error| format!("could not serialise the settings: {error}"))?;

    store.set(SETTINGS_KEY, value);
    store
        .save()
        .map_err(|error| format!("could not write the settings to disk: {error}"))
}
