//! Per-job cooperative cancellation for long-running searches.
//!
//! The worker installs a job-local [`CancelFlag`] on each rayon hand thread.
//! When the NDJSON client disconnects, the worker sets the flag; [`Search`]
//! polls it on the same cadence as park checkpoints and aborts promptly.
//! Cancel-and-save sets both `requested` and `save` so the engine can return
//! finished hands instead of discarding the job.

use std::cell::RefCell;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

thread_local! {
    static CURRENT: RefCell<Option<CancelFlag>> = const { RefCell::new(None) };
}

/// Shared cancel state for one evaluate / optimize / solve job.
pub struct CancelControl {
    requested: AtomicBool,
    save: AtomicBool,
}

/// Shared cancel flag for one evaluate / optimize / solve job.
pub type CancelFlag = Arc<CancelControl>;

pub fn new_flag() -> CancelFlag {
    Arc::new(CancelControl {
        requested: AtomicBool::new(false),
        save: AtomicBool::new(false),
    })
}

pub fn request(flag: &CancelFlag) {
    flag.requested.store(true, Ordering::SeqCst);
}

/// Stop the job and keep finished work for a partial result.
pub fn request_save(flag: &CancelFlag) {
    flag.save.store(true, Ordering::SeqCst);
    flag.requested.store(true, Ordering::SeqCst);
}

pub fn is_requested(flag: &CancelFlag) -> bool {
    flag.requested.load(Ordering::Relaxed)
}

pub fn is_save_requested_on(flag: &CancelFlag) -> bool {
    flag.save.load(Ordering::Relaxed)
}

/// True when this OS thread is running under an installed flag that has been set.
pub fn is_cancel_requested() -> bool {
    CURRENT.with(|slot| {
        slot.borrow()
            .as_ref()
            .is_some_and(|flag| flag.requested.load(Ordering::Relaxed))
    })
}

/// True when this OS thread's installed flag asked to keep finished work.
pub fn is_save_requested() -> bool {
    CURRENT.with(|slot| {
        slot.borrow()
            .as_ref()
            .is_some_and(|flag| flag.save.load(Ordering::Relaxed))
    })
}

/// The flag installed on this thread, if any. Nested deck evals clone it onto
/// rayon workers so cancel/save abort the in-flight hand instead of waiting
/// for the current candidate list to finish.
pub fn current_flag() -> Option<CancelFlag> {
    CURRENT.with(|slot| slot.borrow().clone())
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

    #[test]
    fn request_save_sets_cancel_and_save() {
        let flag = new_flag();
        assert!(!is_requested(&flag));
        assert!(!is_save_requested_on(&flag));
        request_save(&flag);
        assert!(is_requested(&flag));
        assert!(is_save_requested_on(&flag));
        let _guard = install(flag);
        assert!(is_cancel_requested());
        assert!(is_save_requested());
    }

    #[test]
    fn current_flag_tracks_install() {
        assert!(current_flag().is_none());
        let flag = new_flag();
        {
            let _guard = install(flag.clone());
            assert!(Arc::ptr_eq(&current_flag().expect("installed"), &flag));
        }
        assert!(current_flag().is_none());
    }
}
