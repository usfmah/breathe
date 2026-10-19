//! Time sources.
//!
//! Two readings are needed:
//!
//! * a **wall clock**, because the countdown must reflect real elapsed time even
//!   while the process (or the whole machine) is not running;
//! * a **monotonic** reading, because on Linux `Instant` uses `CLOCK_MONOTONIC`,
//!   which *stops while the system is suspended*. Comparing the two is how
//!   suspend/resume is detected without platform-specific APIs.

use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

#[cfg(test)]
use std::sync::atomic::{AtomicU64, Ordering};

pub trait Clock: Send + Sync + 'static {
    /// Monotonic time since an arbitrary origin. Stops during suspend.
    fn monotonic(&self) -> Duration;
    /// Wall clock time.
    fn wall(&self) -> SystemTime;
}

#[derive(Debug)]
pub struct SystemClock {
    origin: Instant,
}

impl SystemClock {
    pub fn new() -> Self {
        Self {
            origin: Instant::now(),
        }
    }
}

impl Default for SystemClock {
    fn default() -> Self {
        Self::new()
    }
}

impl Clock for SystemClock {
    fn monotonic(&self) -> Duration {
        self.origin.elapsed()
    }

    fn wall(&self) -> SystemTime {
        SystemTime::now()
    }
}

/// Converts a wall-clock instant to Unix epoch milliseconds.
pub fn to_epoch_ms(time: SystemTime) -> i64 {
    match time.duration_since(UNIX_EPOCH) {
        Ok(elapsed) => elapsed.as_millis() as i64,
        Err(error) => -(error.duration().as_millis() as i64),
    }
}

/// Adds a duration, saturating instead of panicking on an absurd deadline.
pub fn add(time: SystemTime, delta: Duration) -> SystemTime {
    time.checked_add(delta).unwrap_or(time)
}

/// A clock the tests drive by hand.
///
/// Cloneable handle: every clone reads and writes the same underlying readings.
///
/// `advance` moves both readings (normal passage of time); `advance_wall_only`
/// moves only the wall clock, which is exactly what a suspend looks like from
/// inside the process.
#[cfg(test)]
#[derive(Debug, Clone)]
pub struct TestClock {
    inner: std::sync::Arc<TestClockInner>,
}

#[cfg(test)]
#[derive(Debug)]
struct TestClockInner {
    wall_ms: AtomicU64,
    mono_ms: AtomicU64,
}

#[cfg(test)]
impl TestClock {
    pub const EPOCH_ORIGIN_MS: u64 = 1_700_000_000_000;

    pub fn new() -> Self {
        Self {
            inner: std::sync::Arc::new(TestClockInner {
                wall_ms: AtomicU64::new(Self::EPOCH_ORIGIN_MS),
                mono_ms: AtomicU64::new(0),
            }),
        }
    }

    pub fn advance(&self, delta: Duration) {
        let ms = delta.as_millis() as u64;
        self.inner.wall_ms.fetch_add(ms, Ordering::Relaxed);
        self.inner.mono_ms.fetch_add(ms, Ordering::Relaxed);
    }

    pub fn advance_wall_only(&self, delta: Duration) {
        self.inner
            .wall_ms
            .fetch_add(delta.as_millis() as u64, Ordering::Relaxed);
    }
}

#[cfg(test)]
impl Default for TestClock {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
impl Clock for TestClock {
    fn monotonic(&self) -> Duration {
        Duration::from_millis(self.inner.mono_ms.load(Ordering::Relaxed))
    }

    fn wall(&self) -> SystemTime {
        UNIX_EPOCH + Duration::from_millis(self.inner.wall_ms.load(Ordering::Relaxed))
    }
}
