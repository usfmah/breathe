//! The popup window: creation, placement and show/hide.
//!
//! One small window is created hidden at startup and reused for every popup,
//! so there is never more than one and showing it is instant. It is never
//! focusable, never in the taskbar, and never touches the main window.
//!
//! Placement is platform specific and lives in `platform`:
//!
//! * **Wayland with layer-shell** (niri, Sway, Hyprland, KDE): the window becomes
//!   an overlay layer surface anchored top-right. `libgtk-layer-shell` is loaded
//!   at runtime, so it is not a package dependency; without it, or on a
//!   compositor that lacks the protocol (GNOME), the popup is an ordinary
//!   window that the compositor places.
//! * **X11 and Windows**: positioned in a corner of the work area of the
//!   monitor under the cursor (top-right on Linux, bottom-right on Windows,
//!   matching where each platform shows notifications).

use std::sync::atomic::{AtomicU64, Ordering};

use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

use crate::model::Language;
use crate::popup::{PopupChange, PopupView};

pub const POPUP_WINDOW: &str = "popup";
pub const EVENT_POPUP: &str = "breathe://popup";

/// Logical width of the popup. The card inside is drawn by the frontend.
pub const POPUP_WIDTH: f64 = 400.0;
/// Height before the frontend has measured its card (issue #17: the height
/// now follows the content, so a popup without actions has no empty band).
pub const POPUP_HEIGHT: f64 = 164.0;
/// Bounds for the measured height, so a bad value can never produce a
/// zero-size or screen-filling window.
const MIN_HEIGHT: f64 = 72.0;
const MAX_HEIGHT: f64 = 320.0;

/// Current logical height (f64 bits), set from the frontend's measurement.
static HEIGHT: AtomicU64 = AtomicU64::new(POPUP_HEIGHT.to_bits());

fn current_height() -> f64 {
    f64::from_bits(HEIGHT.load(Ordering::Relaxed))
}

/// Clamps and rounds a measured content height to a whole logical pixel.
fn fit_height(measured: f64) -> f64 {
    if !measured.is_finite() {
        return POPUP_HEIGHT;
    }
    measured.ceil().clamp(MIN_HEIGHT, MAX_HEIGHT)
}

/// Gap between the popup and the screen edge, in logical pixels.
const EDGE_MARGIN: f64 = 16.0;

/// Creates the hidden popup window. Must run on the main thread before the
/// window is first shown (layer-shell can only be set up before that).
pub fn create(app: &AppHandle, language: Language) -> Result<(), String> {
    let window = WebviewWindowBuilder::new(app, POPUP_WINDOW, WebviewUrl::App("index.html".into()))
        .title(crate::i18n::text(language, "window.popup"))
        .inner_size(POPUP_WIDTH, POPUP_HEIGHT)
        .min_inner_size(POPUP_WIDTH, MIN_HEIGHT)
        .max_inner_size(POPUP_WIDTH, MAX_HEIGHT)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .skip_taskbar(true)
        .focused(false)
        .focusable(false)
        .visible(false)
        .build()
        .map_err(|error| format!("could not create the popup window: {error}"))?;

    let placement = platform::prepare(&window);
    eprintln!("[breathe] popup window ready ({placement})");
    Ok(())
}

/// True when the popup window exists and can be used instead of a native
/// notification.
pub fn available(app: &AppHandle) -> bool {
    app.get_webview_window(POPUP_WINDOW).is_some()
}

/// Applies a lifecycle change: tells the frontend what to render, then shows
/// or hides the window.
pub fn apply(app: &AppHandle, change: PopupChange) {
    let Some(window) = app.get_webview_window(POPUP_WINDOW) else {
        return;
    };

    match change {
        PopupChange::Show(view) => {
            // Render first, show second, so the old content never flashes.
            let _ = app.emit_to(POPUP_WINDOW, EVENT_POPUP, Some(view));
            platform::place(app, &window);
            if let Err(error) = platform::show(&window) {
                eprintln!("[breathe] could not show the popup: {error}");
            }
        }
        PopupChange::Hide => {
            if let Err(error) = platform::hide(&window) {
                eprintln!("[breathe] could not hide the popup: {error}");
            }
            let _ = app.emit_to(POPUP_WINDOW, EVENT_POPUP, None::<PopupView>);
        }
    }
}

/// Fits the window to the card the frontend measured (logical pixels), then
/// re-places it, since the bottom-anchored Windows popup moves with its
/// height. A repeated height is a no-op.
pub fn resize(app: &AppHandle, measured: f64) {
    let height = fit_height(measured);
    if HEIGHT.swap(height.to_bits(), Ordering::Relaxed) == height.to_bits() {
        return;
    }
    let Some(window) = app.get_webview_window(POPUP_WINDOW) else {
        return;
    };
    platform::resize(&window, height);
    let _ = window.set_size(LogicalSize::new(POPUP_WIDTH, height));
    platform::place(app, &window);
}

/// Positions the window in a corner of the work area of the monitor under
/// the cursor, falling back to the primary monitor.
fn place_in_corner(app: &AppHandle, window: &WebviewWindow, bottom: bool) {
    let monitor = app
        .cursor_position()
        .ok()
        .and_then(|cursor| app.monitor_from_point(cursor.x, cursor.y).ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else {
        return;
    };

    let scale = monitor.scale_factor();
    let height = current_height();
    let _ = window.set_size(LogicalSize::new(POPUP_WIDTH, height));
    let area = monitor.work_area();
    let position = corner(
        (area.position.x, area.position.y),
        (area.size.width, area.size.height),
        height,
        scale,
        bottom,
    );
    let _ = window.set_position(position);
}

/// Physical top-left of the popup for a work area, pure for testing.
fn corner(
    origin: (i32, i32),
    size: (u32, u32),
    logical_height: f64,
    scale: f64,
    bottom: bool,
) -> PhysicalPosition<i32> {
    let width = (POPUP_WIDTH * scale).round() as i32;
    let height = (logical_height * scale).round() as i32;
    let margin = (EDGE_MARGIN * scale).round() as i32;

    let x = origin.0 + size.0 as i32 - width - margin;
    let y = if bottom {
        origin.1 + size.1 as i32 - height - margin
    } else {
        origin.1 + margin
    };
    PhysicalPosition::new(x.max(origin.0), y.max(origin.1))
}

#[cfg(target_os = "linux")]
mod platform {
    use std::sync::atomic::{AtomicBool, Ordering};

    use gtk::prelude::*;
    use tauri::{AppHandle, WebviewWindow};

    /// Set once the popup has become a layer surface; the compositor then owns
    /// placement and the window must not be moved.
    static LAYER_SHELL: AtomicBool = AtomicBool::new(false);

    pub fn prepare(window: &WebviewWindow) -> &'static str {
        let Ok(gtk_window) = window.gtk_window() else {
            return "GTK window unavailable";
        };
        if !gtk_window.display().backend().is_wayland() {
            return "X11, positioned in the top-right corner";
        }
        // Non-focusable windows must still accept clicks.
        gtk_window.set_accept_focus(false);

        let gtk_window: &gtk::Window = gtk_window.upcast_ref();
        match super::layer_shell::anchor_top_right(gtk_window) {
            Ok(()) => {
                // A layer surface takes its content's natural size and ignores
                // the geometry hints tao uses for min/max size. A webview's
                // natural size is next to nothing, so request the size
                // explicitly or the surface maps at 0×0.
                gtk_window.set_size_request(super::POPUP_WIDTH as i32, super::POPUP_HEIGHT as i32);
                LAYER_SHELL.store(true, Ordering::Relaxed);
                "Wayland layer-shell overlay, top-right"
            }
            Err(reason) => {
                eprintln!("[breathe] layer-shell unavailable: {reason}");
                "Wayland without layer-shell, placed by the compositor"
            }
        }
    }

    /// A layer surface sizes itself from its size request, not from tao's
    /// geometry, so lower or raise the request with the new height.
    pub fn resize(window: &WebviewWindow, height: f64) {
        if !LAYER_SHELL.load(Ordering::Relaxed) {
            return;
        }
        let target = window.clone();
        let _ = window.run_on_main_thread(move || {
            if let Ok(gtk_window) = target.gtk_window() {
                gtk_window.set_size_request(super::POPUP_WIDTH as i32, height as i32);
                gtk_window.resize(super::POPUP_WIDTH as i32, height as i32);
            }
        });
    }

    pub fn place(app: &AppHandle, window: &WebviewWindow) {
        if LAYER_SHELL.load(Ordering::Relaxed) {
            return;
        }
        // Positioning is a no-op on Wayland toplevels; it matters on X11.
        super::place_in_corner(app, window, false);
    }

    /// The window is non-focusable (`set_accept_focus(false)`), so a plain show
    /// does not take focus.
    pub fn show(window: &WebviewWindow) -> tauri::Result<()> {
        window.show()
    }

    pub fn hide(window: &WebviewWindow) -> tauri::Result<()> {
        window.hide()
    }
}

#[cfg(target_os = "windows")]
mod platform {
    use std::ffi::c_void;

    use tauri::{AppHandle, WebviewWindow};

    // Declared directly rather than through a crate: three stable user32 calls.
    #[link(name = "user32")]
    extern "system" {
        fn ShowWindow(hwnd: *mut c_void, cmd: i32) -> i32;
        fn SetWindowPos(
            hwnd: *mut c_void,
            insert_after: *mut c_void,
            x: i32,
            y: i32,
            cx: i32,
            cy: i32,
            flags: u32,
        ) -> i32;
    }

    const SW_HIDE: i32 = 0;
    const SW_SHOWNOACTIVATE: i32 = 4;
    const HWND_TOPMOST: isize = -1;
    const SWP_NOSIZE: u32 = 0x0001;
    const SWP_NOMOVE: u32 = 0x0002;
    const SWP_NOACTIVATE: u32 = 0x0010;

    pub fn prepare(window: &WebviewWindow) -> &'static str {
        // tao creates the window with a caption and applies the undecorated
        // style on its first visibility change. `show` below bypasses tao (to
        // avoid activation), so force the final style now, while hidden, by
        // toggling decorations; neither call shows or activates the window.
        let _ = window.set_decorations(true);
        let _ = window.set_decorations(false);
        "positioned in the bottom-right corner"
    }

    pub fn resize(_window: &WebviewWindow, _height: f64) {}

    pub fn place(app: &AppHandle, window: &WebviewWindow) {
        super::place_in_corner(app, window, true);
    }

    /// tao's `show` uses `SW_SHOW`, which activates the window even with
    /// `WS_EX_NOACTIVATE` and steals focus from whatever the user is typing
    /// in. Show without activating and keep the popup topmost instead.
    pub fn show(window: &WebviewWindow) -> tauri::Result<()> {
        let hwnd: *mut c_void = window.hwnd()?.0;
        // SAFETY: `hwnd` is the live top-level window owned by this process;
        // both calls only change its visibility and z-order.
        unsafe {
            ShowWindow(hwnd, SW_SHOWNOACTIVATE);
            SetWindowPos(
                hwnd,
                HWND_TOPMOST as *mut c_void,
                0,
                0,
                0,
                0,
                SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE,
            );
        }
        Ok(())
    }

    /// Mirrors `show`: tao never saw the window become visible, so its own
    /// `hide` would be a no-op.
    pub fn hide(window: &WebviewWindow) -> tauri::Result<()> {
        let hwnd: *mut c_void = window.hwnd()?.0;
        // SAFETY: as in `show`.
        unsafe {
            ShowWindow(hwnd, SW_HIDE);
        }
        Ok(())
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use objc2_app_kit::{NSColor, NSFloatingWindowLevel, NSWindow, NSWindowCollectionBehavior};
    use tauri::{AppHandle, WebviewWindow};

    /// Corner radius of the popup, matching the card on other platforms.
    const CORNER_RADIUS: f64 = 18.0;

    /// Runs `f` with the popup's NSWindow on the main thread, where AppKit
    /// must be called.
    fn with_ns_window(window: &WebviewWindow, f: impl FnOnce(&NSWindow) + Send + 'static) {
        let target = window.clone();
        let _ = window.run_on_main_thread(move || {
            if let Ok(pointer) = target.ns_window() {
                // SAFETY: Tauri returns the live NSWindow backing this
                // window, and we are on the main thread.
                let ns_window = unsafe { &*pointer.cast::<NSWindow>() };
                f(ns_window);
            }
        });
    }

    /// Floats above ordinary windows on every Space (including full-screen
    /// ones), stays put when the app is inactive, and stays out of window
    /// cycling. Without Tauri's private-API transparency the webview paints
    /// an opaque background, so the card fills the window and the window
    /// itself is rounded through its layer, with the system shadow.
    pub fn prepare(window: &WebviewWindow) -> &'static str {
        with_ns_window(window, |ns_window| {
            ns_window.setLevel(NSFloatingWindowLevel);
            ns_window.setCollectionBehavior(
                NSWindowCollectionBehavior::CanJoinAllSpaces
                    | NSWindowCollectionBehavior::FullScreenAuxiliary
                    | NSWindowCollectionBehavior::Stationary
                    | NSWindowCollectionBehavior::IgnoresCycle,
            );
            ns_window.setHidesOnDeactivate(false);
            ns_window.setOpaque(false);
            ns_window.setBackgroundColor(Some(&NSColor::clearColor()));
            ns_window.setHasShadow(true);
            if let Some(view) = ns_window.contentView() {
                view.setWantsLayer(true);
                if let Some(layer) = view.layer() {
                    layer.setCornerRadius(CORNER_RADIUS);
                    layer.setMasksToBounds(true);
                }
            }
            ns_window.invalidateShadow();
        });
        "floating, non-activating, top-right"
    }

    /// The system shadow is drawn from the window's shape; refresh it once
    /// the new size is applied.
    pub fn resize(window: &WebviewWindow, _height: f64) {
        with_ns_window(window, |ns_window| ns_window.invalidateShadow());
    }

    pub fn place(app: &AppHandle, window: &WebviewWindow) {
        // The work area already excludes the menu bar and the Dock.
        super::place_in_corner(app, window, false);
    }

    /// tao's `show` calls makeKeyAndOrderFront, which takes key focus from
    /// whatever the user is typing in. orderFrontRegardless shows the window
    /// without activating Breathe or making the popup key.
    pub fn show(window: &WebviewWindow) -> tauri::Result<()> {
        with_ns_window(window, |ns_window| ns_window.orderFrontRegardless());
        Ok(())
    }

    /// Mirrors `show`: tao never saw the window become visible.
    pub fn hide(window: &WebviewWindow) -> tauri::Result<()> {
        with_ns_window(window, |ns_window| ns_window.orderOut(None));
        Ok(())
    }
}

#[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
mod platform {
    use tauri::{AppHandle, WebviewWindow};

    pub fn prepare(_window: &WebviewWindow) -> &'static str {
        "positioned in the top-right corner"
    }

    pub fn resize(_window: &WebviewWindow, _height: f64) {}

    pub fn place(app: &AppHandle, window: &WebviewWindow) {
        super::place_in_corner(app, window, false);
    }

    pub fn show(window: &WebviewWindow) -> tauri::Result<()> {
        window.show()
    }

    pub fn hide(window: &WebviewWindow) -> tauri::Result<()> {
        window.hide()
    }
}

/// Minimal runtime binding to `libgtk-layer-shell.so.0`.
///
/// Only the handful of calls Breathe needs are resolved. Loading at runtime
/// keeps the library optional: distributions and compositors without it simply
/// get an ordinary window.
#[cfg(target_os = "linux")]
mod layer_shell {
    use std::ffi::{c_char, c_int};
    use std::sync::OnceLock;

    use gtk::glib::translate::ToGlibPtr;
    use gtk::prelude::WidgetExt;

    type GtkWindowPtr = *mut gtk::ffi::GtkWindow;

    // Enum values from gtk-layer-shell.h.
    const LAYER_OVERLAY: c_int = 3;
    const EDGE_RIGHT: c_int = 1;
    const EDGE_TOP: c_int = 2;
    const KEYBOARD_MODE_NONE: c_int = 0;
    const MARGIN: c_int = 16;

    struct Api {
        // Kept alive for the life of the process so the symbols stay valid.
        _library: libloading::Library,
        is_supported: unsafe extern "C" fn() -> c_int,
        init_for_window: unsafe extern "C" fn(GtkWindowPtr),
        set_namespace: unsafe extern "C" fn(GtkWindowPtr, *const c_char),
        set_layer: unsafe extern "C" fn(GtkWindowPtr, c_int),
        set_anchor: unsafe extern "C" fn(GtkWindowPtr, c_int, c_int),
        set_margin: unsafe extern "C" fn(GtkWindowPtr, c_int, c_int),
        set_keyboard_mode: unsafe extern "C" fn(GtkWindowPtr, c_int),
    }

    fn api() -> Result<&'static Api, String> {
        static API: OnceLock<Result<Api, String>> = OnceLock::new();
        API.get_or_init(load).as_ref().map_err(Clone::clone)
    }

    fn load() -> Result<Api, String> {
        // SAFETY: loading a well-known system library by soname; its
        // initialisers have no preconditions.
        let library = unsafe { libloading::Library::new("libgtk-layer-shell.so.0") }
            .map_err(|error| format!("libgtk-layer-shell.so.0 not found ({error})"))?;

        macro_rules! symbol {
            ($name:literal) => {
                // SAFETY: the signature matches the C declaration in
                // gtk-layer-shell.h for this symbol.
                *unsafe { library.get($name) }.map_err(|error| {
                    format!(
                        "{} is missing ({error}); gtk-layer-shell 0.7 or newer is required",
                        String::from_utf8_lossy(&$name[..$name.len() - 1])
                    )
                })?
            };
        }

        Ok(Api {
            is_supported: symbol!(b"gtk_layer_is_supported\0"),
            init_for_window: symbol!(b"gtk_layer_init_for_window\0"),
            set_namespace: symbol!(b"gtk_layer_set_namespace\0"),
            set_layer: symbol!(b"gtk_layer_set_layer\0"),
            set_anchor: symbol!(b"gtk_layer_set_anchor\0"),
            set_margin: symbol!(b"gtk_layer_set_margin\0"),
            set_keyboard_mode: symbol!(b"gtk_layer_set_keyboard_mode\0"),
            _library: library,
        })
    }

    /// Turns an unrealised window into an overlay layer surface anchored to the
    /// top-right corner with no keyboard interactivity (it never takes focus,
    /// but still receives pointer clicks).
    pub fn anchor_top_right(window: &gtk::Window) -> Result<(), String> {
        if window.is_realized() {
            return Err("the window was realised before layer-shell setup".to_string());
        }
        let api = api()?;
        // SAFETY: called on the GTK main thread with a live, unrealised
        // GtkWindow, as the library requires.
        unsafe {
            if (api.is_supported)() == 0 {
                return Err("the compositor does not support wlr-layer-shell".to_string());
            }
            let ptr: GtkWindowPtr = window.to_glib_none().0;
            (api.init_for_window)(ptr);
            (api.set_namespace)(ptr, c"breathe-popup".as_ptr());
            (api.set_layer)(ptr, LAYER_OVERLAY);
            (api.set_anchor)(ptr, EDGE_TOP, 1);
            (api.set_anchor)(ptr, EDGE_RIGHT, 1);
            (api.set_margin)(ptr, EDGE_TOP, MARGIN);
            (api.set_margin)(ptr, EDGE_RIGHT, MARGIN);
            (api.set_keyboard_mode)(ptr, KEYBOARD_MODE_NONE);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_popup_sits_in_the_top_right_corner_of_the_work_area() {
        let position = corner((0, 0), (1920, 1040), POPUP_HEIGHT, 1.0, false);
        assert_eq!(position, PhysicalPosition::new(1920 - 400 - 16, 16));
    }

    #[test]
    fn windows_uses_the_bottom_right_above_the_taskbar() {
        // A 1080p screen with a 40px taskbar: the work area ends at 1040.
        let position = corner((0, 0), (1920, 1040), POPUP_HEIGHT, 1.0, true);
        assert_eq!(
            position,
            PhysicalPosition::new(1920 - 400 - 16, 1040 - 164 - 16)
        );
    }

    #[test]
    fn a_shorter_popup_stays_on_the_taskbar_edge() {
        // Issue #17: a popup without actions is shorter, and on Windows its
        // bottom edge must stay just above the taskbar.
        let position = corner((0, 0), (1920, 1040), 120.0, 1.0, true);
        assert_eq!(
            position,
            PhysicalPosition::new(1920 - 400 - 16, 1040 - 120 - 16)
        );
    }

    #[test]
    fn the_measured_height_is_rounded_up_and_bounded() {
        assert_eq!(fit_height(119.2), 120.0);
        assert_eq!(fit_height(10.0), MIN_HEIGHT);
        assert_eq!(fit_height(5000.0), MAX_HEIGHT);
        assert_eq!(fit_height(f64::NAN), POPUP_HEIGHT);
    }

    #[test]
    fn placement_scales_with_the_monitor() {
        let position = corner((0, 0), (3840, 2160), POPUP_HEIGHT, 2.0, false);
        assert_eq!(position, PhysicalPosition::new(3840 - 800 - 32, 32));
    }

    #[test]
    fn placement_respects_a_secondary_monitor_offset() {
        let position = corner((1920, 0), (2560, 1440), POPUP_HEIGHT, 1.0, false);
        assert_eq!(position, PhysicalPosition::new(1920 + 2560 - 400 - 16, 16));
    }

    #[test]
    fn the_popup_never_leaves_a_tiny_work_area() {
        let position = corner((100, 50), (200, 100), POPUP_HEIGHT, 1.0, true);
        assert_eq!(position, PhysicalPosition::new(100, 50));
    }
}
