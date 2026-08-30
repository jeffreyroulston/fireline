//! Per-job cooperative cancellation for long-running searches.
//!
//! The worker installs a job-local [`CancelFlag`] on each rayon hand thread.
//! When the NDJSON client disconnects, the worker sets the flag; [`Search`]
//! polls it on the same cadence as park checkpoints and aborts promptly.

use std::cell::RefCell;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

thread_local! {
    static CURRENT: RefCell<Option<Arc<AtomicBool>>> = const { RefCell::new(None) };
}

/// Shared cancel flag for one evaluate / optimize / solve job.
pub type CancelFlag = Arc<AtomicBool>;

pub fn new_flag() -> CancelFlag {
    Arc::new(AtomicBool::new(false))
}

pub fn request(flag: &CancelFlag) {
    flag.store(true, Ordering::SeqCst);
}

pub fn is_requested(flag: &CancelFlag) -> bool {
    flag.load(Ordering::Relaxed)
}

/// True when this OS thread is running under an installed flag that has been set.
pub fn is_cancel_requested() -> bool {
    CURRENT.with(|slot| {
        slot.borrow()
            .as_ref()
            .is_some_and(|flag| flag.load(Ordering::Relaxed))
    })
}

/// Install `flag` for the current thread until the guard drops (restores prior).
pub fn install(flag: CancelFlag) -> CancelInstallGuard {
    CURRENT.with(|slot| {
        let previous = slot.borrow_mut().replace(flag);
        CancelInstallGuard { previous }
    })
}

pub struct CancelInstallGuard {
    previous: Option<CancelFlag>,
}

impl Drop for CancelInstallGuard {
    fn drop(&mut self) {
        CURRENT.with(|slot| {
            *slot.borrow_mut() = self.previous.take();
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn install_scopes_cancel_to_thread() {
        assert!(!is_cancel_requested());
        let flag = new_flag();
        {
            let _guard = install(flag.clone());
            assert!(!is_cancel_requested());
            request(&flag);
            assert!(is_cancel_requested());
        }
        assert!(!is_cancel_requested());
    }
}
