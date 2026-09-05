use std::collections::BTreeMap;

use super::payment::reserved_from_action;
use super::state::state_to_engine;
use super::*;
use crate::cards::Card;
use crate::model::{MAT_ZANDER, Phase, State};

#[test]
fn playtest_init_going_second_draws_from_queue() {
    let result = playtest_init(&PlaytestInitRequest {
        hand: vec!["arthur".to_string(), "ignited_stab".to_string()],
        go_first: false,
        max_turns: 2,
        materials: BTreeMap::new(),
        queue: vec!["hasty_messenger".to_string()],
    })
    .expect("init");
    assert_eq!(result.events.len(), 1);
    assert_eq!(result.events[0].drawn, Some("hasty_messenger"));
    assert_eq!(result.state.queue_remaining, 0);
    assert!(!result.state.terminal);
}

#[test]
fn playtest_apply_pass_advances_phase() {
    let init = playtest_init(&PlaytestInitRequest {
        hand: vec![
            "arthur".to_string(),
            "ignited_stab".to_string(),
            Card::Brick.id().to_string(),
        ],
        go_first: true,
        max_turns: 2,
        materials: BTreeMap::new(),
        queue: vec![],
    })
    .expect("init");
    let legal = playtest_legal_actions(&PlaytestLegalActionsRequest {
        state: init.state.engine.clone(),
    })
    .expect("legal");
    assert!(
        legal
            .actions
            .iter()
            .any(|opt| matches!(opt.action, PlaytestAction::Pass))
    );
    let start_phase = init.state.phase.clone();
    let applied = playtest_apply(&PlaytestApplyRequest {
        state: init.state.engine,
        action: PlaytestAction::Pass,
    })
    .expect("apply");
    assert!(
        applied
            .events
            .iter()
            .any(|event| event.op.as_str() == "pass")
    );
    assert_ne!(applied.state.phase, start_phase);
}

#[test]
fn playtest_apply_play_ally_with_manual_reserve_indices() {
    let init = playtest_init(&PlaytestInitRequest {
        hand: vec![
            Card::PackageCourier.id().to_string(),
            Card::Brick.id().to_string(),
            Card::Brick.id().to_string(),
            Card::Brick.id().to_string(),
            Card::IgnitedStab.id().to_string(),
        ],
        go_first: true,
        max_turns: 1,
        materials: BTreeMap::new(),
        queue: vec![],
    })
    .expect("init");
    let mut engine = init.state.engine;
    engine.turn = 1;
    let legal = playtest_legal_actions(&PlaytestLegalActionsRequest {
        state: engine.clone(),
    })
    .expect("legal");
    let courier = legal
        .actions
        .iter()
        .find(|opt| {
            matches!(
                &opt.action,
                PlaytestAction::PlayAlly { card, kindle, .. }
                    if card == Card::PackageCourier.id() && *kindle == 0
            )
        })
        .expect("play courier without kindle");
    assert_eq!(courier.reserve_count, 2);

    let mut action = courier.action.clone();
    if let PlaytestAction::PlayAlly {
        reserved_hand_indices,
        skip_discard,
        ..
    } = &mut action
    {
        *reserved_hand_indices = vec![1, 2];
        *skip_discard = Some(true);
    } else {
        panic!("expected play ally");
    }

    let applied = playtest_apply(&PlaytestApplyRequest {
        state: engine,
        action,
    })
    .expect("apply with reserve");
    assert_eq!(applied.state.memory.len(), 2);
    assert!(applied.state.memory.iter().all(|id| id == Card::Brick.id()));
    assert_eq!(applied.state.allies.len(), 1);
}

#[test]
fn playtest_apply_vermilion_manual_fire_reserve_imbues_and_draws() {
    let init = playtest_init(&PlaytestInitRequest {
        hand: vec![
            Card::VermilionDecree.id().to_string(),
            Card::Brick.id().to_string(),
            Card::Brick.id().to_string(),
            Card::Brick.id().to_string(),
        ],
        go_first: true,
        max_turns: 1,
        materials: BTreeMap::new(),
        queue: vec![Card::HotCake.id().to_string()],
    })
    .expect("init");
    let mut engine = init.state.engine;
    engine.turn = 1;
    let legal = playtest_legal_actions(&PlaytestLegalActionsRequest {
        state: engine.clone(),
    })
    .expect("legal");
    let decree = legal
        .actions
        .iter()
        .find(|opt| {
            matches!(
                &opt.action,
                PlaytestAction::PlayAction {
                    card,
                    kindle: 0,
                    imbue: false,
                    ..
                } if card == Card::VermilionDecree.id()
            )
        })
        .expect("play vermilion without explicit imbue flag");

    let mut action = decree.action.clone();
    if let PlaytestAction::PlayAction {
        reserved_hand_indices,
        ..
    } = &mut action
    {
        *reserved_hand_indices = vec![0, 1, 2];
    } else {
        panic!("expected play action");
    }

    let applied = playtest_apply(&PlaytestApplyRequest {
        state: engine,
        action,
    })
    .expect("apply with fire reserve");
    assert!(
        applied
            .events
            .iter()
            .any(|event| event.imbue == Some(true) && event.drawn.is_some()),
        "{:?}",
        applied.events
    );
    assert!(
        applied.state.hand.iter().any(|id| id == Card::HotCake.id()),
        "imbue should draw Hot Cake: {:?}",
        applied.state.hand
    );
}

#[test]
fn playtest_action_deserializes_reserved_hand_indices() {
    let action = PlaytestAction::PlayAlly {
        card: Card::PackageCourier.id().to_string(),
        kindle: 0,
        sacrifice_ally: None,
        hot_cake_sacrifice: false,
        flagrant_level: None,
        flagrant_gy_return: None,
        tristan_agility: false,
        reserved: Vec::new(),
        reserved_hand_indices: vec![1, 2],
        skip_discard: None,
        discard_hand_index: None,
    };
    let json = serde_json::to_string(&action).expect("serialize");
    let parsed: PlaytestAction = serde_json::from_str(&json).expect("deserialize");
    let (_, indices) = reserved_from_action(&parsed);
    assert_eq!(indices, &[1, 2]);
    assert!(json.contains("reservedHandIndices"));
}

#[test]
fn playtest_apply_rejects_missing_reserve() {
    let init = playtest_init(&PlaytestInitRequest {
        hand: vec![
            Card::PackageCourier.id().to_string(),
            Card::Brick.id().to_string(),
            Card::Brick.id().to_string(),
            Card::Brick.id().to_string(),
        ],
        go_first: true,
        max_turns: 1,
        materials: BTreeMap::new(),
        queue: vec![],
    })
    .expect("init");
    let mut engine = init.state.engine;
    engine.turn = 1;
    let err = playtest_apply(&PlaytestApplyRequest {
        state: engine,
        action: PlaytestAction::PlayAlly {
            card: Card::PackageCourier.id().to_string(),
            kindle: 0,
            sacrifice_ally: None,
            hot_cake_sacrifice: false,
            flagrant_level: None,
            flagrant_gy_return: None,
            tristan_agility: false,
            reserved: vec![],
            reserved_hand_indices: vec![],
            skip_discard: None,
            discard_hand_index: None,
        },
    })
    .expect_err("missing reserve");
    assert!(err.to_string().contains("Select cards to reserve"));
}

#[test]
fn playtest_apply_package_courier_manual_discard() {
    let init = playtest_init(&PlaytestInitRequest {
        hand: vec![
            Card::PackageCourier.id().to_string(),
            Card::Brick.id().to_string(),
            Card::Brick.id().to_string(),
            Card::IgnitedStab.id().to_string(),
            Card::SableRemnant.id().to_string(),
        ],
        go_first: true,
        max_turns: 1,
        materials: BTreeMap::new(),
        queue: vec![Card::HotCake.id().to_string()],
    })
    .expect("init");
    let mut engine = init.state.engine;
    engine.turn = 1;
    let legal = playtest_legal_actions(&PlaytestLegalActionsRequest {
        state: engine.clone(),
    })
    .expect("legal");
    let courier = legal
        .actions
        .iter()
        .find(|opt| {
            matches!(
                &opt.action,
                PlaytestAction::PlayAlly {
                    card,
                    kindle: 0,
                    ..
                } if card == Card::PackageCourier.id()
            )
        })
        .expect("play package courier");
    assert!(courier.discard_optional);

    let mut action = courier.action.clone();
    if let PlaytestAction::PlayAlly {
        reserved_hand_indices,
        discard_hand_index,
        ..
    } = &mut action
    {
        *reserved_hand_indices = vec![1, 2];
        *discard_hand_index = Some(3);
    } else {
        panic!("expected play ally");
    }

    let applied = playtest_apply(&PlaytestApplyRequest {
        state: engine,
        action,
    })
    .expect("apply courier with manual discard");
    assert!(
        applied.events.iter().any(|event| {
            event.discarded == Some(Card::IgnitedStab.id())
                && event.drawn == Some(Card::HotCake.id())
        }),
        "{:?}",
        applied.events
    );
}

#[test]
fn playtest_glimpse_offers_all_five_layouts() {
    let mut state = State::with_queue(
        &[Card::Brick, Card::Brick, Card::Brick, Card::Brick],
        true,
        3,
        &[Card::RendingFlames, Card::SurgingBolt, Card::Arthur],
    );
    state.phase = Phase::Materialize;
    state.turn = 2;
    state.materials = MAT_ZANDER;
    state.memory_len = 1;
    assert_eq!(state.draw_potential(), 1);

    let engine = state_to_engine(state);
    let legal = playtest_legal_actions(&PlaytestLegalActionsRequest {
        state: engine.clone(),
    })
    .expect("legal");
    let glimpse_layouts: Vec<u8> = legal
        .actions
        .iter()
        .filter_map(|opt| match &opt.action {
            PlaytestAction::MaterializeZanderMemory {
                glimpse_layout: Some(layout),
            } => Some(*layout),
            _ => None,
        })
        .collect();
    assert_eq!(glimpse_layouts, vec![0, 1, 2, 3, 4], "{glimpse_layouts:?}");

    let view = state_view(engine_to_state(&engine));
    assert_eq!(
        view.glimpse_layouts
            .iter()
            .map(|l| l.layout)
            .collect::<Vec<_>>(),
        vec![0, 1, 2, 3, 4]
    );
}

#[test]
fn playtest_blazing_throw_requires_manual_reserve() {
    let init = playtest_init(&PlaytestInitRequest {
        hand: vec![
            Card::BlazingThrow.id().to_string(),
            Card::Brick.id().to_string(),
            Card::Brick.id().to_string(),
            Card::Brick.id().to_string(),
            Card::Brick.id().to_string(),
        ],
        go_first: true,
        max_turns: 1,
        materials: BTreeMap::new(),
        queue: vec![],
    })
    .expect("init");
    let mut engine = init.state.engine;
    engine.turn = 1;
    engine.weapons = vec![0, 1, 0, 0];

    let legal = playtest_legal_actions(&PlaytestLegalActionsRequest {
        state: engine.clone(),
    })
    .expect("legal");
    let blazing = legal
        .actions
        .iter()
        .find(|opt| matches!(&opt.action, PlaytestAction::BlazingThrow { .. }))
        .expect("blazing throw with equipped blade");
    assert_eq!(blazing.reserve_count, 1);
    assert_eq!(
        blazing.played_card.as_deref(),
        Some(Card::BlazingThrow.id())
    );

    let err = playtest_apply(&PlaytestApplyRequest {
        state: engine.clone(),
        action: blazing.action.clone(),
    })
    .expect_err("reserve required");
    assert!(err.to_string().contains("Select cards to reserve"), "{err}");

    let mut action = blazing.action.clone();
    if let PlaytestAction::BlazingThrow {
        reserved_hand_indices,
        ..
    } = &mut action
    {
        *reserved_hand_indices = vec![1];
    } else {
        panic!("expected blazing throw");
    }

    let applied = playtest_apply(&PlaytestApplyRequest {
        state: engine,
        action,
    })
    .expect("apply with reserve");
    assert_eq!(applied.state.damage, 4);
    assert!(
        applied
            .events
            .iter()
            .any(|event| event.op.as_str() == "blazingThrow"),
        "{:?}",
        applied.events
    );
}

#[test]
fn playtest_increasing_danger_manual_reserve_labels_correctly() {
    use crate::line_event::format_line_event;

    let init = playtest_init(&PlaytestInitRequest {
        hand: vec![
            Card::IncreasingDanger.id().to_string(),
            Card::Brick.id().to_string(),
            Card::Brick.id().to_string(),
            Card::Brick.id().to_string(),
        ],
        go_first: true,
        max_turns: 1,
        materials: BTreeMap::new(),
        queue: vec![
            Card::SmokeOut.id().to_string(),
            Card::SparkAlight.id().to_string(),
        ],
    })
    .expect("init");
    let mut engine = init.state.engine;
    engine.turn = 1;

    let legal = playtest_legal_actions(&PlaytestLegalActionsRequest {
        state: engine.clone(),
    })
    .expect("legal");
    let danger = legal
        .actions
        .iter()
        .find(|opt| {
            matches!(
                &opt.action,
                PlaytestAction::PlayAction {
                    card,
                    kindle: 0,
                    imbue: false,
                    ..
                } if card == Card::IncreasingDanger.id()
            )
        })
        .expect("play increasing danger");
    assert_eq!(danger.reserve_count, 2);

    let mut action = danger.action.clone();
    if let PlaytestAction::PlayAction {
        reserved_hand_indices,
        ..
    } = &mut action
    {
        *reserved_hand_indices = vec![1, 2];
    } else {
        panic!("expected play action");
    }

    let applied = playtest_apply(&PlaytestApplyRequest {
        state: engine,
        action,
    })
    .expect("apply with reserve");
    let play_event = applied
        .events
        .iter()
        .find(|event| event.card == Some(Card::IncreasingDanger.id()))
        .expect("Increasing Danger play event");
    assert_ne!(play_event.imbue, Some(true));
    assert!(
        format_line_event(play_event).starts_with("Increasing Danger"),
        "{}",
        format_line_event(play_event)
    );
}

#[test]
fn playtest_creative_shock_draws_two_then_discards() {
    use crate::line_event::format_line_event;

    let init = playtest_init(&PlaytestInitRequest {
        hand: vec![
            Card::CreativeShock.id().to_string(),
            Card::Brick.id().to_string(),
            Card::Brick.id().to_string(),
            Card::Brick.id().to_string(),
            Card::Brick.id().to_string(),
        ],
        go_first: true,
        max_turns: 1,
        materials: BTreeMap::new(),
        queue: vec![
            Card::SmokeOut.id().to_string(),
            Card::SparkAlight.id().to_string(),
        ],
    })
    .expect("init");
    let mut engine = init.state.engine;
    engine.turn = 1;

    let legal = playtest_legal_actions(&PlaytestLegalActionsRequest {
        state: engine.clone(),
    })
    .expect("legal");
    let shock = legal
        .actions
        .iter()
        .find(|opt| {
            matches!(
                &opt.action,
                PlaytestAction::PlayAction {
                    card,
                    kindle: 0,
                    imbue: false,
                    ..
                } if card == Card::CreativeShock.id()
            )
        })
        .expect("play Creative Shock");
    assert_eq!(shock.reserve_count, 3);

    let mut action = shock.action.clone();
    if let PlaytestAction::PlayAction {
        reserved_hand_indices,
        ..
    } = &mut action
    {
        *reserved_hand_indices = vec![1, 2, 3];
    } else {
        panic!("expected play action");
    }

    let applied = playtest_apply(&PlaytestApplyRequest {
        state: engine,
        action,
    })
    .expect("apply Creative Shock");
    let play_event = applied
        .events
        .iter()
        .find(|event| event.card == Some(Card::CreativeShock.id()))
        .expect("Creative Shock play event");
    assert_eq!(
        format_line_event(play_event),
        "Creative Shock (draw Smoke, Spark / discard Brick)"
    );
    assert!(
        applied
            .state
            .hand
            .iter()
            .any(|id| id == Card::SmokeOut.id()),
        "{:?}",
        applied.state.hand
    );
    assert!(
        applied
            .state
            .hand
            .iter()
            .any(|id| id == Card::SparkAlight.id()),
        "{:?}",
        applied.state.hand
    );
}

#[test]
fn playtest_attack_ally_hasty_discard_per_unit() {
    use crate::line_event::EventKind;

    let mut state = State::with_queue(
        &[
            Card::Brick,
            Card::Brick,
            Card::KingdomInformant,
            Card::IgnitedStab,
        ],
        true,
        1,
        &[Card::SableRemnant, Card::ClumsyApprentice],
    );
    state.turn = 1;
    state.add_ally(Card::HastyMessenger, true, false);
    state.add_ally(Card::HastyMessenger, true, false);

    let engine = state_to_engine(state);
    let legal = playtest_legal_actions(&PlaytestLegalActionsRequest {
        state: engine.clone(),
    })
    .expect("legal");
    let attacks: Vec<_> = legal
        .actions
        .iter()
        .filter(|opt| matches!(opt.action, PlaytestAction::AttackAlly { .. }))
        .collect();
    assert_eq!(attacks.len(), 2, "Full offers one AttackAlly per ready messenger");
    assert_eq!(attacks[0].discard_steps.len(), 1);
    assert_eq!(attacks[1].discard_steps.len(), 1);

    let mut action = attacks[0].action.clone();
    if let PlaytestAction::AttackAlly {
        discard_hand_indices,
        ..
    } = &mut action
    {
        *discard_hand_indices = vec![Some(2)];
    } else {
        panic!("expected attack ally");
    }

    let applied = playtest_apply(&PlaytestApplyRequest {
        state: engine,
        action,
    })
    .expect("apply attack ally discard");
    let draws = applied
        .events
        .iter()
        .filter(|event| event.kind == EventKind::OnAttackDraw)
        .count();
    assert_eq!(draws, 1, "{:?}", applied.events);
}

#[test]
fn playtest_tristan_on_enter_offers_prep_or_agility() {
    use crate::line_event::format_line_event;

    let mut materials = BTreeMap::new();
    materials.insert("tristan_1".to_string(), 1);
    let init = playtest_init(&PlaytestInitRequest {
        hand: vec![
            Card::Brick.id().to_string(),
            Card::Brick.id().to_string(),
            Card::Brick.id().to_string(),
            Card::Brick.id().to_string(),
        ],
        go_first: true,
        max_turns: 2,
        materials,
        queue: vec![],
    })
    .expect("init");
    let mut engine = init.state.engine;
    engine.turn = 1;
    engine.phase = Phase::Materialize as u8;
    engine.memory[Card::Brick.index()] = 1;
    engine.memory_len = 1;
    engine.hand[Card::Brick.index()] = engine.hand[Card::Brick.index()].saturating_sub(1);
    engine.hand_len = engine.hand_len.saturating_sub(1);

    let legal = playtest_legal_actions(&PlaytestLegalActionsRequest {
        state: engine.clone(),
    })
    .expect("legal");
    let labels: Vec<&str> = legal.actions.iter().map(|opt| opt.label.as_str()).collect();
    assert!(labels.contains(&"Materialize Tristan (Prep)"), "{labels:?}");
    assert!(
        labels.contains(&"Materialize Tristan (Agility 3)"),
        "{labels:?}"
    );

    let agility = legal
        .actions
        .iter()
        .find(|opt| {
            matches!(
                opt.action,
                PlaytestAction::MaterializeTristanMemory { agility: true }
            )
        })
        .expect("agility choice");
    let applied = playtest_apply(&PlaytestApplyRequest {
        state: engine,
        action: agility.action.clone(),
    })
    .expect("apply agility");
    assert_eq!(applied.state.agility, 3);
    assert_eq!(applied.state.prep, 0);
    assert!(applied.state.tristan_leveled);
    assert!(
        applied
            .events
            .iter()
            .any(|event| format_line_event(event) == "Tristan Lvl 1 Agility 3"),
        "{:?}",
        applied.events
    );
}

/// `/game/v1` contract: fixed hand init → legal includes Pass → apply Pass advances phase.
#[test]
fn game_v1_fixture_init_legal_apply_pass() {
    let init = playtest_init(&PlaytestInitRequest {
        hand: vec![
            "arthur".to_string(),
            "ignited_stab".to_string(),
            Card::Brick.id().to_string(),
        ],
        go_first: true,
        max_turns: 2,
        materials: BTreeMap::new(),
        queue: vec![],
    })
    .expect("init");

    let legal = playtest_legal_actions(&PlaytestLegalActionsRequest {
        state: init.state.engine.clone(),
    })
    .expect("legal");
    let ops: Vec<&str> = legal
        .actions
        .iter()
        .map(|opt| match &opt.action {
            PlaytestAction::Pass => "pass",
            PlaytestAction::PlayAlly { .. } => "playAlly",
            PlaytestAction::PlayAttack { .. } => "playAttack",
            PlaytestAction::PlayAction { .. } => "playAction",
            PlaytestAction::PlayItem { .. } => "playItem",
            _ => "other",
        })
        .collect();
    assert!(
        ops.contains(&"pass"),
        "fixture legal actions must include pass: {ops:?}"
    );

    let pass = legal
        .actions
        .iter()
        .find(|opt| matches!(opt.action, PlaytestAction::Pass))
        .expect("pass option");
    let applied = playtest_apply(&PlaytestApplyRequest {
        state: init.state.engine.clone(),
        action: pass.action.clone(),
    })
    .expect("apply pass");
    assert_ne!(
        applied.state.phase, init.state.phase,
        "pass must advance phase"
    );
    assert!(!applied.events.is_empty(), "pass must emit events");
}

/// Playtest legal listing must match Full rules, not SolverReduced.
#[test]
fn playtest_legal_actions_locked_to_full_rules() {
    let mut state = State::with_queue(&[], true, 3, &[]);
    state.phase = Phase::Main;
    state.turn = 1;
    state.champion_awake = true;
    state.add_ally(Card::Arthur, true, true);
    state.add_ally(Card::ClumsyApprentice, true, false);

    let engine = state_to_engine(state);
    let playtest = playtest_legal_actions(&PlaytestLegalActionsRequest {
        state: engine,
    })
    .expect("playtest legal");
    let full = crate::rules::legal_actions_with_mode(state, crate::rules::RulesMode::Full);
    let reduced =
        crate::rules::legal_actions_with_mode(state, crate::rules::RulesMode::SolverReduced);

    assert_eq!(
        playtest.actions.len(),
        full.len(),
        "playtest legal count must equal Full, not SolverReduced (full={}, reduced={})",
        full.len(),
        reduced.len()
    );
    assert!(
        playtest
            .actions
            .iter()
            .any(|opt| matches!(opt.action, PlaytestAction::AttackAlly { .. })),
        "Full/playtest must offer AttackAlly while Arthur is ready"
    );
    assert!(
        !playtest
            .actions
            .iter()
            .any(|opt| matches!(opt.action, PlaytestAction::AttackOthers { .. })),
        "Full/playtest must not offer bulk AttackOthers"
    );
    assert!(
        !reduced
            .iter()
            .any(|a| matches!(a, crate::model::Action::AttackOthers)),
        "sanity: SolverReduced omits AttackOthers"
    );
}
