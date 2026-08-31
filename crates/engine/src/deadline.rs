//! Per-hand wall-clock deadline for long-running searches.
//!
//! Installed on the rayon hand thread before each solve. [`Search::checkpoint`]
//! polls it on the same cadence as cooperative cancel.

use std::cell::RefCell;
use std::time::{Duration, Instant};

thread_local! {
    static DEADLINE: RefCell<Option<Instant>> = const { RefCell::new(None) };
}

pub struct DeadlineGuard {
    previous: Option<Instant>,
}

pub fn install(duration: Duration) -> DeadlineGuard {
    let deadline = Instant::now() + duration;
    DEADLINE.with(|slot| {
        let previous = slot.borrow_mut().replace(deadline);
        DeadlineGuard { previous }
    })
}

pub fn is_expired() -> bool {
    DEADLINE.with(|slot| {
        slot.borrow()
            .is_some_and(|deadline| Instant::now() >= deadline)
    })
}

impl Drop for DeadlineGuard {
    fn drop(&mut self) {
        DEADLINE.with(|slot| {
            *slot.borrow_mut() = self.previous.take();
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;
    use std::time::Duration;

    #[test]
    fn install_scopes_deadline_to_thread() {
        assert!(!is_expired());
        {
            let _guard = install(Duration::from_millis(20));
            assert!(!is_expired());
            thread::sleep(Duration::from_millis(25));
            assert!(is_expired());
        }
        assert!(!is_expired());
    }
}
