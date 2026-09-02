//! TypeScript bindings exported via `cargo test -p ga-fire-engine --features ts export_typescript`.

#[cfg(feature = "ts")]
mod export {
    #[test]
    fn export_typescript() {
        use ts_rs::TS;

        let _ = (
            <crate::budget::Budget as TS>::export_all(),
            <crate::version::EngineVersion as TS>::export_all(),
            <crate::model::EffectiveRequest as TS>::export_all(),
            <crate::model::SimType as TS>::export_all(),
            <crate::model::Bounds as TS>::export_all(),
            <crate::model::SolveRequest as TS>::export_all(),
            <crate::model::SolveResult as TS>::export_all(),
            <crate::deck::DeckEvalRequest as TS>::export_all(),
            <crate::deck::DeckEvalResult as TS>::export_all(),
            <crate::deck::OptimizeRequest as TS>::export_all(),
            <crate::deck::Strategy as TS>::export_all(),
            <crate::deck::EvalMode as TS>::export_all(),
            <crate::deck::SwapConfig as TS>::export_all(),
            <crate::deck::MultiDeckConfig as TS>::export_all(),
            <crate::deck::OptimizeResult as TS>::export_all(),
            <crate::deck::OptimizeProgress as TS>::export_all(),
            <crate::stats::CardStat as TS>::export_all(),
            <crate::stats::SparseLineStats as TS>::export_all(),
            <crate::cards::CardDef as TS>::export_all(),
            <crate::line_event::ActionOp as TS>::export_all(),
            <crate::line_event::EventKind as TS>::export_all(),
            <crate::line_event::TapePhase as TS>::export_all(),
            <crate::line_event::AttackBonuses as TS>::export_all(),
            <crate::line_event::LineEvent as TS>::export_all(),
            <crate::playtest::PlaytestInitRequest as TS>::export_all(),
            <crate::playtest::PlaytestInitResult as TS>::export_all(),
            <crate::playtest::PlaytestLegalActionsRequest as TS>::export_all(),
            <crate::playtest::PlaytestLegalActionsResult as TS>::export_all(),
            <crate::playtest::PlaytestApplyResult as TS>::export_all(),
            <crate::playtest::PlaytestStateView as TS>::export_all(),
            <crate::playtest::PlaytestEngineState as TS>::export_all(),
            <crate::playtest::PlaytestAction as TS>::export_all(),
            <crate::playtest::PlaytestActionOption as TS>::export_all(),
            <crate::playtest::PlaytestDiscardStep as TS>::export_all(),
            <crate::playtest::PlaytestAllyView as TS>::export_all(),
        );
    }
}
