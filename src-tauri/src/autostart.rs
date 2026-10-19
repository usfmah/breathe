//! Optional "start with the user session" support.
//!
//! The official `tauri-plugin-autostart` writes the platform-native entry: an
//! XDG desktop file on Linux and a per-user `Run` value on Windows. This module
//! adds the reporting the plugin does not provide: which mechanism is in use,
//! whether the current Linux session actually reads XDG entries, and what to do
//! when it does not.
//!
//! Bare Wayland compositors such as niri only honour XDG autostart when a
//! systemd user session wires up `xdg-desktop-autostart.target`; the notes
//! returned here tell the user how to add an explicit `spawn-at-startup` line
//! instead of pretending the toggle worked.

use std::path::Path;

#[cfg(target_os = "linux")]
use std::fs;
#[cfg(target_os = "linux")]
use std::path::PathBuf;
#[cfg(target_os = "linux")]
use std::process::Command;

use tauri::AppHandle;
use tauri_plugin_autostart::ManagerExt;

use crate::model::AutostartStatus;

/// The argument the autostart entry passes, so the app opens hidden.
pub const AUTOSTART_FLAG: &str = "--autostart";

#[cfg(target_os = "linux")]
pub const ENTRY_FILE_NAME: &str = "Breathe.desktop";

#[cfg(target_os = "linux")]
const MECHANISM: &str = "XDG autostart";
#[cfg(target_os = "windows")]
const MECHANISM: &str = "Windows Run key";
#[cfg(not(any(target_os = "linux", target_os = "windows")))]
const MECHANISM: &str = "autostart";

/// Descriptive location shown in the UI on Windows. It is not a filesystem path.
const WINDOWS_ENTRY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run\Breathe";

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
    let plugin_enabled = app.autolaunch().is_enabled().unwrap_or(false);
    let detected = detect_entry();
    let enabled = plugin_enabled || detected.is_some();
    let entry_path = detected.or_else(|| if enabled { display_entry() } else { None });
    let reads = session_reads_startup_entry();
    let notes = notes(entry_path.as_deref(), reads, enabled);

    AutostartStatus {
        enabled,
        mechanism: MECHANISM.to_string(),
        entry_path,
        session_reads_startup_entry: reads,
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

/* -------------------------------------------------------------------------- */
/* Notes                                                                      */
/* -------------------------------------------------------------------------- */

#[cfg(target_os = "linux")]
fn notes(entry_path: Option<&str>, reads: bool, _enabled: bool) -> Vec<String> {
    linux_notes(entry_path.map(Path::new), reads)
}

#[cfg(target_os = "windows")]
fn notes(_entry_path: Option<&str>, _reads: bool, enabled: bool) -> Vec<String> {
    windows_notes(enabled)
}

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
fn notes(_entry_path: Option<&str>, _reads: bool, _enabled: bool) -> Vec<String> {
    Vec::new()
}

#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
fn linux_notes(entry_path: Option<&Path>, reads_xdg: bool) -> Vec<String> {
    let mut notes = Vec::new();

    if let Some(path) = entry_path {
        notes.push(format!(
            "Breathe is launched with {AUTOSTART_FLAG}, so it starts hidden in the background. Entry: {}",
            path.display()
        ));
    }

    if !reads_xdg {
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

#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn windows_notes(enabled: bool) -> Vec<String> {
    if !enabled {
        return Vec::new();
    }

    vec![
        format!(
            "Breathe is registered under {WINDOWS_ENTRY} and starts hidden in the background."
        ),
        "The entry belongs to the current user and does not require administrator rights."
            .to_string(),
    ]
}

/* -------------------------------------------------------------------------- */
/* Platform reporting                                                         */
/* -------------------------------------------------------------------------- */

/// True when the current session is expected to launch the startup entry.
#[cfg(target_os = "linux")]
pub fn session_reads_startup_entry() -> bool {
    let desktop = std::env::var("XDG_CURRENT_DESKTOP").unwrap_or_default();
    reads_startup_entry_for(&desktop, systemd_autostart_target_active)
}

/// The current-user Run key is read by every Windows session.
#[cfg(target_os = "windows")]
pub fn session_reads_startup_entry() -> bool {
    true
}

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
pub fn session_reads_startup_entry() -> bool {
    false
}

/// Pure decision logic, so it can be tested without touching the environment.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
fn reads_startup_entry_for(
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

#[cfg(target_os = "linux")]
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

#[cfg(target_os = "linux")]
fn detect_entry() -> Option<String> {
    find_entry().map(|path| path.display().to_string())
}

#[cfg(not(target_os = "linux"))]
fn detect_entry() -> Option<String> {
    None
}

#[cfg(target_os = "windows")]
fn display_entry() -> Option<String> {
    Some(WINDOWS_ENTRY.to_string())
}

#[cfg(not(target_os = "windows"))]
fn display_entry() -> Option<String> {
    None
}

/* -------------------------------------------------------------------------- */
/* Linux entry discovery                                                      */
/* -------------------------------------------------------------------------- */

#[cfg(target_os = "linux")]
fn config_home() -> Option<PathBuf> {
    if let Some(dir) = std::env::var_os("XDG_CONFIG_HOME") {
        if !dir.is_empty() {
            return Some(PathBuf::from(dir));
        }
    }
    std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".config"))
}

#[cfg(target_os = "linux")]
fn autostart_dir() -> Option<PathBuf> {
    config_home().map(|dir| dir.join("autostart"))
}

/// Finds the entry the plugin wrote. It is matched by file name first and by the
/// running executable's path second, so a renamed or relocated install is still
/// reported accurately.
#[cfg(target_os = "linux")]
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
        assert!(!reads_startup_entry_for("", || panic!("must not probe")));
    }

    #[test]
    fn known_desktop_environments_are_trusted_without_probing_systemd() {
        for desktop in ["GNOME", "KDE", "X-Cinnamon", "XFCE", "ubuntu:GNOME"] {
            assert!(
                reads_startup_entry_for(desktop, || panic!("must not probe")),
                "{desktop} runs XDG autostart entries itself"
            );
        }
    }

    #[test]
    fn bare_compositors_depend_on_the_systemd_generator() {
        assert!(reads_startup_entry_for("niri", || true));
        assert!(!reads_startup_entry_for("niri", || false));
        assert!(reads_startup_entry_for("sway", || true));
        assert!(!reads_startup_entry_for("Hyprland", || false));
    }

    #[test]
    fn linux_notes_mention_the_autostart_flag_when_an_entry_exists() {
        let notes = linux_notes(
            Some(Path::new("/home/user/.config/autostart/Breathe.desktop")),
            true,
        );
        assert_eq!(notes.len(), 1);
        assert!(notes[0].contains(AUTOSTART_FLAG));
    }

    #[test]
    fn linux_notes_explain_the_niri_alternative_when_xdg_autostart_is_unavailable() {
        let notes = linux_notes(None, false);
        assert_eq!(notes.len(), 2);
        assert!(notes[0].contains("niri"));
        assert!(notes[1].contains("spawn-at-startup"));
    }

    #[test]
    fn linux_notes_are_empty_for_a_supported_session() {
        assert!(linux_notes(None, true).is_empty());
    }

    #[test]
    fn windows_notes_identify_the_run_key_when_enabled() {
        let notes = windows_notes(true);
        assert_eq!(notes.len(), 2);
        assert!(notes[0].contains(r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run\Breathe"));
        assert!(notes[1].contains("administrator"));
    }

    #[test]
    fn windows_notes_are_empty_when_disabled() {
        assert!(windows_notes(false).is_empty());
    }

    #[test]
    fn the_platform_mechanism_is_named() {
        assert!(!MECHANISM.is_empty());
    }
}
