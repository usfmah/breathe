//! Breathe — a calm, minimal movement and eye-rest reminder.
//!
//! Architecture in one paragraph: the webview is a pure view. It renders
//! `breathe://snapshot` events and forwards user intent through a small,
//! validated command surface. The only thing that decides *when* a reminder
//! happens is [`scheduler::Scheduler`], owned here and driven by a single
//! background thread. That is what makes duplicate notifications impossible:
//! there is exactly one clock, and it does not care how many times React
//! re-renders.

mod autostart;
mod clock;
mod commands;
mod i18n;
mod model;
mod notify;
mod popup;
mod popup_window;
mod scheduler;
mod settings_store;
mod theme;
mod tray;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime};

use tauri::Manager;

use clock::SystemClock;
use model::{ScheduleState, Settings, Snapshot};
use popup::{PopupChange, PopupContent, PopupManager};
use scheduler::{Event, Scheduler, SchedulerConfig, TICK_INTERVAL_MS};

/// Shared, application-wide state. All of it hangs off a single `manage` call.
pub struct AppState {
    pub scheduler: Mutex<Scheduler<SystemClock>>,
    pub settings: Mutex<Settings>,
    /// Whether the main window is currently hidden. Orthogonal to the schedule.
    hidden: AtomicBool,
    tray: Mutex<Option<Arc<tray::TrayHandles>>>,
    stop_worker: Mutex<Option<Sender<()>>>,
    popup: Mutex<PopupManager>,
}

impl AppState {
    pub fn new(settings: Settings) -> Self {
        let mut scheduler = Scheduler::new(SystemClock::new(), SchedulerConfig::from(&settings));

        // A fresh scheduler starts in the Stopped state, which the UI reports as
        // "quit". On launch the app is never quitting, so it either runs or is
        // explicitly paused. Either way the countdown starts from a full
        // interval — a stale deadline from a previous run is never restored.
        scheduler.start();
        if !settings.start_running {
            scheduler.set_running(false);
        }

        Self {
            scheduler: Mutex::new(scheduler),
            settings: Mutex::new(settings),
            hidden: AtomicBool::new(false),
            tray: Mutex::new(None),
            stop_worker: Mutex::new(None),
            popup: Mutex::new(PopupManager::new()),
        }
    }

    pub fn current_settings(&self) -> Settings {
        self.settings
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }

    pub fn snapshot(&self) -> Snapshot {
        let hidden = self.hidden.load(Ordering::Relaxed);
        self.scheduler
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .snapshot(hidden)
    }

    pub fn set_hidden(&self, hidden: bool) {
        self.hidden.store(hidden, Ordering::Relaxed);
    }

    pub fn install_tray(&self, handles: tray::TrayHandles) {
        *self
            .tray
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(Arc::new(handles));
    }

    pub fn set_stop_worker(&self, sender: Sender<()>) {
        *self
            .stop_worker
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(sender);
    }

    /// Runs `f` against the popup manager. The lock is released before the
    /// caller touches the window, so window calls never run under it.
    pub fn with_popup<T>(&self, f: impl FnOnce(&mut PopupManager) -> T) -> T {
        let mut popup = self
            .popup
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        f(&mut popup)
    }

    pub fn stop_worker(&self) {
        let sender = self
            .stop_worker
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .take();
        if let Some(sender) = sender {
            let _ = sender.send(());
        }
    }
}

/// A second launch that arrived before setup finished.
///
/// Tauri creates the configured windows (WebView2 can take several seconds on
/// its first start after an install) before it runs our setup, and the
/// single-instance plugin is already listening during that time. Launching
/// Breathe again then reached `show_main_window` before `AppState` existed and
/// panicked ("state() called before manage()"). The request is remembered here
/// and honoured at the end of setup instead.
static SHOW_REQUESTED_BEFORE_SETUP: AtomicBool = AtomicBool::new(false);

/// Handles a second launch: show the window now if setup is done, otherwise
/// once it is.
fn request_show_main_window(app: &tauri::AppHandle) {
    if app.try_state::<AppState>().is_some() {
        commands::show_main_window(app);
        return;
    }
    SHOW_REQUESTED_BEFORE_SETUP.store(true, Ordering::SeqCst);
    // Setup may have registered the state between the check and the store;
    // if so, it may already have read the flag, so act on it here.
    if app.try_state::<AppState>().is_some()
        && SHOW_REQUESTED_BEFORE_SETUP.swap(false, Ordering::SeqCst)
    {
        commands::show_main_window(app);
    }
}

/// True when the app was started by the autostart entry, or explicitly hidden.
fn launched_hidden() -> bool {
    std::env::args().any(|argument| argument == autostart::AUTOSTART_FLAG || argument == "--hidden")
}

/// The one and only tick loop.
///
/// It sleeps on a channel rather than a bare `sleep`, so quitting is immediate
/// and no tick can run against a torn-down app.
fn spawn_worker(app: tauri::AppHandle, receiver: Receiver<()>) {
    let worker = std::thread::Builder::new()
        .name("breathe-scheduler".to_string())
        .spawn(move || loop {
            match receiver.recv_timeout(Duration::from_millis(TICK_INTERVAL_MS)) {
                Ok(()) | Err(mpsc::RecvTimeoutError::Disconnected) => break,
                Err(mpsc::RecvTimeoutError::Timeout) => {}
            }

            let event = {
                let state = app.state::<AppState>();
                let mut scheduler = match state.scheduler.lock() {
                    Ok(scheduler) => scheduler,
                    Err(poisoned) => poisoned.into_inner(),
                };

                if scheduler.state() == ScheduleState::Stopped {
                    break;
                }

                scheduler.tick()
            };

            match event {
                Some(Event::ReminderDue { reminder, snoozed }) => {
                    let delivered = if popup_window::available(&app) {
                        show_popup(&app, PopupContent::Reminder { reminder });
                        Ok(())
                    } else {
                        let language = app.state::<AppState>().current_settings().language;
                        notify::deliver(&app, language, reminder.kind)
                    };
                    match delivered {
                        Ok(()) => eprintln!(
                            "[breathe] reminder {} delivered: {:?}{}",
                            reminder.id,
                            reminder.kind,
                            if snoozed { " (snoozed)" } else { "" }
                        ),
                        Err(error) => eprintln!(
                            "[breathe] could not deliver the {:?} reminder: {error}",
                            reminder.kind
                        ),
                    }
                }
                Some(Event::BreakEnded { kind }) => {
                    if popup_window::available(&app) {
                        show_popup(&app, PopupContent::BreakOver { kind });
                    } else if let Err(error) = notify::deliver_break_over(
                        &app,
                        app.state::<AppState>().current_settings().language,
                    ) {
                        eprintln!(
                            "[breathe] could not announce the end of the {kind:?} break: {error}"
                        );
                    }
                }
                None => {}
            }

            let snapshot = commands::emit_snapshot(&app);
            let change = app
                .state::<AppState>()
                .with_popup(|popup| popup.reconcile(&snapshot, SystemTime::now()));
            if let Some(change) = change {
                popup_window::apply(&app, change);
            }
            commands::sync_tray(&app, &snapshot);
        });

    if let Err(error) = worker {
        eprintln!("[breathe] could not start the scheduler thread: {error}");
    }
}

/// Shows Breathe's popup with `content`, unless that exact reminder is already
/// on screen.
pub(crate) fn show_popup(app: &tauri::AppHandle, content: PopupContent) {
    let change = app
        .state::<AppState>()
        .with_popup(|popup| popup.show(content, SystemTime::now()));
    if let Some(change @ PopupChange::Show(_)) = change {
        popup_window::apply(app, change);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Single instance must be registered first so a second launch is
        // redirected before any other plugin touches the settings store.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            request_show_main_window(app);
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .args([autostart::AUTOSTART_FLAG])
                .app_name("Breathe")
                .build(),
        )
        .setup(|app| {
            let handle = app.handle().clone();

            let settings = settings_store::load(&handle);
            app.manage(AppState::new(settings.clone()));

            // A second launch while the windows were being created means the
            // user is waiting for the window, even if this one was autostarted.
            let launch_hidden =
                launched_hidden() && !SHOW_REQUESTED_BEFORE_SETUP.swap(false, Ordering::SeqCst);
            app.state::<AppState>().set_hidden(launch_hidden);

            if let Some(window) = app.get_webview_window(theme::MAIN_WINDOW) {
                commands::attach_close_behaviour(&window);
                if !launch_hidden {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }

            theme::apply(&handle, settings.theme);

            // Created hidden and reused. If it cannot be created, reminders
            // fall back to native notifications.
            if let Err(error) = popup_window::create(&handle, settings.language) {
                eprintln!("[breathe] {error}; using native notifications instead");
            }

            match tray::build(&handle, settings.language) {
                Ok(handles) => app.state::<AppState>().install_tray(handles),
                Err(error) => eprintln!(
                    "[breathe] system tray unavailable: {error}\n\
                     \x20        The window and notifications still work; use Quit from Settings."
                ),
            }

            let (sender, receiver) = mpsc::channel();
            app.state::<AppState>().set_stop_worker(sender);
            spawn_worker(handle.clone(), receiver);

            commands::emit_snapshot(&handle);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::get_snapshot,
            commands::get_notification_status,
            commands::get_autostart_status,
            commands::get_app_info,
            commands::save_settings,
            commands::pause_reminders,
            commands::resume_reminders,
            commands::snooze_reminders,
            commands::take_break,
            commands::get_popup,
            commands::dismiss_popup,
            commands::send_test_notification,
            commands::set_autostart,
            commands::hide_window,
            commands::minimize_window,
            commands::open_settings,
            commands::quit_app,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Breathe")
        .run(on_run_event);
}

/// App-level events.
///
/// * `Exit` covers every way out that does not go through Quit — notably ⌘Q
///   from the default macOS app menu — so the scheduler always stops cleanly.
/// * `Reopen` (macOS) fires when the Dock icon is clicked; with the window
///   hidden to the background, that should bring it back.
fn on_run_event(app: &tauri::AppHandle, event: tauri::RunEvent) {
    match event {
        tauri::RunEvent::Exit => {
            if let Some(state) = app.try_state::<AppState>() {
                if let Ok(mut scheduler) = state.scheduler.lock() {
                    scheduler.stop();
                }
                state.stop_worker();
            }
        }
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Reopen { .. } => commands::show_main_window(app),
        _ => {}
    }
}
