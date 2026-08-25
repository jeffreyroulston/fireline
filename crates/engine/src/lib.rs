pub mod cards;
pub mod deck;
pub mod model;
pub mod solver;
pub mod stats;

pub use deck::{
    DeckEvalRequest, DeckEvalResult, OptimizeProgress, OptimizeRequest, OptimizeResult,
    count_legal_decks, evaluate, optimize, optimize_with_progress,
};
pub use model::{SimType, SolveRequest, SolveResult};
pub use solver::{solve, solve_cards};

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

#[cfg(all(feature = "wasm", target_arch = "wasm32"))]
mod wasm {
    use crate::optimize_with_progress;
    use wasm_bindgen::prelude::*;

    #[wasm_bindgen(start)]
    pub fn start() {
        console_error_panic_hook::set_once();
    }

    #[wasm_bindgen(js_name = solveJson)]
    pub fn solve_json(input: &str) -> Result<String, JsValue> {
        super::solve_json(input).map_err(|error| JsValue::from_str(&error))
    }

    #[wasm_bindgen(js_name = evaluateJson)]
    pub fn evaluate_json(input: &str) -> Result<String, JsValue> {
        super::evaluate_json(input).map_err(|error| JsValue::from_str(&error))
    }

    #[wasm_bindgen(js_name = optimizeJson)]
    pub fn optimize_json(input: &str, on_progress: &js_sys::Function) -> Result<String, JsValue> {
        let request: crate::OptimizeRequest = serde_json::from_str(input)
            .map_err(|error| JsValue::from_str(&format!("invalid optimize request: {error}")))?;
        let result = optimize_with_progress(&request, |progress| {
            if let Ok(json) = serde_json::to_string(&progress) {
                let _ = on_progress.call1(&JsValue::NULL, &JsValue::from_str(&json));
            }
        })
        .map_err(|error| JsValue::from_str(&error))?;
        serde_json::to_string(&result).map_err(|error| JsValue::from_str(&error.to_string()))
    }
}
