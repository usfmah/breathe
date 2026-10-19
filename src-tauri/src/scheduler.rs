//! The reminder scheduler.
//!
//! This is the single authoritative clock for the application: the webview never
//! counts down, it only renders snapshots pushed from here. That is what stops
//! re-renders or duplicate listeners from producing duplicate notifications.
//!
//! Design notes:
//!
//! * The deadline is stored as a **wall-clock** `SystemTime`, so remaining time
//!   is correct after the process is suspended or the machine sleeps.
//! * A **suspend/resume** is detected by comparing the wall-clock delta against
//!   the monotonic delta between two ticks. `CLOCK_MONOTONIC` does not advance
//!   during suspend, so a large divergence means the machine slept.
//! * Missed reminders are **never replayed**. After a long sleep the next
//!   reminder is one full interval away, so a resume cannot produce a burst.
//! * Settings are persisted; the countdown is not. `start()` always schedules a
//!   fresh interval, so a stale countdown can never be restored.

use std::time::{Duration, SystemTime};

use crate::clock::{add, to_epoch_ms, Clock};
use crate::model::{
    ReminderKind, ScheduleState, Settings, Snapshot, DEFAULT_SNOOZE_MINUTES,
};

/// How often the background worker calls [`Scheduler::tick`].
pub const TICK_INTERVAL_MS: u64 = 500;

/// Wall-clock/monotonic divergence above which we assume the machine slept.
/// Anything smaller is ordinary scheduling jitter.
pub const SUSPEND_DETECTION_THRESHOLD: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SchedulerConfig {
    pub interval: Duration,
    pub snooze: Duration,
    pub eyes_enabled: bool,
    pub movement_enabled: bool,
    pub snooze_enabled: bool,
}

impl SchedulerConfig {
    pub fn reminders_enabled(&self) -> bool {
        self.eyes_enabled || self.movement_enabled
    }
}

impl From<&Settings> for SchedulerConfig {
    fn from(settings: &Settings) -> Self {
        Self {
            interval: Duration::from_secs(u64::from(settings.interval_minutes) * 60),
            snooze: Duration::from_secs(u64::from(DEFAULT_SNOOZE_MINUTES) * 60),
            eyes_enabled: settings.eyes_enabled,
            movement_enabled: settings.movement_enabled,
            snooze_enabled: settings.snooze_enabled,
        }
    }
}

/// A reminder that has just become due.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Due {
    pub kind: ReminderKind,
    /// True when this fired at the end of a snooze window.
    pub snoozed: bool,
}

pub struct Scheduler<C: Clock> {
    clock: C,
    config: SchedulerConfig,
    state: ScheduleState,
    /// Wall-clock deadline of the next reminder. `None` when paused/stopped.
    deadline: Option<SystemTime>,
    /// Time left when the schedule was paused, restored on resume.
    frozen: Duration,
    /// The category delivered most recently, used to alternate.
    last_kind: Option<ReminderKind>,
    last_mono: Duration,
    last_wall: SystemTime,
    missed: u32,
}

impl<C: Clock> Scheduler<C> {
    pub fn new(clock: C, config: SchedulerConfig) -> Self {
        let last_mono = clock.monotonic();
        let last_wall = clock.wall();
        Self {
            clock,
            config,
            state: ScheduleState::Stopped,
            deadline: None,
            frozen: Duration::ZERO,
            last_kind: None,
            last_mono,
            last_wall,
            missed: 0,
        }
    }

    pub fn state(&self) -> ScheduleState {
        self.state
    }

    pub fn config(&self) -> SchedulerConfig {
        self.config
    }

    /// Number of reminders dropped because the machine was asleep across them.
    pub fn missed(&self) -> u32 {
        self.missed
    }

    /// Starts (or restarts) the schedule with a full interval. Never restores a
    /// previous countdown.
    pub fn start(&mut self) {
        self.state = ScheduleState::Running;
        self.frozen = Duration::ZERO;
        self.schedule_full_interval();
    }

    pub fn pause(&mut self) {
        if !matches!(self.state, ScheduleState::Running | ScheduleState::Snoozed) {
            return;
        }
        self.frozen = self.remaining().unwrap_or(Duration::ZERO);
        self.state = ScheduleState::Paused;
        self.deadline = None;
    }

    /// Resumes from a pause. If time was already up, a fresh interval is used.
    pub fn resume(&mut self) {
        if self.state != ScheduleState::Paused {
            return;
        }
        let remaining = if self.frozen.is_zero() {
            self.config.interval
        } else {
            self.frozen
        };
        self.state = ScheduleState::Running;
        self.frozen = Duration::ZERO;
        self.deadline = Some(add(self.clock.wall(), remaining));
    }

    /// Defers the next reminder by the configured snooze window. Any pending
    /// deadline is replaced, so repeated snoozes never stack up.
    pub fn snooze(&mut self) -> Result<(), String> {
        if !self.config.reminders_enabled() {
            return Err("no reminder categories are enabled".to_string());
        }
        if !self.config.snooze_enabled {
            return Err("snoozing is turned off in settings".to_string());
        }
        self.state = ScheduleState::Snoozed;
        self.frozen = Duration::ZERO;
        self.deadline = Some(add(self.clock.wall(), self.config.snooze));
        Ok(())
    }

    /// Terminal state reached while the application is shutting down.
    pub fn stop(&mut self) {
        self.state = ScheduleState::Stopped;
        self.deadline = None;
        self.frozen = Duration::ZERO;
    }

    /// Starts or pauses the schedule.
    ///
    /// Starting always hands back a full interval, and pausing from a stopped
    /// schedule is normalised to *paused* rather than *quit* — "quit" only ever
    /// means the process is going away.
    pub fn set_running(&mut self, running: bool) {
        match (running, self.state) {
            (true, ScheduleState::Running) | (false, ScheduleState::Paused) => {}
            (true, _) => self.start(),
            (false, _) => {
                if self.state == ScheduleState::Stopped {
                    self.start();
                }
                self.pause();
            }
        }
    }

    /// Replaces the configuration. Changing the interval restarts the countdown
    /// so the next deadline is predictable.
    pub fn set_config(&mut self, config: SchedulerConfig) {
        let interval_changed = config.interval != self.config.interval;
        self.config = config;

        if !interval_changed {
            return;
        }

        match self.state {
            ScheduleState::Running | ScheduleState::Snoozed => {
                self.state = ScheduleState::Running;
                self.frozen = Duration::ZERO;
                self.schedule_full_interval();
            }
            // Keep the paused state but hand back a full interval on resume.
            ScheduleState::Paused => self.frozen = self.config.interval,
            ScheduleState::Stopped => {}
        }
    }

    /// The category that will be delivered next.
    pub fn next_kind(&self) -> Option<ReminderKind> {
        match (self.config.eyes_enabled, self.config.movement_enabled) {
            (false, false) => None,
            (true, false) => Some(ReminderKind::Eyes),
            (false, true) => Some(ReminderKind::Movement),
            // Both on: alternate, starting with an eye rest.
            (true, true) => Some(match self.last_kind {
                Some(ReminderKind::Eyes) => ReminderKind::Movement,
                _ => ReminderKind::Eyes,
            }),
        }
    }

    /// Advances the schedule. Returns a reminder when one is due right now.
    ///
    /// At most one `Due` is returned per deadline, because firing always
    /// reschedules the next deadline.
    pub fn tick(&mut self) -> Option<Due> {
        let now_wall = self.clock.wall();
        let now_mono = self.clock.monotonic();

        let wall_delta = now_wall
            .duration_since(self.last_wall)
            .unwrap_or(Duration::ZERO);
        let mono_delta = now_mono.saturating_sub(self.last_mono);
        let slept = wall_delta.abs_diff(mono_delta) > SUSPEND_DETECTION_THRESHOLD;
        self.last_wall = now_wall;
        self.last_mono = now_mono;

        if !matches!(self.state, ScheduleState::Running | ScheduleState::Snoozed) {
            return None;
        }

        let deadline = self.deadline?;
        if now_wall < deadline {
            return None;
        }

        let was_snoozed = self.state == ScheduleState::Snoozed;
        self.state = ScheduleState::Running;

        if slept {
            // The deadline passed while the machine was asleep. Drop it rather
            // than replaying it, and give the user a full interval from now.
            self.missed = self.missed.saturating_add(1);
            self.schedule_full_interval();
            return None;
        }

        let kind = self.next_kind();
        if let Some(kind) = kind {
            self.last_kind = Some(kind);
        }
        self.schedule_full_interval();

        kind.map(|kind| Due {
            kind,
            snoozed: was_snoozed,
        })
    }

    /// Current view of the schedule for the UI.
    pub fn snapshot(&self, window_hidden: bool) -> Snapshot {
        let (remaining, total, next_at) = match self.state {
            ScheduleState::Running => (
                self.remaining().unwrap_or(self.config.interval),
                self.config.interval,
                self.deadline,
            ),
            ScheduleState::Snoozed => (
                self.remaining().unwrap_or(self.config.snooze),
                self.config.snooze,
                self.deadline,
            ),
            ScheduleState::Paused => (self.frozen, self.config.interval, None),
            ScheduleState::Stopped => (Duration::ZERO, self.config.interval, None),
        };

        let fraction = if total.is_zero() {
            0.0
        } else {
            (remaining.as_secs_f64() / total.as_secs_f64()).clamp(0.0, 1.0)
        };

        Snapshot {
            state: self.state,
            window_hidden,
            interval_minutes: (self.config.interval.as_secs() / 60) as u32,
            remaining_ms: remaining.as_millis() as i64,
            remaining_fraction: fraction,
            next_kind: self.next_kind(),
            next_at_ms: next_at.map(to_epoch_ms),
            snooze_remaining_ms: (self.state == ScheduleState::Snoozed)
                .then(|| remaining.as_millis() as i64),
        }
    }

    fn schedule_full_interval(&mut self) {
        self.deadline = Some(add(self.clock.wall(), self.config.interval));
    }

    fn remaining(&self) -> Option<Duration> {
        let deadline = self.deadline?;
        Some(
            deadline
                .duration_since(self.clock.wall())
                .unwrap_or(Duration::ZERO),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clock::TestClock;

    fn minutes(value: u64) -> Duration {
        Duration::from_secs(value * 60)
    }

    fn config() -> SchedulerConfig {
        SchedulerConfig {
            interval: minutes(45),
            snooze: minutes(5),
            eyes_enabled: true,
            movement_enabled: true,
            snooze_enabled: true,
        }
    }

    fn setup() -> (TestClock, Scheduler<TestClock>) {
        let clock = TestClock::new();
        let scheduler = Scheduler::new(clock.clone(), config());
        (clock, scheduler)
    }

    #[test]
    fn a_fresh_scheduler_is_stopped_and_schedules_nothing() {
        let (_clock, scheduler) = setup();
        assert_eq!(scheduler.state(), ScheduleState::Stopped);
        assert_eq!(scheduler.snapshot(false).next_at_ms, None);
        assert_eq!(scheduler.snapshot(false).remaining_ms, 0);
    }

    #[test]
    fn start_schedules_one_full_interval_and_starts_with_an_eye_rest() {
        let (_clock, mut scheduler) = setup();
        scheduler.start();

        let snapshot = scheduler.snapshot(false);
        assert_eq!(snapshot.state, ScheduleState::Running);
        assert_eq!(snapshot.remaining_ms, 45 * 60 * 1000);
        assert_eq!(snapshot.interval_minutes, 45);
        assert_eq!(snapshot.next_kind, Some(ReminderKind::Eyes));
        assert_eq!(snapshot.remaining_fraction, 1.0);
        assert!(snapshot.next_at_ms.is_some());
    }

    #[test]
    fn nothing_is_due_before_the_deadline() {
        let (clock, mut scheduler) = setup();
        scheduler.start();

        clock.advance(minutes(44));
        assert_eq!(scheduler.tick(), None);

        let snapshot = scheduler.snapshot(false);
        assert_eq!(snapshot.remaining_ms, 60 * 1000);
        assert!((snapshot.remaining_fraction - 1.0 / 45.0).abs() < 1e-9);
    }

    #[test]
    fn a_reminder_fires_at_the_deadline_and_never_twice() {
        let (clock, mut scheduler) = setup();
        scheduler.start();
        clock.advance(minutes(45));

        assert_eq!(
            scheduler.tick(),
            Some(Due {
                kind: ReminderKind::Eyes,
                snoozed: false
            })
        );

        // The deadline was replaced, so further ticks stay quiet.
        for _ in 0..20 {
            assert_eq!(scheduler.tick(), None);
        }
        assert_eq!(scheduler.snapshot(false).remaining_ms, 45 * 60 * 1000);
    }

    #[test]
    fn categories_alternate_when_both_are_enabled() {
        let (clock, mut scheduler) = setup();
        scheduler.start();

        let mut delivered = Vec::new();
        for _ in 0..4 {
            clock.advance(minutes(45));
            let due = scheduler.tick().expect("a reminder is due");
            delivered.push(due.kind);
        }

        assert_eq!(
            delivered,
            vec![
                ReminderKind::Eyes,
                ReminderKind::Movement,
                ReminderKind::Eyes,
                ReminderKind::Movement
            ]
        );
    }

    #[test]
    fn the_enabled_category_is_used_every_time_when_only_one_is_on() {
        let (clock, mut scheduler) = setup();
        let mut config = config();
        config.eyes_enabled = false;
        scheduler.set_config(config);
        scheduler.start();

        for _ in 0..3 {
            clock.advance(minutes(45));
            let due = scheduler.tick().expect("a reminder is due");
            assert_eq!(due.kind, ReminderKind::Movement);
        }
        assert_eq!(scheduler.snapshot(false).next_kind, Some(ReminderKind::Movement));
    }

    #[test]
    fn nothing_is_delivered_when_every_category_is_off() {
        let (clock, mut scheduler) = setup();
        let mut config = config();
        config.eyes_enabled = false;
        config.movement_enabled = false;
        scheduler.set_config(config);
        scheduler.start();

        assert_eq!(scheduler.snapshot(false).next_kind, None);

        for _ in 0..3 {
            clock.advance(minutes(45));
            assert_eq!(scheduler.tick(), None);
        }
        // The cycle still runs, so re-enabling a category behaves predictably.
        assert_eq!(scheduler.state(), ScheduleState::Running);
        assert_eq!(scheduler.snapshot(false).remaining_ms, 45 * 60 * 1000);
    }

    #[test]
    fn pausing_freezes_the_countdown_and_suspends_delivery() {
        let (clock, mut scheduler) = setup();
        scheduler.start();
        clock.advance(minutes(30));

        scheduler.pause();
        let paused = scheduler.snapshot(false);
        assert_eq!(paused.state, ScheduleState::Paused);
        assert_eq!(paused.remaining_ms, 15 * 60 * 1000);
        assert_eq!(paused.next_at_ms, None, "nothing is scheduled while paused");

        // Well past the original deadline, still nothing happens.
        clock.advance(minutes(120));
        assert_eq!(scheduler.tick(), None);
        assert_eq!(scheduler.snapshot(false).remaining_ms, 15 * 60 * 1000);
    }

    #[test]
    fn resuming_continues_the_remaining_time() {
        let (clock, mut scheduler) = setup();
        scheduler.start();
        clock.advance(minutes(30));
        scheduler.pause();
        clock.advance(minutes(10));

        scheduler.resume();
        assert_eq!(scheduler.snapshot(false).remaining_ms, 15 * 60 * 1000);

        clock.advance(minutes(15));
        assert_eq!(
            scheduler.tick(),
            Some(Due {
                kind: ReminderKind::Eyes,
                snoozed: false
            })
        );
    }

    #[test]
    fn resuming_after_the_remaining_time_elapsed_uses_a_full_interval() {
        let (clock, mut scheduler) = setup();
        scheduler.start();
        clock.advance(minutes(45));
        scheduler.pause();
        assert_eq!(scheduler.snapshot(false).remaining_ms, 0);

        scheduler.resume();
        assert_eq!(scheduler.snapshot(false).remaining_ms, 45 * 60 * 1000);
    }

    #[test]
    fn snoozing_schedules_exactly_one_reminder_five_minutes_later() {
        let (clock, mut scheduler) = setup();
        scheduler.start();
        scheduler.snooze().expect("snooze is allowed");

        let snoozed = scheduler.snapshot(false);
        assert_eq!(snoozed.state, ScheduleState::Snoozed);
        assert_eq!(snoozed.remaining_ms, 5 * 60 * 1000);
        assert_eq!(snoozed.snooze_remaining_ms, Some(5 * 60 * 1000));

        clock.advance(minutes(5));
        let due = scheduler.tick().expect("the snoozed reminder fires");
        assert!(due.snoozed);
        assert_eq!(due.kind, ReminderKind::Eyes);

        assert_eq!(scheduler.tick(), None);
        assert_eq!(scheduler.state(), ScheduleState::Running);
        assert_eq!(scheduler.snapshot(false).remaining_ms, 45 * 60 * 1000);
    }

    #[test]
    fn snoozing_twice_does_not_queue_two_reminders() {
        let (clock, mut scheduler) = setup();
        scheduler.start();

        clock.advance(minutes(2));
        scheduler.snooze().expect("snooze is allowed");
        clock.advance(minutes(4));
        scheduler.snooze().expect("snooze is allowed");

        // The second snooze replaced the first deadline.
        assert_eq!(scheduler.snapshot(false).remaining_ms, 5 * 60 * 1000);
        clock.advance(minutes(3));
        assert_eq!(scheduler.tick(), None);

        clock.advance(minutes(2));
        assert!(scheduler.tick().is_some());
        assert_eq!(scheduler.tick(), None);
    }

    #[test]
    fn snoozing_is_refused_when_disabled_or_when_nothing_is_enabled() {
        let (_clock, mut scheduler) = setup();
        let mut no_snooze = config();
        no_snooze.snooze_enabled = false;
        scheduler.set_config(no_snooze);
        scheduler.start();
        assert!(scheduler.snooze().is_err());

        let mut quiet = config();
        quiet.eyes_enabled = false;
        quiet.movement_enabled = false;
        scheduler.set_config(quiet);
        assert!(scheduler.snooze().is_err());
    }

    #[test]
    fn changing_the_interval_while_running_restarts_the_countdown() {
        let (clock, mut scheduler) = setup();
        scheduler.start();
        clock.advance(minutes(30));
        assert_eq!(scheduler.snapshot(false).remaining_ms, 15 * 60 * 1000);

        let mut config = config();
        config.interval = minutes(20);
        scheduler.set_config(config);

        let snapshot = scheduler.snapshot(false);
        assert_eq!(snapshot.interval_minutes, 20);
        assert_eq!(snapshot.remaining_ms, 20 * 60 * 1000);

        clock.advance(minutes(20));
        assert!(scheduler.tick().is_some());
    }

    #[test]
    fn changing_the_interval_while_snoozed_cancels_the_snooze() {
        let (_clock, mut scheduler) = setup();
        scheduler.start();
        scheduler.snooze().expect("snooze is allowed");

        let mut config = config();
        config.interval = minutes(60);
        scheduler.set_config(config);

        let snapshot = scheduler.snapshot(false);
        assert_eq!(snapshot.state, ScheduleState::Running);
        assert_eq!(snapshot.remaining_ms, 60 * 60 * 1000);
        assert_eq!(snapshot.snooze_remaining_ms, None);
    }

    #[test]
    fn changing_the_interval_while_paused_is_applied_on_resume() {
        let (clock, mut scheduler) = setup();
        scheduler.start();
        clock.advance(minutes(30));
        scheduler.pause();

        let mut config = config();
        config.interval = minutes(20);
        scheduler.set_config(config);

        assert_eq!(scheduler.snapshot(false).remaining_ms, 20 * 60 * 1000);
        scheduler.resume();
        assert_eq!(scheduler.snapshot(false).remaining_ms, 20 * 60 * 1000);
    }

    #[test]
    fn toggling_snooze_or_categories_does_not_move_the_deadline() {
        let (clock, mut scheduler) = setup();
        scheduler.start();
        clock.advance(minutes(10));
        let before = scheduler.snapshot(false).next_at_ms;

        let mut config = config();
        config.snooze_enabled = false;
        config.movement_enabled = false;
        scheduler.set_config(config);

        assert_eq!(scheduler.snapshot(false).next_at_ms, before);
        assert_eq!(scheduler.snapshot(false).remaining_ms, 35 * 60 * 1000);
    }

    #[test]
    fn a_suspend_across_the_deadline_drops_it_instead_of_bursting() {
        let (clock, mut scheduler) = setup();
        scheduler.start();

        // 90 minutes of wall-clock time pass, but only a second of monotonic
        // time: the machine was asleep.
        clock.advance_wall_only(minutes(90));
        clock.advance(Duration::from_secs(1));

        assert_eq!(scheduler.tick(), None, "no burst of missed reminders");
        assert_eq!(scheduler.missed(), 1);

        let snapshot = scheduler.snapshot(false);
        assert_eq!(snapshot.state, ScheduleState::Running);
        assert_eq!(snapshot.remaining_ms, 45 * 60 * 1000);

        // And the schedule keeps working normally afterwards.
        clock.advance(minutes(45));
        assert!(scheduler.tick().is_some());
    }

    #[test]
    fn a_suspend_shorter_than_the_deadline_keeps_the_deadline() {
        let (clock, mut scheduler) = setup();
        scheduler.start();

        // Ten minutes of wall-clock time pass while the machine sleeps, but the
        // monotonic reading does not move at all: CLOCK_MONOTONIC pauses during
        // suspend. That divergence is the signal.
        clock.advance_wall_only(minutes(10));
        scheduler.tick();

        // The deadline is still in the future, so it is kept — the countdown is
        // simply recalculated against the wall clock.
        assert_eq!(scheduler.snapshot(false).remaining_ms, 35 * 60 * 1000);
        assert_eq!(scheduler.missed(), 0);

        clock.advance(minutes(35));
        assert!(scheduler.tick().is_some());
    }

    #[test]
    fn resuming_from_suspend_recalculates_the_remaining_time() {
        let (clock, mut scheduler) = setup();
        scheduler.start();

        // Sleep for 40 minutes: the deadline is now 5 minutes in the future.
        clock.advance_wall_only(minutes(40));
        scheduler.tick();

        assert_eq!(scheduler.snapshot(false).remaining_ms, 5 * 60 * 1000);

        clock.advance(minutes(5));
        assert!(scheduler.tick().is_some());
    }

    #[test]
    fn stopped_schedules_never_fire() {
        let (clock, mut scheduler) = setup();
        scheduler.start();
        scheduler.stop();

        assert_eq!(scheduler.state(), ScheduleState::Stopped);
        clock.advance(minutes(200));
        assert_eq!(scheduler.tick(), None);
        let snapshot = scheduler.snapshot(false);
        assert_eq!(snapshot.next_at_ms, None);
        assert_eq!(snapshot.remaining_ms, 0);
    }

    #[test]
    fn starting_again_never_restores_a_stale_countdown() {
        let (clock, mut scheduler) = setup();
        scheduler.start();
        clock.advance(minutes(44));

        // Simulate a restart: a brand new scheduler must not resume at 1 minute.
        let fresh = Scheduler::new(clock.clone(), config());
        assert_eq!(fresh.snapshot(false).remaining_ms, 0);

        let mut fresh = fresh;
        fresh.start();
        assert_eq!(fresh.snapshot(false).remaining_ms, 45 * 60 * 1000);
    }

    #[test]
    fn window_visibility_is_tracked_separately_from_the_schedule() {
        let (_clock, mut scheduler) = setup();
        scheduler.start();

        let hidden = scheduler.snapshot(true);
        assert!(hidden.window_hidden);
        assert_eq!(hidden.state, ScheduleState::Running);

        scheduler.pause();
        let paused_and_hidden = scheduler.snapshot(true);
        assert!(paused_and_hidden.window_hidden);
        assert_eq!(paused_and_hidden.state, ScheduleState::Paused);
    }

    #[test]
    fn config_is_derived_from_settings() {
        let settings = Settings {
            interval_minutes: 30,
            eyes_enabled: false,
            movement_enabled: true,
            snooze_enabled: false,
            ..Settings::default()
        };
        let config = SchedulerConfig::from(&settings);

        assert_eq!(config.interval, minutes(30));
        assert_eq!(config.snooze, minutes(u64::from(DEFAULT_SNOOZE_MINUTES)));
        assert!(config.reminders_enabled());
        assert!(!config.snooze_enabled);
    }
}
