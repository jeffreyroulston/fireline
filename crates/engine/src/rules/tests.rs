//! Rules-mode boundary tests (Full vs `SolverReduced`).

use super::{
    ApplyOpts, RulesMode, apply_action_with_opts, legal_actions_with_mode,
};
use crate::cards::Card;
use crate::line_event::EventKind;
use crate::model::{Action, MAT_DAGGER, Phase, State};

fn ally_board_with_arthur_and_sadi() -> State {
    let mut state = State::with_queue(&[], true, 3, &[]);
    state.phase = Phase::Main;
    state.turn = 1;
    state.champion_awake = true;
    state.add_ally(Card::Arthur, true, true);
    state.add_ally(Card::ClumsyApprentice, true, false);
    state
}

#[test]
fn legal_actions_full_should_include_attack_others_when_arthur_ready() {
    let state = ally_board_with_arthur_and_sadi();
    let full = legal_actions_with_mode(state, RulesMode::Full);
    assert!(
        full.iter().any(|a| matches!(a, Action::AttackOthers)),
        "Full must offer AttackOthers alongside Arthur: {full:?}"
    );
    assert!(
        full.iter().any(|a| matches!(a, Action::AttackArthur(_))),
        "Full must still offer AttackArthur: {full:?}"
    );
}

#[test]
fn legal_actions_solver_reduced_should_omit_attack_others_when_arthur_ready() {
    let state = ally_board_with_arthur_and_sadi();
    let reduced = legal_actions_with_mode(state, RulesMode::SolverReduced);
    assert!(
        !reduced.iter().any(|a| matches!(a, Action::AttackOthers)),
        "SolverReduced must not offer AttackOthers while Arthur ready: {reduced:?}"
    );
}

#[test]
fn legal_actions_full_should_not_force_only_dagger_in_pre_recollect() {
    let mut state = State::with_queue(&[Card::IgnitedStab], true, 3, &[]);
    state.phase = Phase::PreRecollect;
    state.turn = 1;
    state.dagger = true;
    state.dagger_ready = true;
    state.champion_level = 1;
    state.champion_awake = true;
    let full = legal_actions_with_mode(state, RulesMode::Full);
    assert!(
        full.iter().any(|a| matches!(a, Action::ActivateDagger)),
        "{full:?}"
    );
    assert!(
        full.len() > 1,
        "Full must not collapse PreRecollect to dagger-only: {full:?}"
    );
}

#[test]
fn apply_should_not_run_enemy_cull_in_full_mode() {
    let mut state = State::with_queue(&[], true, 3, &[]);
    state.phase = Phase::Main;
    state.turn = 0;
    state.add_ally(Card::ClumsyApprentice, true, false);
    let before_allies = state.ally_len;

    let (next, events) = apply_action_with_opts(state, Action::Pass, None, ApplyOpts::FULL);
    assert_eq!(
        next.ally_len, before_allies,
        "RulesWake must keep allies after turn advance"
    );
    assert!(
        !events.iter().any(|e| e.kind == EventKind::EnemyMain),
        "Full apply must not emit EnemyMain cull events"
    );
    assert_eq!(next.phase, Phase::Materialize);
}

#[test]
fn apply_should_run_enemy_cull_with_solver_policy() {
    let mut state = State::with_queue(&[], true, 3, &[]);
    state.phase = Phase::Main;
    state.turn = 0;
    state.add_ally(Card::ClumsyApprentice, true, false);

    let (next, events) = apply_action_with_opts(state, Action::Pass, None, ApplyOpts::SOLVER);
    assert_eq!(next.ally_len, 0, "SolverCullThenWake must cull non-immortal allies");
    assert!(
        events.iter().any(|e| e.kind == EventKind::EnemyMain),
        "SolverCullThenWake should emit EnemyMain"
    );
}

#[test]
fn legal_actions_full_should_offer_dagger_after_turn_one() {
    let mut state = State::with_queue_and_materials(&[], true, 4, &[], MAT_DAGGER);
    state.phase = Phase::Materialize;
    state.turn = 2;
    let full = legal_actions_with_mode(state, RulesMode::Full);
    let reduced = legal_actions_with_mode(state, RulesMode::SolverReduced);
    assert!(
        full.iter()
            .any(|a| matches!(a, Action::MaterializeDagger)),
        "Full may delay dagger past turn 1: {full:?}"
    );
    assert!(
        !reduced
            .iter()
            .any(|a| matches!(a, Action::MaterializeDagger)),
        "SolverReduced only offers dagger on turn 1: {reduced:?}"
    );
}
