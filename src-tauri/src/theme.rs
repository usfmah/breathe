//! Window appearance helpers.

use tauri::{AppHandle, Manager, Theme};

use crate::model::ThemePreference;

pub const MAIN_WINDOW: &str = "main";
pub const SETTINGS_WINDOW: &str = "settings";

/// Window background colours, kept in sync with `src/styles.css`.
const LIGHT_BACKGROUND: tauri::window::Color = tauri::window::Color(251, 248, 242, 255);
const DARK_BACKGROUND: tauri::window::Color = tauri::window::Color(25, 30, 28, 255);

/// Applies the theme to every open window.
///
/// The webview gets the final say through its own `data-theme` attribute; this
/// only makes the native surface match so resizing and startup never flash a
/// white rectangle. On Linux the GTK theme is application-wide, which is exactly
/// what we want here.
pub fn apply(app: &AppHandle, preference: ThemePreference) {
    let theme = match preference {
        ThemePreference::System => None,
        ThemePreference::Light => Some(Theme::Light),
        ThemePreference::Dark => Some(Theme::Dark),
    };

    let background = match preference {
        ThemePreference::System => system_background(app),
        ThemePreference::Light => LIGHT_BACKGROUND,
        ThemePreference::Dark => DARK_BACKGROUND,
    };

    for label in [MAIN_WINDOW, SETTINGS_WINDOW] {
        if let Some(window) = app.get_webview_window(label) {
            let _ = window.set_theme(theme);
            let _ = window.set_background_color(Some(background));
        }
    }
}

/// Best-effort read of the effective OS theme, used for the native background
/// while the preference is "follow system".
fn system_background(app: &AppHandle) -> tauri::window::Color {
    let dark = app
        .get_webview_window(MAIN_WINDOW)
        .and_then(|window| window.theme().ok())
        .map(|theme| theme == Theme::Dark)
        .unwrap_or(false);

    if dark {
        DARK_BACKGROUND
    } else {
        LIGHT_BACKGROUND
    }
}

/// The theme a freshly created window should start with.
pub fn initial_background(preference: ThemePreference) -> tauri::window::Color {
    match preference {
        ThemePreference::Dark => DARK_BACKGROUND,
        _ => LIGHT_BACKGROUND,
    }
}

pub fn tauri_theme(preference: ThemePreference) -> Option<Theme> {
    match preference {
        ThemePreference::System => None,
        ThemePreference::Light => Some(Theme::Light),
        ThemePreference::Dark => Some(Theme::Dark),
    }
}
