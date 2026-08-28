//! TypeScript bindings exported via `cargo test -p ga-fire-engine --features ts export_typescript`.

#[cfg(feature = "ts")]
mod export {
    use crate::{
        budget::Budget,
        cards::CardDef,
        deck::{
            DeckEvalRequest, DeckEvalResult, OptimizeProgress, OptimizeRequest, OptimizeResult,
        },
        line_event::{ActionOp, AttackBonuses, EventKind, LineEvent, TapePhase},
        model::{Bounds, EffectiveRequest, SimType, SolveRequest, SolveResult},
        stats::{CardStat, SparseLineStats},
        version::EngineVersion,
    };
    use ts_rs::TS;

    #[test]
    fn export_typescript() {
        Budget::export_all().expect("budget");
        EngineVersion::export_all().expect("engine version");
        EffectiveRequest::export_all().expect("effective request");
        SimType::export_all().expect("sim type");
        Bounds::export_all().expect("bounds");
        SolveRequest::export_all().expect("solve request");
        SolveResult::export_all().expect("solve result");
        DeckEvalRequest::export_all().expect("deck eval request");
        DeckEvalResult::export_all().expect("deck eval result");
        OptimizeRequest::export_all().expect("optimize request");
        OptimizeResult::export_all().expect("optimize result");
        OptimizeProgress::export_all().expect("optimize progress");
        CardStat::export_all().expect("card stat");
        SparseLineStats::export_all().expect("sparse line stats");
        CardDef::export_all().expect("card def");
        ActionOp::export_all().expect("action op");
        EventKind::export_all().expect("event kind");
        TapePhase::export_all().expect("tape phase");
        AttackBonuses::export_all().expect("attack bonuses");
        LineEvent::export_all().expect("line event");
    }
}
