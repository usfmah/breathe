//! Optional "start with the user session" support.
//!
//! The official `tauri-plugin-autostart` writes an XDG autostart desktop entry,
//! which is the portable Linux mechanism and keeps the door open for Windows
//! later. Whether anything actually *reads* that entry is session-dependent, so
//! this module also reports what the current session will do — bare Wayland
//! compositors such as niri only honour XDG autostart when a systemd user session
//! wires up `xdg-desktop-autostart.target`.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use tauri::AppHandle;
use tauri_plugin_autostart::ManagerExt;

use crate::model::AutostartStatus;

/// The name the plugin is configured with, in `lib.rs`.
pub const ENTRY_FILE_NAME: &str = "Breathe.desktop";

/// The argument the autostart entry passes, so the app opens hidden.
pub const AUTOSTART_FLAG: &str = "--autostart";

/// Desktop environments that run `~/.config/autostart` themselves.
const SELF_MANAGING_DESKTOPS: [&str; 11] = [
    "gnome",
    "kde",
    "plasma",
    "xfce",
    "cinnamon",
    "mate",
    "lxde",
    "lxqt",
    "unity",
    "budgie",
    "pantheon",
];

pub fn status(app: &AppHandle) -> AutostartStatus {
    let enabled = app.autolaunch().is_enabled().unwrap_or(false);
    let entry_path = find_entry();
    let honors = session_honors_xdg_autostart();
    let notes = notes(entry_path.as_deref(), honors);

    AutostartStatus {
        enabled: enabled || entry_path.is_some(),
        entry_path: entry_path.map(|path| path.display().to_string()),
        session_honors_xdg_autostart: honors,
        notes,
    }
}

pub fn set(app: &AppHandle, enabled: bool) -> Result<AutostartStatus, String> {
    let manager = app.autolaunch();
    let result = if enabled {
        manager.enable()
    } else {
        manager.disable()
    };

    result.map_err(|error| {
        format!(
            "could not {} the autostart entry: {error}",
            if enabled { "install" } else { "remove" }
        )
    })?;

    Ok(status(app))
}

fn notes(entry_path: Option<&Path>, honors_xdg: bool) -> Vec<String> {
    let mut notes = Vec::new();

    if let Some(path) = entry_path {
        notes.push(format!(
            "Breathe is launched with {AUTOSTART_FLAG}, so it starts hidden in the background. Entry: {}",
            path.display()
        ));
    }

    if !honors_xdg {
        notes.push(
            "This session does not appear to read ~/.config/autostart entries. Bare Wayland compositors such as niri only run them when a systemd user session provides xdg-desktop-autostart.target. Add the line below to ~/.config/niri/config.kdl instead:"
                .to_string(),
        );
        notes.push(
            "spawn-at-startup \"breathe\" \"--autostart\"   # or the full path to the binary"
                .to_string(),
        );
    }

    notes
}

/// True when the current session is expected to launch XDG autostart entries.
pub fn session_honors_xdg_autostart() -> bool {
    let desktop = std::env::var("XDG_CURRENT_DESKTOP").unwrap_or_default();
    honors_xdg_autostart_for(&desktop, systemd_autostart_target_active)
}

/// Pure decision logic, so it can be tested without touching the environment.
fn honors_xdg_autostart_for(
    desktop: &str,
    systemd_target_active: impl FnOnce() -> bool,
) -> bool {
    let desktop = desktop.to_lowercase();

    if desktop.is_empty() {
        return false;
    }

    if SELF_MANAGING_DESKTOPS
        .iter()
        .any(|candidate| desktop.contains(candidate))
    {
        return true;
    }

    // Compositors without a desktop shell: systemd's xdg-autostart-generator is
    // the only thing that will run the entry.
    systemd_target_active()
}

fn systemd_autostart_target_active() -> bool {
    Command::new("systemctl")
        .args(["--user", "is-active", "xdg-desktop-autostart.target"])
        .output()
        .map(|output| {
            let state = String::from_utf8_lossy(&output.stdout).trim().to_string();
            state == "active" || state == "activating"
        })
        .unwrap_or(false)
}

fn config_home() -> Option<PathBuf> {
    if let Some(dir) = std::env::var_os("XDG_CONFIG_HOME") {
        if !dir.is_empty() {
            return Some(PathBuf::from(dir));
        }
    }
    std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".config"))
}

fn autostart_dir() -> Option<PathBuf> {
    config_home().map(|dir| dir.join("autostart"))
}

/// Finds the entry the plugin wrote. It is matched by file name first and by the
/// running executable's path second, so a renamed or relocated install is still
/// reported accurately.
fn find_entry() -> Option<PathBuf> {
    let dir = autostart_dir()?;
    let exe = std::env::current_exe().ok();
    let exe_path = exe.as_ref().map(|path| path.display().to_string());

    for entry in fs::read_dir(&dir).ok()?.flatten() {
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("desktop") {
            continue;
        }

        let name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default();
        if name.eq_ignore_ascii_case(ENTRY_FILE_NAME) {
            return Some(path);
        }

        if let (Some(exe_path), Ok(contents)) = (exe_path.as_ref(), fs::read_to_string(&path)) {
            if contents.contains(exe_path.as_str()) {
                return Some(path);
            }
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_empty_desktop_variable_is_reported_as_no_xdg_support() {
        assert!(!honors_xdg_autostart_for("", || panic!("must not probe")));
    }

    #[test]
    fn known_desktop_environments_are_trusted_without_probing_systemd() {
        for desktop in ["GNOME", "KDE", "X-Cinnamon", "XFCE", "ubuntu:GNOME"] {
            assert!(
                honors_xdg_autostart_for(desktop, || panic!("must not probe")),
                "{desktop} runs XDG autostart entries itself"
            );
        }
    }

    #[test]
    fn bare_compositors_depend_on_the_systemd_generator() {
        assert!(honors_xdg_autostart_for("niri", || true));
        assert!(!honors_xdg_autostart_for("niri", || false));
        assert!(honors_xdg_autostart_for("sway", || true));
        assert!(!honors_xdg_autostart_for("Hyprland", || false));
    }

    #[test]
    fn notes_mention_the_autostart_flag_when_an_entry_exists() {
        let notes = notes(
            Some(Path::new("/home/user/.config/autostart/Breathe.desktop")),
            true,
        );
        assert_eq!(notes.len(), 1);
        assert!(notes[0].contains(AUTOSTART_FLAG));
    }

    #[test]
    fn notes_explain_the_niri_alternative_when_xdg_autostart_is_unavailable() {
        let notes = notes(None, false);
        assert_eq!(notes.len(), 2);
        assert!(notes[0].contains("niri"));
        assert!(notes[1].contains("spawn-at-startup"));
    }

    #[test]
    fn no_notes_are_produced_for_a_supported_session() {
        assert!(notes(None, true).is_empty());
    }
}
