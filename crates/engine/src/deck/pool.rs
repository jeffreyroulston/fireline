//! Shared Rayon pool and thread budgeting for deck jobs.

use crate::error::Result;
use crate::model::SimType;
use std::sync::{Condvar, Mutex, OnceLock};
use std::time::Duration;

pub(crate) fn sim_uses_heavy_search(sim_type: SimType) -> bool {
    matches!(
        sim_type,
        SimType::MonteCarlo | SimType::OracleOnly | SimType::TwoPass
    )
}

/// Threads requested for hand parallelism: `RAYON_NUM_THREADS` if set and
/// valid, else the CPU count.
pub(crate) fn requested_threads() -> usize {
    let cpus = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(6);
    std::env::var("RAYON_NUM_THREADS")
        .ok()
        .and_then(|value| value.parse::<usize>().ok())
        .filter(|&n| n > 0)
        .unwrap_or(cpus)
}

/// Hand parallelism for deck eval. `RAYON_NUM_THREADS` is an upper bound;
/// heavy sims are also capped by the process-global memory budget.
pub fn hand_threads(sim_type: SimType) -> usize {
    let requested = requested_threads();
    if !sim_uses_heavy_search(sim_type) {
        return requested;
    }
    crate::pressure::max_heavy_hands(requested)
}

/// Shared pool for deck-eval hand parallelism, sized once from the CPU count
/// (or `RAYON_NUM_THREADS`). Concurrent heavy hands are capped by the
/// process-global [`crate::pressure::MemoryGate`].
pub(crate) fn shared_pool() -> Result<&'static rayon::ThreadPool> {
    static POOL: OnceLock<rayon::ThreadPool> = OnceLock::new();
    if let Some(pool) = POOL.get() {
        return Ok(pool);
    }
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(requested_threads())
        .build()?;
    // A concurrent request may win the race; dropping the loser joins its threads.
    Ok(POOL.get_or_init(|| pool))
}

/// Logical CPU count (respects `RAYON_NUM_THREADS` when set).
pub fn cpu_count() -> usize {
    requested_threads()
}

pub(crate) fn job_thread_cap(max_threads: Option<u16>) -> Option<usize> {
    max_threads
        .filter(|&n| n > 0)
        .map(|n| usize::from(n).min(requested_threads()))
}

pub(crate) struct JobSemaphore {
    max: usize,
    active: Mutex<usize>,
    notify: Condvar,
}

impl JobSemaphore {
    pub(crate) fn new(max: usize) -> Self {
        Self {
            max,
            active: Mutex::new(0),
            notify: Condvar::new(),
        }
    }

    pub(crate) fn acquire(&self) -> JobPermit<'_> {
        let mut active = self.active.lock().unwrap_or_else(|err| err.into_inner());
        while *active >= self.max {
            active = self
                .notify
                .wait(active)
                .unwrap_or_else(|err| err.into_inner());
        }
        *active += 1;
        JobPermit { sem: self }
    }
}

pub(crate) struct JobPermit<'a> {
    sem: &'a JobSemaphore,
}

impl Drop for JobPermit<'_> {
    fn drop(&mut self) {
        let mut active = self
            .sem
            .active
            .lock()
            .unwrap_or_else(|err| err.into_inner());
        *active = active.saturating_sub(1);
        self.sem.notify.notify_one();
    }
}

pub(crate) const THROTTLE_GRACE: Duration = Duration::from_secs(2);
