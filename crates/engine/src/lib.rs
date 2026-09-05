pub mod budget;
pub mod cancel;
pub mod cards;
pub mod deadline;
pub mod deck;
pub mod error;
pub mod line_event;
pub mod model;
pub mod optimize_strategies;
pub mod playtest;
pub mod pressure;
mod random;
pub mod rules;
pub mod solver;
mod sprt;
pub mod stats;
pub mod version;

#[cfg(feature = "ts")]
mod bindings;

pub use budget::Budget;
pub use cancel::{
    CancelFlag, install as install_cancel, is_save_requested, is_save_requested_on,
    new_flag as new_cancel_flag, request as request_cancel, request_save,
};
pub use cards::{CardDef, card_catalog};
pub use deck::{
    DeckEvalRequest, DeckEvalResult, EvalProgress, HandPhase, HandProgress, OptimizeProgress,
    OptimizeRequest, OptimizeResult, Strategy, SwapConfig, count_legal_decks, cpu_count,
    draw_opening_hands, evaluate, evaluate_with_hand_progress, evaluate_with_hand_progress_cancel,
    evaluate_with_progress, evaluate_with_progress_cancel, evaluate_with_serial_progress,
    hand_threads, optimize, optimize_with_hand_progress, optimize_with_progress,
};
pub use error::{EngineError, Result};
pub use line_event::{
    ActionOp, AttackBonuses, EventKind, LineEvent, TapePhase, format_line_event,
    format_line_event_row,
};
pub use model::{
    Action, EffectiveRequest, PassResult, Phase, SimType, SolveRequest, SolveResult, State, Weapon,
};
pub use playtest::{
    PlaytestAction, PlaytestActionOption, PlaytestAllyView, PlaytestApplyRequest,
    PlaytestApplyResult, PlaytestInitRequest, PlaytestInitResult, PlaytestLegalActionsRequest,
    PlaytestLegalActionsResult, PlaytestStateView, playtest_apply, playtest_init,
    playtest_legal_actions,
};
pub use pressure::{PressureLevel, current_pressure, memory_config};
pub use rules::{
    ActionPayment, ApplyOpts, RulesError, RulesMode, TurnAdvancePolicy, apply as rules_apply,
    legal_actions_with_mode,
};
pub use solver::{
    apply_action, legal_actions, opening_hand_hash, solve, solve_cards, solve_pass,
    solve_with_progress,
};
pub use version::{ENGINE_VERSION, EngineVersion};

/// JSON boundary for [`solve`].
///
/// # Errors
///
/// Returns [`EngineError::InvalidJson`] when `input` is not valid JSON for [`SolveRequest`],
/// propagates [`solve`] errors, or returns [`EngineError::SerializeJson`] on output failure.
pub fn solve_json(input: &str) -> Result<String> {
    let request: SolveRequest =
        serde_json::from_str(input).map_err(|source| EngineError::InvalidJson {
            kind: "solve",
            source,
        })?;
    serde_json::to_string(&solve(&request)?).map_err(EngineError::SerializeJson)
}

/// JSON boundary for [`evaluate`].
///
/// # Errors
///
/// Returns [`EngineError::InvalidJson`] when `input` is not valid JSON for [`DeckEvalRequest`],
/// propagates [`evaluate`] errors, or returns [`EngineError::SerializeJson`] on output failure.
pub fn evaluate_json(input: &str) -> Result<String> {
    let request: DeckEvalRequest =
        serde_json::from_str(input).map_err(|source| EngineError::InvalidJson {
            kind: "deck",
            source,
        })?;
    serde_json::to_string(&evaluate(&request)?).map_err(EngineError::SerializeJson)
}

/// JSON boundary for [`optimize`].
///
/// # Errors
///
/// Returns [`EngineError::InvalidJson`] when `input` is not valid JSON for [`OptimizeRequest`],
/// propagates [`optimize`] errors, or returns [`EngineError::SerializeJson`] on output failure.
pub fn optimize_json(input: &str) -> Result<String> {
    let request: OptimizeRequest =
        serde_json::from_str(input).map_err(|source| EngineError::InvalidJson {
            kind: "optimize",
            source,
        })?;
    serde_json::to_string(&optimize(&request)?).map_err(EngineError::SerializeJson)
}
