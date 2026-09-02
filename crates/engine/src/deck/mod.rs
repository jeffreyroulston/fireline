//! Deck evaluation and optimization entry points.

mod bounds;
mod evaluate;
mod pool;
mod types;

use std::ops::ControlFlow;

use crate::error::Result;

#[cfg(test)]
mod tests;

pub use bounds::count_legal_decks;
pub(crate) use bounds::{consider_top, counts_key, initial_counts, ranked_decks};
pub(crate) use evaluate::evaluate_with_hand_progress_range;
pub use evaluate::{
    draw_opening_hands, evaluate, evaluate_with_hand_progress, evaluate_with_hand_progress_cancel,
    evaluate_with_progress, evaluate_with_progress_cancel, evaluate_with_serial_progress,
};
pub use pool::{cpu_count, hand_threads};
pub use types::*;

/// Search for high-performing deck compositions under the given strategy and bounds.
///
/// # Errors
///
/// Returns [`EngineError::UnknownDeckCard`] for unrecognized cards in bounds,
/// [`EngineError::InvalidRequest`] when bounds, deck size, or strategy inputs are invalid,
/// [`EngineError::Cancelled`] when cancelled through a progress callback, or
/// [`EngineError::ThreadPool`] when the worker pool cannot be created.
pub fn optimize(request: &OptimizeRequest) -> Result<OptimizeResult> {
    optimize_with_progress(request, |_| ControlFlow::Continue(()))
}

pub fn optimize_with_progress(
    request: &OptimizeRequest,
    on_progress: impl FnMut(OptimizeProgress) -> ControlFlow<()> + Send,
) -> Result<OptimizeResult> {
    crate::optimize_strategies::optimize_with_progress(request, on_progress)
}

/// Like [`optimize_with_progress`], plus per-hand started / rollout / done events
/// for the multi-bar UI (same events deck-eval streams).
pub fn optimize_with_hand_progress(
    request: &OptimizeRequest,
    on_progress: impl FnMut(OptimizeProgress) -> ControlFlow<()> + Send,
    on_hand_progress: impl FnMut(HandProgress) -> ControlFlow<()> + Send,
) -> Result<OptimizeResult> {
    crate::optimize_strategies::optimize_with_hand_progress(request, on_progress, on_hand_progress)
}

pub use crate::model::Bounds;
