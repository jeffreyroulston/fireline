pub mod budget;
pub mod cancel;
pub mod cards;
pub mod deck;
pub mod error;
pub mod line_event;
pub mod model;
pub mod optimize_strategies;
pub mod pressure;
mod random;
pub mod solver;
pub mod stats;
pub mod version;

#[cfg(feature = "ts")]
mod bindings;

pub use budget::Budget;
pub use cards::{CardDef, card_catalog};
pub use cancel::{
    CancelFlag, install as install_cancel, new_flag as new_cancel_flag, request as request_cancel,
};
pub use deck::{
    DeckEvalRequest, DeckEvalResult, EvalProgress, HandPhase, HandProgress, OptimizeProgress,
    OptimizeRequest, OptimizeResult, Strategy, SwapConfig, count_legal_decks, draw_opening_hands,
    evaluate, evaluate_with_hand_progress, evaluate_with_hand_progress_cancel,
    evaluate_with_progress, evaluate_with_progress_cancel, evaluate_with_serial_progress,
    hand_threads, optimize, optimize_with_progress,
};
pub use error::{EngineError, Result};
pub use line_event::{
    ActionOp, AttackBonuses, EventKind, LineEvent, TapePhase, format_line_event,
    format_line_event_row,
};
pub use model::{EffectiveRequest, PassResult, SimType, SolveRequest, SolveResult};
pub use pressure::{PressureLevel, current_pressure, memory_config};
pub use solver::{solve, solve_cards, solve_pass, solve_with_progress};
pub use version::{ENGINE_VERSION, EngineVersion};

pub fn solve_json(input: &str) -> Result<String> {
    let request: SolveRequest =
        serde_json::from_str(input).map_err(|source| EngineError::InvalidJson {
            kind: "solve",
            source,
        })?;
    serde_json::to_string(&solve(&request)?).map_err(EngineError::SerializeJson)
}

pub fn evaluate_json(input: &str) -> Result<String> {
    let request: DeckEvalRequest =
        serde_json::from_str(input).map_err(|source| EngineError::InvalidJson {
            kind: "deck",
            source,
        })?;
    serde_json::to_string(&evaluate(&request)?).map_err(EngineError::SerializeJson)
}

pub fn optimize_json(input: &str) -> Result<String> {
    let request: OptimizeRequest =
        serde_json::from_str(input).map_err(|source| EngineError::InvalidJson {
            kind: "optimize",
            source,
        })?;
    serde_json::to_string(&optimize(&request)?).map_err(EngineError::SerializeJson)
}
