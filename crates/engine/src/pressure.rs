//! Process-global memory budget: hand memo caps, admission gate, and pressure
//! valve (squeeze → park) for shared machines.

use serde::Serialize;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex, OnceLock};
use std::thread;
use std::time::Duration;

/// Default peak RSS budget for one Monte Carlo / oracle hand (MiB).
pub const DEFAULT_HAND_MEM_MB: u64 = 3072;

/// Approximate bytes per memo entry (State key + MemoValue + hashbrown overhead).
/// Calibrated against ~1.08M entries ≈ 833 MiB (~770 B/entry); use 768 for a
/// slightly conservative entry count under a given MiB budget.
const BYTES_PER_MEMO_ENTRY: u64 = 768;

/// Cap multiplier in basis points (10_000 = 100%).
const MULTIPLIER_FULL: u32 = 10_000;
const MULTIPLIER_SQUEEZE: u32 = 5_000;
const MULTIPLIER_HARD_SQUEEZE: u32 = 2_500;

/// How long the admission gate waits between free-RAM rechecks.
const GATE_WAIT: Duration = Duration::from_millis(500);

/// Pressure monitor poll interval.
const MONITOR_INTERVAL: Duration = Duration::from_secs(1);

/// Extra headroom when clearing a pressure tier (hysteresis).
const HYSTERESIS_MB: u64 = 512;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PressureLevel {
    Clear,
    Squeeze,
    Parked,
}

#[derive(Clone, Copy, Debug)]
pub struct MemoryConfig {
    pub hand_mem_mb: u64,
    pub reserve_mb: u64,
    pub park_mb: u64,
    pub total_mb: Option<u64>,
}

impl MemoryConfig {
    fn from_env() -> Self {
        let total_mb = env_u64("GA_FIRE_MEM_TOTAL_MB").or_else(detect_total_mb);
        let hand_mem_mb = env_u64("GA_FIRE_HAND_MEM_MB")
            .unwrap_or(DEFAULT_HAND_MEM_MB)
            .max(256);
        let reserve_mb = env_u64("GA_FIRE_MEM_RESERVE_MB").unwrap_or_else(|| match total_mb {
            Some(total) => (total / 16).max(2048),
            None => 2048,
        });
        let park_mb = env_u64("GA_FIRE_MEM_PARK_MB").unwrap_or_else(|| match total_mb {
            Some(total) => (total / 32).max(1024),
            None => 1024,
        });
        Self {
            hand_mem_mb,
            reserve_mb,
            park_mb,
            total_mb,
        }
    }
}

fn env_u64(key: &str) -> Option<u64> {
    std::env::var(key)
        .ok()
        .and_then(|value| value.parse().ok())
        .filter(|&n| n > 0)
}

fn detect_total_mb() -> Option<u64> {
    cgroup_limit_bytes()
        .map(|bytes| bytes / (1024 * 1024))
        .or_else(proc_meminfo_total_mb)
}

fn cgroup_limit_bytes() -> Option<u64> {
    if let Ok(raw) = std::fs::read_to_string("/sys/fs/cgroup/memory.max") {
        return parse_cgroup_v2_limit(&raw);
    }
    if let Ok(raw) = std::fs::read_to_string("/sys/fs/cgroup/memory/memory.limit_in_bytes") {
        return parse_cgroup_v1_limit(&raw);
    }
    None
}

fn parse_cgroup_v2_limit(raw: &str) -> Option<u64> {
    let raw = raw.trim();
    if raw == "max" {
        return None;
    }
    raw.parse().ok()
}

fn parse_cgroup_v1_limit(raw: &str) -> Option<u64> {
    let bytes: u64 = raw.trim().parse().ok()?;
    (bytes < (1 << 60)).then_some(bytes)
}

fn proc_meminfo_total_mb() -> Option<u64> {
    proc_meminfo_field_mb("MemTotal:")
}

pub(crate) fn mem_available_mb() -> Option<u64> {
    cgroup_available_mb().or_else(|| proc_meminfo_field_mb("MemAvailable:"))
}

fn cgroup_available_mb() -> Option<u64> {
    static LIMIT: OnceLock<Option<u64>> = OnceLock::new();
    let limit = (*LIMIT.get_or_init(cgroup_limit_bytes))?;
    let current = cgroup_current_bytes().unwrap_or(0);
    Some(limit.saturating_sub(current) / (1024 * 1024))
}

fn cgroup_current_bytes() -> Option<u64> {
    if let Ok(raw) = std::fs::read_to_string("/sys/fs/cgroup/memory.current") {
        return raw.trim().parse().ok();
    }
    if let Ok(raw) = std::fs::read_to_string("/sys/fs/cgroup/memory/memory.usage_in_bytes") {
        return raw.trim().parse().ok();
    }
    None
}

fn proc_meminfo_field_mb(field: &str) -> Option<u64> {
    let status = std::fs::read_to_string("/proc/meminfo").ok()?;
    for line in status.lines() {
        let Some(rest) = line.strip_prefix(field) else {
            continue;
        };
        let kb: u64 = rest.split_whitespace().next()?.parse().ok()?;
        return Some(kb / 1024);
    }
    None
}

/// Process-wide memory config (env + detection), initialized once.
pub fn memory_config() -> MemoryConfig {
    static CONFIG: OnceLock<MemoryConfig> = OnceLock::new();
    *CONFIG.get_or_init(MemoryConfig::from_env)
}

/// Base memo entry cap for one heavy hand.
pub fn memo_cap_entries() -> usize {
    static CAP: OnceLock<usize> = OnceLock::new();
    *CAP.get_or_init(|| {
        let mb = memory_config().hand_mem_mb;
        let entries = (mb * 1_048_576) / BYTES_PER_MEMO_ENTRY;
        usize::try_from(entries.max(16_384)).unwrap_or(usize::MAX)
    })
}

/// Global squeeze multiplier (basis points). Search reads this on each insert.
static CAP_MULTIPLIER_BP: AtomicU32 = AtomicU32::new(MULTIPLIER_FULL);

/// Effective memo entry limit under current squeeze pressure.
pub fn effective_memo_cap(base: usize) -> usize {
    let bp = CAP_MULTIPLIER_BP.load(Ordering::Relaxed);
    let scaled = (base as u128 * u128::from(bp)) / u128::from(MULTIPLIER_FULL);
    usize::try_from(scaled).unwrap_or(base).max(1)
}

static PARK_FLAG: AtomicBool = AtomicBool::new(false);
static PARK_LOCK: Mutex<()> = Mutex::new(());
static PARK_CV: Condvar = Condvar::new();

static CURRENT_LEVEL: AtomicU64 = AtomicU64::new(0); // 0=Clear, 1=Squeeze, 2=Parked

fn level_to_u64(level: PressureLevel) -> u64 {
    match level {
        PressureLevel::Clear => 0,
        PressureLevel::Squeeze => 1,
        PressureLevel::Parked => 2,
    }
}

fn u64_to_level(raw: u64) -> PressureLevel {
    match raw {
        1 => PressureLevel::Squeeze,
        2 => PressureLevel::Parked,
        _ => PressureLevel::Clear,
    }
}

/// Current process-wide pressure level for worker UI events.
pub fn current_pressure() -> PressureLevel {
    ensure_monitor();
    u64_to_level(CURRENT_LEVEL.load(Ordering::Relaxed))
}

/// Pure tier decision (enter thresholds). Used by the monitor and tests.
pub fn pressure_tier(available_mb: u64, reserve_mb: u64, park_mb: u64) -> PressureLevel {
    if available_mb < park_mb {
        PressureLevel::Parked
    } else if available_mb < reserve_mb.saturating_mul(2) {
        PressureLevel::Squeeze
    } else {
        PressureLevel::Clear
    }
}

/// Exit thresholds with hysteresis — stay in the current tier until free RAM
/// climbs past the enter threshold by [`HYSTERESIS_MB`].
pub fn pressure_tier_with_hysteresis(
    available_mb: u64,
    reserve_mb: u64,
    park_mb: u64,
    current: PressureLevel,
) -> PressureLevel {
    let enter = pressure_tier(available_mb, reserve_mb, park_mb);
    match current {
        PressureLevel::Parked => {
            if available_mb >= park_mb.saturating_add(HYSTERESIS_MB) {
                pressure_tier(available_mb, reserve_mb, park_mb)
            } else {
                PressureLevel::Parked
            }
        }
        PressureLevel::Squeeze => match enter {
            PressureLevel::Parked => PressureLevel::Parked,
            PressureLevel::Clear
                if available_mb >= reserve_mb.saturating_mul(2).saturating_add(HYSTERESIS_MB) =>
            {
                PressureLevel::Clear
            }
            _ => PressureLevel::Squeeze,
        },
        PressureLevel::Clear => enter,
    }
}

fn apply_pressure_level(level: PressureLevel, available_mb: Option<u64>) {
    let multiplier = match level {
        PressureLevel::Clear => MULTIPLIER_FULL,
        PressureLevel::Squeeze => {
            // Harder squeeze when below one reserve.
            let reserve = memory_config().reserve_mb;
            match available_mb {
                Some(mb) if mb < reserve => MULTIPLIER_HARD_SQUEEZE,
                _ => MULTIPLIER_SQUEEZE,
            }
        }
        PressureLevel::Parked => MULTIPLIER_HARD_SQUEEZE,
    };
    CAP_MULTIPLIER_BP.store(multiplier, Ordering::Relaxed);
    CURRENT_LEVEL.store(level_to_u64(level), Ordering::Relaxed);

    let was_parked = PARK_FLAG.swap(level == PressureLevel::Parked, Ordering::SeqCst);
    if was_parked && level != PressureLevel::Parked {
        let _guard = PARK_LOCK.lock().unwrap_or_else(|err| err.into_inner());
        PARK_CV.notify_all();
    }
}

/// Block until park pressure clears. Call after dropping the memo so RSS can fall.
pub fn wait_while_parked() {
    if !PARK_FLAG.load(Ordering::SeqCst) {
        return;
    }
    let mut guard = PARK_LOCK.lock().unwrap_or_else(|err| err.into_inner());
    while PARK_FLAG.load(Ordering::SeqCst) {
        guard = PARK_CV.wait(guard).unwrap_or_else(|err| err.into_inner());
    }
}

pub fn is_parked() -> bool {
    PARK_FLAG.load(Ordering::Relaxed)
}

/// Test/helpers: force a pressure level without waiting for the monitor.
#[cfg(test)]
pub fn force_pressure_for_test(level: PressureLevel) {
    apply_pressure_level(level, None);
}

fn ensure_monitor() {
    static STARTED: OnceLock<()> = OnceLock::new();
    STARTED.get_or_init(|| {
        let _ = thread::Builder::new()
            .name("ga-fire-mem-pressure".into())
            .spawn(monitor_loop);
    });
}

fn monitor_loop() {
    let config = memory_config();
    let mut current = PressureLevel::Clear;
    loop {
        thread::sleep(MONITOR_INTERVAL);
        let Some(available) = mem_available_mb() else {
            continue;
        };
        let next =
            pressure_tier_with_hysteresis(available, config.reserve_mb, config.park_mb, current);
        if next != current {
            apply_pressure_level(next, Some(available));
            current = next;
            tracing::info!(
                ?current,
                available_mb = available,
                reserve_mb = config.reserve_mb,
                park_mb = config.park_mb,
                "memory pressure changed"
            );
        } else if current == PressureLevel::Squeeze {
            // Re-apply so hard vs soft squeeze tracks live available.
            apply_pressure_level(current, Some(available));
        }
    }
}

/// Pure admission decision for heavy hands.
pub fn admission_ok(
    in_flight: usize,
    max_threads: usize,
    hand_mem_mb: u64,
    reserve_mb: u64,
    total_mb: Option<u64>,
    available_mb: Option<u64>,
) -> bool {
    if in_flight.saturating_add(1) > max_threads {
        return false;
    }
    if let Some(total) = total_mb {
        let needed = (in_flight as u64)
            .saturating_add(1)
            .saturating_mul(hand_mem_mb)
            .saturating_add(reserve_mb);
        if needed > total {
            return false;
        }
    }
    if let Some(available) = available_mb
        && available < hand_mem_mb
    {
        return false;
    }
    true
}

/// Max concurrent heavy hands under current config (for logs / hand_threads).
pub fn max_heavy_hands(requested_threads: usize) -> usize {
    let config = memory_config();
    match config.total_mb {
        Some(total) => {
            let budget = total.saturating_sub(config.reserve_mb);
            let by_mem = usize::try_from((budget / config.hand_mem_mb).max(1)).unwrap_or(1);
            requested_threads.min(by_mem).max(1)
        }
        None => requested_threads.max(1),
    }
}

/// Process-global gate: all evaluate/optimize runs share one heavy-hand budget.
pub struct MemoryGate {
    in_flight: Mutex<usize>,
    condvar: Condvar,
    max_threads: usize,
}

impl MemoryGate {
    fn new(max_threads: usize) -> Self {
        ensure_monitor();
        Self {
            in_flight: Mutex::new(0),
            condvar: Condvar::new(),
            max_threads: max_threads.max(1),
        }
    }

    pub fn acquire(&self) -> MemoryPermit<'_> {
        let config = memory_config();
        let mut in_flight = self.in_flight.lock().unwrap_or_else(|err| err.into_inner());
        loop {
            let available = mem_available_mb();
            if admission_ok(
                *in_flight,
                self.max_threads,
                config.hand_mem_mb,
                config.reserve_mb,
                config.total_mb,
                available,
            ) {
                *in_flight += 1;
                return MemoryPermit(self);
            }
            let (guard, _) = self
                .condvar
                .wait_timeout(in_flight, GATE_WAIT)
                .unwrap_or_else(|err| err.into_inner());
            in_flight = guard;
        }
    }

    /// Like [`acquire`], but after `grace` without a slot calls `on_wait` once
    /// (for `HandPhase::Throttled`).
    pub fn acquire_with_notify(
        &self,
        grace: Duration,
        mut on_wait: impl FnMut(),
    ) -> MemoryPermit<'_> {
        let config = memory_config();
        let started = std::time::Instant::now();
        let mut notified = false;
        let mut in_flight = self.in_flight.lock().unwrap_or_else(|err| err.into_inner());
        loop {
            let available = mem_available_mb();
            if admission_ok(
                *in_flight,
                self.max_threads,
                config.hand_mem_mb,
                config.reserve_mb,
                config.total_mb,
                available,
            ) {
                *in_flight += 1;
                return MemoryPermit(self);
            }
            if !notified && started.elapsed() >= grace {
                notified = true;
                // Drop the lock while notifying so progress callbacks can run.
                drop(in_flight);
                on_wait();
                in_flight = self.in_flight.lock().unwrap_or_else(|err| err.into_inner());
                continue;
            }
            let (guard, _) = self
                .condvar
                .wait_timeout(in_flight, GATE_WAIT)
                .unwrap_or_else(|err| err.into_inner());
            in_flight = guard;
        }
    }
}

pub struct MemoryPermit<'a>(&'a MemoryGate);

impl Drop for MemoryPermit<'_> {
    fn drop(&mut self) {
        let mut in_flight = self
            .0
            .in_flight
            .lock()
            .unwrap_or_else(|err| err.into_inner());
        *in_flight = in_flight.saturating_sub(1);
        self.0.condvar.notify_all();
    }
}

static MEMORY_GATE: OnceLock<Arc<MemoryGate>> = OnceLock::new();

/// Shared gate for heavy sims. Sized once from CPU / `RAYON_NUM_THREADS`.
pub fn memory_gate(requested_threads: usize) -> Arc<MemoryGate> {
    MEMORY_GATE
        .get_or_init(|| {
            let max = max_heavy_hands(requested_threads);
            Arc::new(MemoryGate::new(max))
        })
        .clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn admission_respects_thread_cap() {
        assert!(!admission_ok(4, 4, 3072, 2048, Some(48_000), Some(40_000)));
        assert!(admission_ok(3, 4, 3072, 2048, Some(48_000), Some(40_000)));
    }

    #[test]
    fn admission_16gb_allows_four_heavy_hands() {
        // 4 * 3072 + 2048 = 14336 <= 16384
        assert!(admission_ok(3, 16, 3072, 2048, Some(16_384), Some(12_000)));
        assert!(!admission_ok(4, 16, 3072, 2048, Some(16_384), Some(12_000)));
    }

    #[test]
    fn admission_100gb_is_cpu_capped() {
        assert!(admission_ok(
            15,
            16,
            3072,
            2048,
            Some(100_000),
            Some(80_000)
        ));
        assert!(!admission_ok(
            16,
            16,
            3072,
            2048,
            Some(100_000),
            Some(80_000)
        ));
    }

    #[test]
    fn admission_without_total_falls_back_to_threads() {
        assert!(admission_ok(7, 8, 3072, 2048, None, Some(40_000)));
        assert!(!admission_ok(8, 8, 3072, 2048, None, Some(40_000)));
    }

    #[test]
    fn admission_blocks_when_available_below_hand_budget() {
        assert!(!admission_ok(0, 8, 3072, 2048, Some(48_000), Some(2048)));
        assert!(admission_ok(0, 8, 3072, 2048, Some(48_000), Some(3072)));
    }

    #[test]
    fn pressure_tier_thresholds() {
        assert_eq!(pressure_tier(5000, 2048, 1024), PressureLevel::Clear);
        assert_eq!(pressure_tier(3000, 2048, 1024), PressureLevel::Squeeze);
        assert_eq!(pressure_tier(1500, 2048, 1024), PressureLevel::Squeeze);
        assert_eq!(pressure_tier(500, 2048, 1024), PressureLevel::Parked);
    }

    #[test]
    fn pressure_hysteresis_stays_parked_until_margin() {
        assert_eq!(
            pressure_tier_with_hysteresis(1100, 2048, 1024, PressureLevel::Parked),
            PressureLevel::Parked
        );
        assert_eq!(
            pressure_tier_with_hysteresis(1600, 2048, 1024, PressureLevel::Parked),
            PressureLevel::Squeeze
        );
    }

    #[test]
    fn park_wait_returns_when_cleared() {
        force_pressure_for_test(PressureLevel::Parked);
        assert!(is_parked());
        let handle = std::thread::spawn(|| {
            std::thread::sleep(Duration::from_millis(50));
            force_pressure_for_test(PressureLevel::Clear);
        });
        wait_while_parked();
        handle.join().expect("clearer thread");
        assert!(!is_parked());
    }

    #[test]
    fn effective_cap_scales_with_multiplier() {
        CAP_MULTIPLIER_BP.store(MULTIPLIER_FULL, Ordering::Relaxed);
        assert_eq!(effective_memo_cap(10_000), 10_000);
        CAP_MULTIPLIER_BP.store(MULTIPLIER_SQUEEZE, Ordering::Relaxed);
        assert_eq!(effective_memo_cap(10_000), 5_000);
        CAP_MULTIPLIER_BP.store(MULTIPLIER_HARD_SQUEEZE, Ordering::Relaxed);
        assert_eq!(effective_memo_cap(10_000), 2_500);
        CAP_MULTIPLIER_BP.store(MULTIPLIER_FULL, Ordering::Relaxed);
    }

    #[test]
    fn memo_cap_entries_is_positive() {
        assert!(memo_cap_entries() >= 16_384);
    }

    #[test]
    fn cgroup_v2_max_is_unlimited() {
        assert_eq!(parse_cgroup_v2_limit("max\n"), None);
        assert_eq!(parse_cgroup_v2_limit("  max  "), None);
    }

    #[test]
    fn cgroup_v2_limit_parses_bytes() {
        assert_eq!(parse_cgroup_v2_limit("17179869184\n"), Some(17_179_869_184));
    }

    #[test]
    fn cgroup_v1_sentinel_is_unlimited() {
        assert_eq!(parse_cgroup_v1_limit("9223372036854771712\n"), None);
        assert_eq!(parse_cgroup_v1_limit("17179869184\n"), Some(17_179_869_184));
    }
}
