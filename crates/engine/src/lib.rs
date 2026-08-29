pub mod budget;
pub mod cards;
pub mod deck;
pub mod line_event;
pub mod model;
pub mod optimize_strategies;
pub mod solver;
pub mod stats;
pub mod version;

#[cfg(feature = "ts")]
mod bindings;

pub use budget::Budget;
pub use cards::{CardDef, card_catalog};
pub use deck::{
    DeckEvalRequest, DeckEvalResult, EvalProgress, OptimizeProgress, OptimizeRequest,
    OptimizeResult, Strategy, SwapConfig, count_legal_decks, evaluate, evaluate_with_progress,
    evaluate_with_serial_progress, optimize, optimize_with_progress,
};
pub use line_event::{
    ActionOp, AttackBonuses, EventKind, LineEvent, TapePhase, format_line_event,
    format_line_event_row,
};
pub use model::{EffectiveRequest, PassResult, SimType, SolveRequest, SolveResult};
pub use solver::{solve, solve_cards, solve_pass, solve_with_progress};
pub use version::{ENGINE_VERSION, EngineVersion};

pub fn solve_json(input: &str) -> Result<String, String> {
    let request: SolveRequest =
        serde_json::from_str(input).map_err(|error| format!("invalid solve request: {error}"))?;
    serde_json::to_string(&solve(&request)?).map_err(|error| error.to_string())
}

pub fn evaluate_json(input: &str) -> Result<String, String> {
    let request: DeckEvalRequest =
        serde_json::from_str(input).map_err(|error| format!("invalid deck request: {error}"))?;
    serde_json::to_string(&evaluate(&request)?).map_err(|error| error.to_string())
}

pub fn optimize_json(input: &str) -> Result<String, String> {
    let request: OptimizeRequest = serde_json::from_str(input)
        .map_err(|error| format!("invalid optimize request: {error}"))?;
    serde_json::to_string(&optimize(&request)?).map_err(|error| error.to_string())
}
