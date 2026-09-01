use serde::{Deserialize, Serialize};

#[cfg(feature = "ts")]
use ts_rs::TS;

/// Caller-supplied limits echoed in results so persisted runs record what actually ran.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(TS))]
#[cfg_attr(
    feature = "ts",
    ts(export, export_to = "../../../packages/contracts/generated/")
)]
pub struct Budget {
    pub max_turns_min: u8,
    pub max_turns_max: u8,
    pub max_solve_rollouts: u16,
    pub max_eval_rollouts: u16,
    pub max_optimize_decks: u32,
}

impl Budget {
    pub const fn conservative() -> Self {
        Self {
            max_turns_min: 2,
            max_turns_max: 5,
            max_solve_rollouts: 48,
            max_eval_rollouts: 48,
            max_optimize_decks: 5000,
        }
    }
}

impl Default for Budget {
    fn default() -> Self {
        Self::conservative()
    }
}

#[cfg(test)]
mod tests {
    use super::Budget;

    #[test]
    fn conservative_matches_default() {
        assert_eq!(Budget::default(), Budget::conservative());
    }

    #[test]
    fn conservative_limits_are_expected() {
        let budget = Budget::conservative();
        assert_eq!(budget.max_turns_min, 2);
        assert_eq!(budget.max_turns_max, 5);
        assert_eq!(budget.max_solve_rollouts, 48);
        assert_eq!(budget.max_eval_rollouts, 48);
        assert_eq!(budget.max_optimize_decks, 5000);
    }
}
