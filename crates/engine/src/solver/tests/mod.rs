use std::collections::BTreeMap;

use super::actions::{
    collapse_mate_ending_siblings, optimistic_remaining_from_reserve, order_actions_damage_first,
    reservation_budget, solver_actions,
};
use super::apply::apply;
use super::hash::hex_lower;
use super::search::Search;
use super::*;
use crate::cards::{Card, parse_card};
use crate::error::EngineError;
use crate::line_event::{EventKind, EventTape, LineEvent, format_line_event};
use crate::model::{
    ALL_MATERIALS, Action, MAT_BLADE, MAT_HAMMER, MAT_RING, MAT_RIPPER, MAT_SOULKNIFE, MAT_TRISTAN,
    MAT_ZANDER, MAT_ZANDER_2, Phase, SimType, SolveRequest, State, Weapon,
};
use crate::version::ENGINE_VERSION;

fn labels(events: &[LineEvent]) -> Vec<String> {
    events.iter().map(format_line_event).collect()
}

#[test]
fn opening_hand_hash_matches_sorted_sha256_of_card_ids() {
    // Same contract as apps/api handHash: SHA-256 of sorted ids joined by ",".
    let hand = [Card::IgnitedStab, Card::KingdomInformant, Card::Brick];
    let mut ids: Vec<&str> = hand.iter().map(|card| card.id()).collect();
    ids.sort_unstable();
    let expected = {
        use sha2::{Digest, Sha256};
        let digest = Sha256::digest(ids.join(",").as_bytes());
        hex_lower(&digest)
    };
    assert_eq!(opening_hand_hash(&hand), expected);
    // Order-independent.
    assert_eq!(
        opening_hand_hash(&[Card::Brick, Card::IgnitedStab, Card::KingdomInformant]),
        expected
    );
}

#[test]
fn floating_memory_returns_at_recollect_and_banishes_for_zander() {
    let state = State::with_queue(
        &[Card::IgnitedStab, Card::KingdomInformant],
        false,
        2,
        &[Card::Brick],
    );
    let (after_play, _) = apply(
        state,
        Action::PlayAttack {
            card: Card::IgnitedStab,
            wield: None,
            prepared: false,
            doubled: false,
            command_ally: None,
        },
    );
    assert_eq!(after_play.memory[Card::KingdomInformant.index()], 1);

    let (after_pass, _) = apply(after_play, Action::Pass);
    let (after_mate, _) = apply(after_pass, Action::SkipMaterialize);
    let (after_recollect, _) = apply(after_mate, Action::SkipPreRecollect);

    assert_eq!(after_recollect.float_gy, 0);
    assert!(
        after_recollect.has(Card::KingdomInformant),
        "floating memory should return to hand at recollect"
    );

    let mut for_zander = after_recollect;
    for_zander.champion_level = 0;
    for_zander.phase = Phase::Materialize;
    for_zander.turn = 1;
    for_zander.hand[Card::KingdomInformant.index()] = 0;
    for_zander.hand_len = for_zander.hand_len.saturating_sub(1);
    for_zander.memory[Card::KingdomInformant.index()] = 1;
    for_zander.memory_len = 1;

    let (after_zander, steps) = apply(
        for_zander,
        Action::MaterializeZanderMemory {
            glimpse_layout: None,
        },
    );
    assert_eq!(after_zander.memory_len, 0);
    assert_eq!(after_zander.float_gy, 0);
    assert!(!after_zander.has(Card::KingdomInformant));
    assert!(
        steps
            .iter()
            .any(|step| format_line_event(step).contains("from Mem")),
        "{steps:?}"
    );
}

#[test]
fn increasing_danger_refused_when_it_spends_last_damage_hand() {
    // Smoke Out is the only damage play; paying ID reserves it → no Main damage left.
    let mut state = State::with_queue_and_materials(
        &[Card::IncreasingDanger, Card::SmokeOut, Card::Brick],
        false,
        2,
        &[Card::Brick, Card::Brick],
        0,
    );
    state.phase = Phase::Main;
    state.turn = 1; // final turn only
    state.champion_level = 1;
    state.champion_awake = true;

    let legal = solver_actions(state, false);
    assert!(
        !legal.iter().any(|action| matches!(
            action,
            Action::PlayAction {
                card: Card::IncreasingDanger,
                ..
            }
        )),
        "ID should not spend the last damage card: {legal:?}"
    );
    assert!(
        legal.iter().any(|action| matches!(
            action,
            Action::PlayAction {
                card: Card::SmokeOut,
                ..
            }
        )),
        "{legal:?}"
    );
}

#[test]
fn increasing_danger_allowed_on_earlier_turns_even_if_it_spends_damage() {
    let mut state = State::with_queue_and_materials(
        &[Card::IncreasingDanger, Card::SmokeOut, Card::Brick],
        false,
        2,
        &[Card::Brick, Card::Brick],
        0,
    );
    state.phase = Phase::Main;
    state.turn = 0;
    state.champion_level = 1;
    state.champion_awake = true;

    let legal = solver_actions(state, false);
    assert!(
        legal.iter().any(|action| matches!(
            action,
            Action::PlayAction {
                card: Card::IncreasingDanger,
                ..
            }
        )),
        "earlier turns may dig even if it spends this Main's damage: {legal:?}"
    );
}

#[test]
fn increasing_danger_allowed_when_no_damage_play_exists() {
    let mut state = State::with_queue_and_materials(
        &[Card::IncreasingDanger, Card::Brick, Card::Brick],
        false,
        2,
        &[Card::Demolition, Card::Brick],
        0,
    );
    state.phase = Phase::Main;
    state.turn = 1;
    state.champion_level = 1;

    let legal = solver_actions(state, false);
    assert!(
        legal.iter().any(|action| matches!(
            action,
            Action::PlayAction {
                card: Card::IncreasingDanger,
                ..
            }
        )),
        "digging is fine when nothing damages yet: {legal:?}"
    );
}

#[test]
fn undeniable_truth_refused_when_sacrifice_kills_last_damage() {
    // Awake ally is the only damage; Truth sacs it and pays the brick.
    let mut state = State::with_queue_and_materials(
        &[Card::UndeniableTruth, Card::Brick],
        false,
        2,
        &[Card::Brick, Card::Brick],
        0,
    );
    state.phase = Phase::Main;
    state.turn = 1;
    state.champion_level = 1;
    state.add_ally(Card::ClumsyApprentice, true, false);

    let legal = solver_actions(state, false);
    assert!(
        !legal.iter().any(|action| matches!(
            action,
            Action::PlayAction {
                card: Card::UndeniableTruth,
                ..
            }
        )),
        "Truth should not sac the only attacker: {legal:?}"
    );
    assert!(
        legal
            .iter()
            .any(|action| matches!(action, Action::AttackOthers)),
        "{legal:?}"
    );
}

#[test]
fn undeniable_truth_kept_when_prep_enables_blade() {
    // Smoke Out is spendable damage now; Truth reserves it, but +prep unlocks Blade→swing.
    let mut state = State::with_queue_and_materials(
        &[Card::UndeniableTruth, Card::SmokeOut],
        false,
        2,
        &[],
        MAT_BLADE,
    );
    state.phase = Phase::Main;
    state.turn = 1;
    state.champion_level = 1;
    state.champion_awake = true;
    state.add_ally(Card::ClumsyApprentice, false, false);

    let legal = solver_actions(state, false);
    assert!(
        legal.iter().any(|action| matches!(
            action,
            Action::PlayAction {
                card: Card::UndeniableTruth,
                ..
            }
        )),
        "Truth→Blade should remain legal: {legal:?}"
    );
}

#[test]
fn draw_potential_counts_recollect_windows_and_hand_engines() {
    // Mate on turn 0 of 3 → 3 recollect draws still owed.
    let mut state = State::with_queue(
        &[
            Card::IncreasingDanger,
            Card::Brick,
            Card::Brick,
            Card::Brick,
        ],
        true,
        3,
        &[
            Card::Brick,
            Card::Brick,
            Card::Brick,
            Card::Brick,
            Card::Brick,
            Card::Brick,
            Card::Brick,
            Card::Brick,
        ],
    );
    state.phase = Phase::Materialize;
    state.turn = 0;
    assert_eq!(state.recollect_draw_potential(), 3);
    // Increasing Danger is playable (4 cards in hand/memory) → +2.
    assert_eq!(state.draw_potential(), 5);

    // After leaving Mate on turn 0, only turns 1 and 2 remain.
    state.phase = Phase::Main;
    assert_eq!(state.recollect_draw_potential(), 2);
    assert_eq!(state.draw_potential(), 4);

    // Truth needs an ally; without one it should not count.
    state.hand[Card::IncreasingDanger.index()] = 0;
    state.hand[Card::UndeniableTruth.index()] = 1;
    state.hand_len = 4;
    assert_eq!(state.draw_potential(), 2); // recollects only
    state.add_ally(Card::ClumsyApprentice, true, false);
    assert_eq!(state.draw_potential(), 3); // + Truth
}

#[test]
fn draw_potential_counts_ring_and_memory_engines() {
    let mut state = State::with_queue(
        &[Card::Brick, Card::Brick, Card::Brick, Card::Brick],
        true,
        3,
        &[],
    );
    state.phase = Phase::Materialize;
    state.turn = 0;
    state.materials = 0;
    // 3 Mate windows, no ring → recollects only.
    assert_eq!(state.recollect_draw_potential(), 3);
    assert_eq!(state.draw_potential(), 3);

    // Ring still in the material deck: +1 draw per future Mate step.
    state.materials = MAT_RING;
    assert_eq!(state.draw_potential(), 6); // 3 recollect + 3 ring

    // After materialize+banish, ring is gone from materials and not on field.
    state.materials = 0;
    state.ring = false;
    state.phase = Phase::Main;
    assert_eq!(state.recollect_draw_potential(), 2);
    assert_eq!(state.draw_potential(), 2);

    state.memory[Card::ClumsyApprentice.index()] = 1;
    state.memory_len = 1;
    assert_eq!(state.draw_potential(), 3); // 2 recollect + Clumsy
}

#[test]
fn glimpse_tail_orders_cover_top_and_bottom() {
    // Two distinct peeked cards + a middle card → five layouts (not six):
    // both-top ×2, split ×2, both-bottom ×1.
    let state = State::with_queue(
        &[],
        false,
        1,
        &[Card::Brick, Card::IgnitedStab, Card::Arthur],
    );
    assert_eq!(state.glimpse_layout_count(), 5);
    let mut reordered = state;
    reordered.apply_glimpse_layout(1);
    assert_eq!(
        reordered.queue[reordered.queue_pos as usize],
        Card::IgnitedStab as u8
    );
    // Both-bottom layout (index 4) keeps original relative order.
    let mut both_bottom = state;
    both_bottom.apply_glimpse_layout(4);
    let pos = both_bottom.queue_pos as usize;
    assert_eq!(both_bottom.queue[pos], Card::Arthur as u8);
    assert_eq!(both_bottom.queue[pos + 1], Card::Brick as u8);
    assert_eq!(both_bottom.queue[pos + 2], Card::IgnitedStab as u8);
}

#[test]
fn glimpse_collapses_to_unique_tops_when_one_draw_remains() {
    // Mate on the last turn: only the recollect draw remains (potential 1).
    // A-top layouts (both-stay / A-top-B-bottom) collapse; same for B-top.
    // Both-bottom keeps a third top when middle is non-empty.
    let mut state = State::with_queue(
        &[Card::Brick, Card::Brick, Card::Brick, Card::Brick],
        true,
        3,
        &[Card::Brick, Card::IgnitedStab, Card::Arthur],
    );
    state.phase = Phase::Materialize;
    state.turn = 2;
    state.materials = 0;
    assert_eq!(state.draw_potential(), 1);
    assert_eq!(state.glimpse_layout_count(), 5);
    let relevant = state.glimpse_relevant_layouts();
    assert_eq!(relevant, vec![0, 1, 4], "{relevant:?}");

    // Empty middle: only two tops (A vs B); both-bottom duplicates both-stay.
    let mut tight = State::with_queue(
        &[Card::Brick, Card::Brick, Card::Brick, Card::Brick],
        true,
        3,
        &[Card::Brick, Card::IgnitedStab],
    );
    tight.phase = Phase::Materialize;
    tight.turn = 2;
    tight.materials = 0;
    assert_eq!(tight.draw_potential(), 1);
    assert_eq!(tight.glimpse_relevant_layouts(), vec![0, 1]);
}

#[test]
fn solver_glimpse_offers_all_five_layouts() {
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

    let legal = solver_actions(state, true);
    let glimpse_layouts: Vec<u8> = legal
        .iter()
        .filter_map(|action| match action {
            Action::MaterializeZanderMemory {
                glimpse_layout: Some(layout),
            } => Some(*layout),
            _ => None,
        })
        .collect();
    assert_eq!(glimpse_layouts, vec![0, 1, 2, 3, 4], "{glimpse_layouts:?}");
}

#[test]
fn glimpse_skipped_when_draw_potential_is_zero() {
    let mut state = State::with_queue(
        &[Card::Brick; 4],
        true,
        3,
        &[Card::Brick, Card::IgnitedStab],
    );
    state.phase = Phase::Main;
    state.turn = 2; // last turn, Mate already done → no recollect draws left
    state.materials = 0;
    assert_eq!(state.draw_potential(), 0);
    assert!(state.glimpse_relevant_layouts().is_empty());
}

#[test]
fn mate_ending_siblings_collapse_identical_post_mate_keys() {
    // All-brick queue: every Glimpse permutation is the same memo board after Mate.
    let mut state = State::with_queue_and_materials(
        &[Card::Brick, Card::Brick, Card::Brick, Card::Brick],
        false,
        2,
        &[Card::Brick, Card::Brick, Card::Brick],
        MAT_ZANDER,
    );
    state.phase = Phase::Materialize;
    state.turn = 1;
    state.memory[Card::Brick.index()] = 1;
    state.memory_len = 1;

    let layout_count = state.glimpse_layout_count();
    assert!(
        layout_count >= 2,
        "need multiple Glimpse layouts to collapse"
    );
    let endings: Vec<Action> = (0..layout_count)
        .map(|layout| Action::MaterializeZanderMemory {
            glimpse_layout: Some(layout),
        })
        .chain(std::iter::once(Action::SkipMaterialize))
        .collect();

    let collapsed = collapse_mate_ending_siblings(state, endings);
    let zander = collapsed
        .iter()
        .filter(|action| matches!(action, Action::MaterializeZanderMemory { .. }))
        .count();
    assert_eq!(
        zander, 1,
        "identical brick permutations must share one post-Mate key: {collapsed:?}"
    );
    assert!(
        collapsed
            .iter()
            .any(|action| matches!(action, Action::SkipMaterialize)),
        "Skip differs (no Zander level): {collapsed:?}"
    );
}

#[test]
fn mate_ending_siblings_keep_distinct_post_mate_keys() {
    let mut state = State::with_queue_and_materials(
        &[Card::Brick, Card::Brick, Card::Brick, Card::Brick],
        false,
        2,
        &[Card::Brick, Card::IgnitedStab, Card::Arthur],
        MAT_ZANDER | MAT_HAMMER,
    );
    state.phase = Phase::Materialize;
    state.turn = 1;
    state.memory[Card::Brick.index()] = 1;
    state.memory_len = 1;

    let legal = solver_actions(state, true);
    let zander = legal
        .iter()
        .filter(|action| matches!(action, Action::MaterializeZanderMemory { .. }))
        .count();
    assert!(
        zander >= 2,
        "distinct tops must remain separate Mate endings: {legal:?}"
    );
    assert!(
        legal
            .iter()
            .any(|action| matches!(action, Action::MaterializeHammer)),
        "{legal:?}"
    );
    assert!(
        legal
            .iter()
            .any(|action| matches!(action, Action::SkipMaterialize)),
        "{legal:?}"
    );
}

#[test]
fn mate_collapse_does_not_drop_fast_plays() {
    let mut state = State::with_queue_and_materials(
        &[Card::Demolition, Card::Brick, Card::Brick, Card::Brick],
        false,
        2,
        &[Card::Brick, Card::Brick],
        0,
    );
    state.phase = Phase::Materialize;
    state.turn = 1;

    let (after_mate, _) = apply(state, Action::SkipMaterialize);
    let legal = solver_actions(after_mate, false);
    assert!(
        legal.iter().any(|action| matches!(
            action,
            Action::PlayAction {
                card: Card::Demolition,
                ..
            }
        )),
        "fast Demolition must be offered in pre-recollect: {legal:?}"
    );
    assert!(
        legal
            .iter()
            .any(|action| matches!(action, Action::SkipPreRecollect)),
        "{legal:?}"
    );
}

#[test]
fn reservation_budget_scales_influence_by_mains_left() {
    let mut state = State::with_queue(&[Card::Brick; 7], true, 3, &[]);
    state.phase = Phase::Main;
    state.turn = 0;
    assert_eq!(state.influence(), 7);
    assert_eq!(reservation_budget(state), 21); // 7 × 3
    assert_eq!(optimistic_remaining_from_reserve(21), 63); // 21 × 3
    assert_eq!(optimistic_remaining_from_reserve(5), 15);
    assert_eq!(optimistic_remaining_from_reserve(4), 12);
}

#[test]
fn damage_first_orders_burn_before_draw_engines() {
    // Extra brick so ID payment leaves Smoke Out still affordable (soft dig gate).
    let mut state = State::with_queue_and_materials(
        &[
            Card::SmokeOut,
            Card::IncreasingDanger,
            Card::Brick,
            Card::Brick,
            Card::Brick,
        ],
        false,
        2,
        &[],
        0,
    );
    state.phase = Phase::Main;
    state.champion_level = 1;

    let mut legal = solver_actions(state, false);
    assert!(
        legal.iter().any(|action| matches!(
            action,
            Action::PlayAction {
                card: Card::SmokeOut,
                ..
            }
        )),
        "{legal:?}"
    );
    assert!(
        legal.iter().any(|action| matches!(
            action,
            Action::PlayAction {
                card: Card::IncreasingDanger,
                ..
            }
        )),
        "{legal:?}"
    );

    order_actions_damage_first(&state, &mut legal);
    let smoke = legal.iter().position(|action| {
        matches!(
            action,
            Action::PlayAction {
                card: Card::SmokeOut,
                ..
            }
        )
    });
    let dig = legal.iter().position(|action| {
        matches!(
            action,
            Action::PlayAction {
                card: Card::IncreasingDanger,
                ..
            }
        )
    });
    assert!(
        smoke.unwrap() < dig.unwrap(),
        "Smoke Out should expand before Increasing Danger: {legal:?}"
    );
}

#[test]
fn materialize_zander_with_glimpse_reorders_queue() {
    let mut state = State::with_queue(
        &[
            Card::Arthur,
            Card::Brick,
            Card::Brick,
            Card::Brick,
            Card::Brick,
            Card::Brick,
            Card::Brick,
        ],
        true,
        3,
        &[Card::Brick, Card::IgnitedStab],
    );
    state.turn = 1;
    state.phase = Phase::Materialize;
    state.memory[Card::Brick.index()] = 1;
    state.memory_len = 1;

    let (after_mate, steps) = apply(
        state,
        Action::MaterializeZanderMemory {
            glimpse_layout: Some(1),
        },
    );
    assert!(
        steps.iter().any(|step| step.kind.as_str() == "glimpse"),
        "{steps:?}"
    );
    assert_eq!(after_mate.phase, Phase::PreRecollect);

    let (after, recollect_steps) = apply(after_mate, Action::SkipPreRecollect);
    assert!(
        recollect_steps
            .iter()
            .any(|step| step.kind.as_str() == "recollect" && step.drawn == Some("ignited_stab")),
        "{recollect_steps:?}"
    );
    assert_eq!(after.champion_level, 1);
}

#[test]
fn zander_prefers_banishing_floating_memory_from_gy() {
    let mut state = State::with_queue(&[], false, 3, &[Card::Brick]);
    state.champion_level = 0;
    state.phase = Phase::Materialize;
    state.turn = 1;
    state.send_to_gy(Card::KingdomInformant);

    let (after, steps) = apply(
        state,
        Action::MaterializeZanderMemory {
            glimpse_layout: None,
        },
    );
    assert_eq!(after.float_gy, 0);
    assert_eq!(after.gy_total, 0);
    assert!(
        steps
            .iter()
            .any(|step| format_line_event(step).contains("Float from GY")),
        "{steps:?}"
    );
}

#[test]
fn equal_damage_prefers_higher_end_influence() {
    // Playing Hot Cake deals no damage but spends cards to memory; Pass keeps them
    // in hand. Same damage (0), so the line with more hand+memory at the end wins.
    let hand = [Card::HotCake, Card::Brick, Card::Brick, Card::Brick];
    let result = solve_cards(&hand, true, 1, ALL_MATERIALS).expect("solve_cards");
    assert_eq!(result.max_damage, 0, "{result:#?}");
    assert_eq!(result.end_influence, 4, "{result:#?}");
    assert!(
        !result
            .events
            .iter()
            .any(|step| format_line_event(step).contains("Hot Cake")),
        "should Pass instead of playing Hot Cake: {:?}",
        labels(&result.events)
    );
}

#[test]
fn drill_three_meets_published_twenty() {
    let hand = [
        Card::RendingFlames,
        Card::Arthur,
        Card::HastyMessenger,
        Card::KingdomInformant,
        Card::IgnitedStab,
        Card::SableRemnant,
        Card::ClumsyApprentice,
    ];
    let result = solve_cards(&hand, true, 3, ALL_MATERIALS).expect("solve_cards");
    assert!(result.max_damage >= 20, "{result:#?}");
    assert_eq!(result.effective.engine_version, ENGINE_VERSION);
    assert_eq!(result.effective.max_turns, Some(3));
    assert_eq!(result.effective.sim_type, Some(SimType::FireBrick));
}

#[test]
fn going_second_draws_at_start_of_first_turn() {
    let hand = [
        Card::Arthur,
        Card::Arthur,
        Card::ClumsyApprentice,
        Card::KingdomInformant,
        Card::KingdomInformant,
        Card::RedHare,
        Card::PepperedChef,
    ];
    let (pass, stats) = solve_pass(&hand, false, 2, &[Card::IgnitedStab], false, ALL_MATERIALS)
        .expect("solve_pass");
    assert_eq!(
        pass.events.first().and_then(|event| event.drawn),
        Some("ignited_stab"),
        "{}",
        labels(&pass.events).join(" | ")
    );
    assert_eq!(stats.drawn[Card::IgnitedStab.index()], 1);
}

#[test]
fn fire_brick_going_second_draws_brick_without_a_deck() {
    use crate::model::SolveRequest;
    use std::collections::BTreeMap;

    let hand = [
        Card::Arthur,
        Card::Arthur,
        Card::ClumsyApprentice,
        Card::KingdomInformant,
        Card::KingdomInformant,
        Card::RedHare,
        Card::PepperedChef,
    ];
    let result = solve(&SolveRequest {
        hand: hand.iter().map(|card| card.id().to_string()).collect(),
        go_first: false,
        max_turns: 2,
        sim_type: SimType::FireBrick,
        deck: BTreeMap::new(),
        queue: None,
        rollouts: 1,
        seed: 1,
        budget: crate::budget::Budget::default(),
        materials: BTreeMap::new(),
        max_threads: None,
        glimpse_enabled: None,
        max_hand_duration_secs: None,

        max_card_draw: None,
    })
    .unwrap();
    assert_eq!(
        result.events.first().and_then(|event| event.drawn),
        Some("brick"),
        "with no deck attached, the opening draw stays a Fire Brick: {}",
        labels(&result.events).join(" | ")
    );
}

#[test]
fn fire_brick_going_second_draws_a_real_card_from_an_attached_deck() {
    use crate::model::SolveRequest;
    use std::collections::BTreeMap;

    let hand = [
        Card::Arthur,
        Card::Arthur,
        Card::ClumsyApprentice,
        Card::KingdomInformant,
        Card::KingdomInformant,
        Card::RedHare,
        Card::PepperedChef,
    ];
    let deck = BTreeMap::from([("ignited_stab".into(), 4_u8), ("brick".into(), 54_u8)]);
    let result = solve(&SolveRequest {
        hand: hand.iter().map(|card| card.id().to_string()).collect(),
        go_first: false,
        max_turns: 2,
        sim_type: SimType::FireBrick,
        deck: deck.clone(),
        queue: None,
        rollouts: 1,
        seed: 7,
        budget: crate::budget::Budget::default(),
        materials: BTreeMap::new(),
        max_threads: None,
        glimpse_enabled: None,
        max_hand_duration_secs: None,

        max_card_draw: None,
    })
    .unwrap();
    let drawn = result.events.first().and_then(|event| event.drawn);
    assert!(
        drawn.is_some(),
        "expected a real opening draw: {}",
        labels(&result.events).join(" | ")
    );

    let again = solve(&SolveRequest {
        hand: hand.iter().map(|card| card.id().to_string()).collect(),
        go_first: false,
        max_turns: 2,
        sim_type: SimType::FireBrick,
        deck,
        queue: None,
        rollouts: 1,
        seed: 7,
        budget: crate::budget::Budget::default(),
        materials: BTreeMap::new(),
        max_threads: None,
        glimpse_enabled: None,
        max_hand_duration_secs: None,

        max_card_draw: None,
    })
    .unwrap();
    assert_eq!(
        drawn,
        again.events.first().and_then(|event| event.drawn),
        "same seed and deck must draw the same opening card"
    );
}

#[test]
fn fire_brick_going_second_prefers_an_explicit_remaining_queue() {
    use crate::model::SolveRequest;
    use std::collections::BTreeMap;

    let hand = [
        Card::Arthur,
        Card::Arthur,
        Card::ClumsyApprentice,
        Card::KingdomInformant,
        Card::KingdomInformant,
        Card::RedHare,
        Card::PepperedChef,
    ];
    let result = solve(&SolveRequest {
        hand: hand.iter().map(|card| card.id().to_string()).collect(),
        go_first: false,
        max_turns: 2,
        sim_type: SimType::FireBrick,
        deck: BTreeMap::new(),
        queue: Some(vec!["ignited_stab".into(), "brick".into()]),
        rollouts: 1,
        seed: 42,
        budget: crate::budget::Budget::default(),
        materials: BTreeMap::new(),
        max_threads: None,
        glimpse_enabled: None,
        max_hand_duration_secs: None,

        max_card_draw: None,
    })
    .unwrap();
    assert_eq!(
        result.events.first().and_then(|event| event.drawn),
        Some("ignited_stab"),
        "an explicit remaining-deck order should be used as-is: {}",
        labels(&result.events).join(" | ")
    );
}

#[test]
fn drill_one_is_twenty_six() {
    let hand = [
        Card::BlazingThrow,
        Card::Arthur,
        Card::RedHare,
        Card::Arthur,
        Card::BlazingThrow,
        Card::KingdomInformant,
        Card::KingdomInformant,
    ];
    let result = solve_cards(&hand, true, 3, ALL_MATERIALS).expect("solve_cards");
    assert_eq!(result.max_damage, 24, "{result:#?}");
    assert_eq!(result.effective.go_first, Some(true));
}

#[test]
fn new_deck_cards_are_recognized() {
    for name in [
        "sadi_blood_harvester",
        "corhazi_courier",
        "dazzling_courtesan",
        "march_hare_mottled_host",
        "rococo_explosive_maven",
        "vermilion_decree",
        "xiao_qiao_cinderkeeper",
        "planted_explosive",
        "intensified_pyre",
        "hot_cake",
        "uncanny_realization",
        "virgil_altered_future",
        "vicious_slice",
        "manic_zealot",
        "demolition",
        "surging_bolt",
        "woodland_squirrels",
        "duchess_six_of_hearts",
        "wandering_glaivier",
        "flagrant_guide",
    ] {
        assert!(parse_card(name).is_some(), "{name}");
    }
}

#[test]
fn arthur_buff_attributed_to_arthur() {
    let hand = [
        Card::Arthur,
        Card::ClumsyApprentice,
        Card::KingdomInformant,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
    ];
    let result = solve_cards(&hand, false, 2, ALL_MATERIALS).expect("solve_cards");
    let arthur = result
        .card_stats
        .iter()
        .find(|stat| stat.card == "arthur")
        .expect("arthur stat row");
    assert!(
        arthur.attacks >= 1,
        "Arthur should attack at least once, got {}",
        arthur.attacks
    );
    assert!(
        arthur.damage >= 3,
        "Arthur should get own attack plus rested buff, got {}",
        arthur.damage
    );
    let clumsy = result
        .card_stats
        .iter()
        .find(|stat| stat.card == "clumsy_apprentice")
        .expect("clumsy stat row");
    if clumsy.attacks > 0 {
        assert_eq!(
            clumsy.damage, clumsy.attacks,
            "buffed ally should only get base attack power per attack"
        );
    }
}

#[test]
fn poisoned_dagger_must_activate_before_other_pre_recollect_actions() {
    let mut state = State::with_queue(&[Card::IgnitedStab], false, 2, &[]);
    state.phase = Phase::PreRecollect;
    state.dagger = true;
    state.dagger_ready = true;
    state.champion_level = 1;
    state.champion_awake = true;

    let legal = solver_actions(state, false);
    assert_eq!(legal.len(), 1, "{legal:?}");
    assert!(matches!(legal[0], Action::ActivateDagger), "{legal:?}");

    let (after, _) = apply(state, Action::ActivateDagger);
    let legal_after = solver_actions(after, false);
    assert!(
        !legal_after
            .iter()
            .any(|action| matches!(action, Action::ActivateDagger)),
        "{legal_after:?}"
    );
    assert!(
        legal_after
            .iter()
            .any(|action| matches!(action, Action::SkipPreRecollect)),
        "{legal_after:?}"
    );
}

#[test]
fn other_allies_cannot_attack_while_arthur_is_ready() {
    let mut state = State::with_queue(&[], false, 2, &[]);
    state.add_ally(Card::Arthur, true, true);
    state.add_ally(Card::ClumsyApprentice, true, false);

    let legal = solver_actions(state, false);
    assert!(
        legal
            .iter()
            .any(|action| matches!(action, Action::AttackArthur(_))),
        "{legal:?}"
    );
    assert!(
        !legal
            .iter()
            .any(|action| matches!(action, Action::AttackOthers)),
        "AttackOthers must wait until Arthur has attacked: {legal:?}"
    );

    let (after_arthur, _) = apply(state, Action::AttackArthur(0));
    let legal_after = solver_actions(after_arthur, false);
    assert!(
        legal_after
            .iter()
            .any(|action| matches!(action, Action::AttackOthers)),
        "{legal_after:?}"
    );
}

#[test]
fn vicious_slice_deals_three_vs_human_while_assassin() {
    let mut state = State::with_queue(&[Card::ViciousSlice, Card::Brick], false, 1, &[]);
    state.champion_level = 1;
    state.champion_awake = true;
    let legal = solver_actions(state, false);
    let attack = legal
        .iter()
        .copied()
        .find(|action| {
            matches!(
                action,
                Action::PlayAttack {
                    card: Card::ViciousSlice,
                    ..
                }
            )
        })
        .expect("vicious slice play");
    let (after, steps) = apply(state, attack);
    assert_eq!(after.damage, 3, "{steps:?}");
    assert!(
        steps
            .iter()
            .any(|step| format_line_event(step).contains("Vicious Slice (Human)")),
        "{steps:?}"
    );
}

#[test]
fn champion_can_attack_with_weapon_without_attack_card() {
    let mut state = State::with_queue(&[], false, 2, &[]);
    state.champion_level = 1;
    state.champion_awake = true;
    state.prep = 1;
    state.materials = MAT_BLADE;

    assert!(
        solver_actions(state, false)
            .iter()
            .any(|action| matches!(action, Action::MercenaryBlade)),
        "blade should be materializable"
    );
    let (equipped, _) = apply(state, Action::MercenaryBlade);
    assert!(equipped.has_weapon(Weapon::MercenaryBlade));
    assert!(
        equipped.champion_awake,
        "materializing the blade must not rest the champion"
    );
    assert!(
        solver_actions(equipped, false)
            .iter()
            .any(|action| matches!(action, Action::AttackWithWeapon(_))),
        "awake champion with weapon must be able to swing"
    );

    let (after, steps) = apply(equipped, Action::AttackWithWeapon(Weapon::MercenaryBlade));
    assert_eq!(after.damage, 1, "{steps:?}");
    assert!(!after.champion_awake);
    assert!(!after.has_weapon(Weapon::MercenaryBlade));
    assert!(
        steps
            .iter()
            .any(|step| format_line_event(step) == "Attack with Mercenary's Blade"),
        "{steps:?}"
    );
}

#[test]
fn impact_hammer_self_damage_enables_heated_vengeance() {
    let mut state = State::with_queue(
        &[Card::HeatedVengeance, Card::Brick, Card::Brick, Card::Brick],
        false,
        1,
        &[],
    );
    state.champion_level = 1;
    state.equip_weapon(Weapon::ImpactHammer);

    let (after_swing, steps) = apply(state, Action::AttackWithWeapon(Weapon::ImpactHammer));
    assert!(after_swing.champion_damaged);
    assert!(
        steps
            .iter()
            .any(|step| format_line_event(step) == "Impact Hammer self 3"),
        "{steps:?}"
    );
    assert_eq!(after_swing.damage, 2, "{steps:?}");

    // Wake for a second attack with Heated Vengeance (same turn damaged flag).
    let mut ready = after_swing;
    ready.champion_awake = true;
    let (after_hv, hv_steps) = apply(
        ready,
        Action::PlayAttack {
            card: Card::HeatedVengeance,
            wield: None,
            prepared: false,
            doubled: false,
            command_ally: None,
        },
    );
    assert_eq!(after_hv.damage, 2 + 5, "{hv_steps:?}");
    assert!(
        hv_steps
            .iter()
            .any(|step| format_line_event(step) == "Heated Vengeance (+3)"),
        "{hv_steps:?}"
    );
}

#[test]
fn ally_attacks_do_not_rest_champion_for_later_weapon_swing() {
    let mut state = State::with_queue(&[], false, 2, &[]);
    state.champion_level = 1;
    state.champion_awake = true;
    state.equip_weapon(Weapon::MercenaryBlade);
    state.add_ally(Card::Arthur, true, true);

    let (after_arthur, _) = apply(state, Action::AttackArthur(0));
    assert!(
        after_arthur.champion_awake,
        "ally attack must leave champion awake"
    );
    assert!(
        solver_actions(after_arthur, false)
            .iter()
            .any(|action| matches!(action, Action::AttackWithWeapon(_))),
        "{:?}",
        solver_actions(after_arthur, false)
    );
}

#[test]
fn demolition_fast_deals_three_during_pre_recollect() {
    let mut state = State::with_queue(
        &[
            Card::Demolition,
            Card::Brick,
            Card::Brick,
            Card::Brick,
            Card::Brick,
        ],
        false,
        1,
        &[],
    );
    state.phase = Phase::PreRecollect;
    state.turn = 1;

    let legal = solver_actions(state, false);
    assert!(
        legal.iter().any(|action| matches!(
            action,
            Action::PlayAction {
                card: Card::Demolition,
                ..
            }
        )),
        "Demolition should be Fast-playable during pre-recollect: {legal:?}"
    );

    let play = legal
        .iter()
        .copied()
        .find(|action| {
            matches!(
                action,
                Action::PlayAction {
                    card: Card::Demolition,
                    ..
                }
            )
        })
        .expect("demolition play");
    let (after, steps) = apply(state, play);
    assert_eq!(after.phase, Phase::PreRecollect);
    assert_eq!(after.damage, 3);
    assert!(!after.has(Card::Demolition));
    assert!(
        steps
            .iter()
            .any(|step| format_line_event(step).contains("Fast Activate Demolition")),
        "{steps:?}"
    );
}

#[test]
fn virgil_fast_activates_before_recollect_and_commands_uncanny() {
    let mut state = State::with_queue(
        &[
            Card::Virgil,
            Card::Brick,
            Card::Brick,
            Card::Brick,
            Card::UncannyRealization,
            Card::Brick,
        ],
        false,
        2,
        &[],
    );
    state.phase = Phase::Materialize;
    state.turn = 1;

    let (after_mate, _) = apply(state, Action::SkipMaterialize);
    assert_eq!(after_mate.phase, Phase::PreRecollect);

    let legal = solver_actions(after_mate, false);
    assert!(
        legal.iter().any(|action| matches!(
            action,
            Action::PlayAlly {
                card: Card::Virgil,
                ..
            }
        )),
        "Virgil should be Fast-playable during pre-recollect: {legal:?}"
    );

    let play = legal
        .iter()
        .copied()
        .find(|action| {
            matches!(
                action,
                Action::PlayAlly {
                    card: Card::Virgil,
                    ..
                }
            )
        })
        .expect("virgil play");
    let (after_play, steps) = apply(after_mate, play);
    assert_eq!(after_play.phase, Phase::PreRecollect);
    assert_eq!(after_play.ally_len, 1);
    assert_eq!(after_play.allies[0].card(), Card::Virgil);
    assert!(
        steps
            .iter()
            .any(|step| format_line_event(step).contains("Fast Activate")),
        "{steps:?}"
    );

    let (after_skip, _) = apply(after_play, Action::SkipPreRecollect);
    assert_eq!(after_skip.phase, Phase::Main);
    let legal_main = solver_actions(after_skip, false);
    assert!(
        legal_main.iter().any(|action| matches!(
            action,
            Action::PlayAttack {
                card: Card::UncannyRealization,
                command_ally: Some(0),
                ..
            }
        )),
        "Virgil should enable Uncanny Realization: {legal_main:?}"
    );
}

#[test]
fn tristan_materialize_matches_zander_prep_flow() {
    let mut state = State::with_queue_and_materials(
        &[Card::IgnitedStab, Card::KingdomInformant],
        false,
        2,
        &[Card::Brick],
        MAT_TRISTAN,
    );
    state.phase = Phase::Materialize;
    state.turn = 1;
    state.hand[Card::KingdomInformant.index()] = 0;
    state.hand_len = state.hand_len.saturating_sub(1);
    state.memory[Card::KingdomInformant.index()] = 1;
    state.memory_len = 1;

    let (after, steps) = apply(state, Action::MaterializeTristanMemory);
    assert!(after.tristan_leveled);
    assert_eq!(after.prep, 1);
    assert_eq!(after.champion_level, 1);
    assert!(
        steps
            .iter()
            .any(|step| format_line_event(step).contains("Tristan Lvl 1 Prep")),
        "{steps:?}"
    );
    assert!(
        steps.iter().all(|step| step.kind.as_str() != "glimpse"),
        "Tristan must not Glimpse: {steps:?}"
    );
    let legal = solver_actions(state, true);
    let tristan_plays = legal
        .iter()
        .filter(|action| matches!(action, Action::MaterializeTristanMemory))
        .count();
    assert_eq!(
        tristan_plays, 1,
        "Tristan must not fan out Glimpse layouts: {legal:?}"
    );
}

#[test]
fn tristan_agility_recollect_and_fast_demolition() {
    let mut state = State::with_queue(
        &[Card::Demolition, Card::Brick, Card::Brick, Card::Brick],
        false,
        2,
        &[],
    );
    state.tristan_leveled = true;
    state.agility = 3;

    let (after_pass, _) = apply(state, Action::Pass);
    assert_eq!(after_pass.phase, Phase::Agility);

    let legal = solver_actions(after_pass, false);
    assert!(
        !legal
            .iter()
            .any(|action| matches!(action, Action::TristanRecollect)),
        "recollect needs 3 memory cards: {legal:?}"
    );
    assert!(
        legal.iter().any(|action| matches!(
            action,
            Action::PlayAction {
                card: Card::Demolition,
                ..
            }
        )),
        "Demolition should be fast-playable during agility: {legal:?}"
    );

    let (after_demolition, demo_steps) = apply(
        after_pass,
        Action::PlayAction {
            card: Card::Demolition,
            kindle: 0,
            prepared: false,
            imbue: false,
            sacrifice_ally: None,
        },
    );
    assert_eq!(after_demolition.damage, 3);
    assert_eq!(after_demolition.phase, Phase::Agility);
    assert_eq!(after_demolition.memory_len, 3);
    assert!(
        demo_steps
            .iter()
            .any(|step| format_line_event(step).contains("Fast Activate Demolition")),
        "{demo_steps:?}"
    );

    let (after_recollect, recollect_steps) = apply(after_demolition, Action::TristanRecollect);
    assert_eq!(after_recollect.agility, 0);
    assert_eq!(after_recollect.memory_len, 0);
    assert_eq!(after_recollect.hand[Card::Brick.index()], 3);
    assert!(
        recollect_steps
            .iter()
            .any(|step| format_line_event(step).contains("Tristan Recollect (Agility 3)")),
        "{recollect_steps:?}"
    );

    let (after_end, _) = apply(after_recollect, Action::SkipAgility);
    assert_eq!(after_end.phase, Phase::Materialize);
}

#[test]
fn tristan_agility_allows_fast_cards_only() {
    let mut state = State::with_queue(
        &[
            Card::Virgil,
            Card::FieryInterference,
            Card::Demolition,
            Card::Brick,
            Card::Brick,
            Card::Brick,
            Card::Brick,
        ],
        false,
        2,
        &[],
    );
    state.tristan_leveled = true;

    let (after_pass, _) = apply(state, Action::Pass);
    assert_eq!(after_pass.phase, Phase::Agility);

    let legal = solver_actions(after_pass, false);
    assert!(
        legal.iter().any(|action| matches!(
            action,
            Action::PlayAlly {
                card: Card::Virgil,
                ..
            }
        )),
        "Virgil should be fast-playable during agility: {legal:?}"
    );
    assert!(
        legal.iter().any(|action| matches!(
            action,
            Action::PlayAction {
                card: Card::Demolition,
                ..
            }
        )),
        "Demolition should be fast-playable during agility: {legal:?}"
    );
    assert!(
        !legal.iter().any(|action| matches!(
            action,
            Action::PlayAction {
                card: Card::FieryInterference,
                ..
            }
        )),
        "slow actions should not be playable during agility: {legal:?}"
    );
}

#[test]
fn pre_recollect_limits_fast_activations_to_fast_cards() {
    let mut state = State::with_queue(
        &[Card::FieryInterference, Card::Brick, Card::Brick],
        false,
        1,
        &[],
    );
    state.phase = Phase::PreRecollect;
    state.turn = 1;

    let legal = solver_actions(state, false);
    assert!(
        !legal.iter().any(|action| matches!(
            action,
            Action::PlayAction {
                card: Card::FieryInterference,
                ..
            }
        )),
        "slow actions should not fast-activate during pre-recollect: {legal:?}"
    );
}

#[test]
fn playing_unique_ally_kills_existing_copy() {
    let mut state = State::with_queue(&[Card::Rococo, Card::Brick], false, 1, &[]);
    state.add_ally(Card::Rococo, true, false);
    state.add_ally(Card::ClumsyApprentice, true, false);
    let legal = solver_actions(state, false);
    let play = legal
        .into_iter()
        .find(|action| {
            matches!(
                action,
                Action::PlayAlly {
                    card: Card::Rococo,
                    ..
                }
            )
        })
        .expect("second Rococo should be playable over the board copy");
    let (after, steps) = apply(state, play);
    assert_eq!(after.ally_len, 2, "{steps:?}");
    assert_eq!(after.allies[0].card(), Card::ClumsyApprentice);
    assert_eq!(after.allies[1].card(), Card::Rococo);
    assert!(
        steps
            .iter()
            .any(|step| format_line_event(step) == "Unique: Rococo, Explosive Maven dies"),
        "{steps:?}"
    );
    assert!(after.fire_gy >= 1, "killed Rococo should go to GY");
}

#[test]
fn uncanny_realization_requires_automaton_and_buffs_unique() {
    let mut no_auto = State::with_queue(&[Card::UncannyRealization, Card::Brick], false, 1, &[]);
    no_auto.add_ally(Card::ClumsyApprentice, true, false);
    let legal = solver_actions(no_auto, false);
    assert!(
        !legal.iter().any(|action| matches!(
            action,
            Action::PlayAttack {
                card: Card::UncannyRealization,
                ..
            }
        )),
        "non-Automaton allies cannot Command Uncanny Realization: {legal:?}"
    );

    let mut with_rococo =
        State::with_queue(&[Card::UncannyRealization, Card::Brick], false, 1, &[]);
    with_rococo.add_ally(Card::Rococo, true, false);
    let legal = solver_actions(with_rococo, false);
    let command = legal
        .iter()
        .find(|action| {
            matches!(
                action,
                Action::PlayAttack {
                    card: Card::UncannyRealization,
                    command_ally: Some(0),
                    ..
                }
            )
        })
        .copied()
        .expect("Rococo should enable Uncanny Realization");
    let (after, steps) = apply(with_rococo, command);
    assert_eq!(
        after.damage, 6,
        "3 Uncanny +1 Rococo attack +2 unique: {steps:?}"
    );
    assert!(!after.allies[0].awake());
    assert!(
        after.champion_awake,
        "Command Automaton should not rest champion"
    );
}

#[test]
fn tweedledum_stealth_only_after_zander_levels() {
    // Later turn, still unleveled: Assassin class bonus is off, so cull kills Tweedledum.
    let mut unleveled = State::with_queue(&[], false, 3, &[]);
    unleveled.turn = 2;
    unleveled.champion_level = 0;
    unleveled.add_ally(Card::Tweedledum, true, false);
    unleveled.add_ally(Card::KingdomInformant, true, false);
    unleveled.enemy_cull(None);
    assert_eq!(unleveled.ally_len, 1);
    assert_eq!(unleveled.allies[0].card(), Card::KingdomInformant);

    // Same later turn after leveling: class stealth applies, Tweedledum survives.
    let mut leveled = State::with_queue(&[], false, 3, &[]);
    leveled.turn = 2;
    leveled.champion_level = 1;
    leveled.add_ally(Card::Tweedledum, true, false);
    leveled.add_ally(Card::ClumsyApprentice, true, false);
    leveled.enemy_cull(None);
    assert_eq!(leveled.ally_len, 1);
    assert_eq!(leveled.allies[0].card(), Card::Tweedledum);
}

#[test]
fn package_courier_on_enter_discards_then_draws() {
    let mut state = State::with_queue(
        &[
            Card::PackageCourier,
            Card::Brick,
            Card::Brick,
            Card::Brick,
            Card::IgnitedStab,
        ],
        true,
        1,
        &[],
    );
    state.turn = 1;
    let play = solver_actions(state, false)
        .into_iter()
        .find(|action| {
            matches!(
                action,
                Action::PlayAlly {
                    card: Card::PackageCourier,
                    ..
                }
            )
        })
        .expect("play Package Courier");
    let (after, steps) = apply(state, play);
    assert_eq!(after.ally_len, 1);
    assert_eq!(after.allies[0].card(), Card::PackageCourier);
    assert!(
        steps.iter().any(|event| {
            event.kind == EventKind::OnEnterDraw
                && event.discarded.is_some()
                && event.drawn.is_some()
        }),
        "expected On-Enter discard/draw: {steps:?}"
    );
    // Courier + 2 reserve + 1 discard = 4 cards from hand; draw puts one back.
    assert_eq!(after.hand_len, 2);
}

#[test]
fn corhazi_courier_on_hit_discards_then_draws() {
    let mut state = State::with_queue(&[Card::Brick], true, 1, &[Card::KingdomInformant]);
    state.champion_level = 1;
    state.champion_awake = true;
    state.turn = 1;
    state.add_ally(Card::CorhaziCourier, true, false);

    let (after, steps) = apply(state, Action::AttackOthers);
    assert!(after.has(Card::KingdomInformant), "{steps:?}");
    assert!(!after.has(Card::Brick), "{steps:?}");
    assert!(
        steps.iter().any(|event| {
            event.kind == EventKind::CorhaziOnHit
                && event.discarded == Some("brick")
                && event.drawn == Some("kingdom_informant")
        }),
        "expected On-Hit discard/draw: {steps:?}"
    );
    assert!(
        steps
            .iter()
            .any(|step| { format_line_event(step) == "Corhazi On-Hit draw Kingd / discard Brick" }),
        "{steps:?}"
    );
}

#[test]
fn flagrant_guide_on_enter_levels_zander_and_marks_champion_damaged() {
    let mut state = State::with_queue(
        &[Card::FlagrantGuide, Card::Brick, Card::Brick, Card::Brick],
        true,
        1,
        &[],
    );
    state.champion_awake = true;
    state.turn = 1;
    let play = solver_actions(state, false)
        .into_iter()
        .find(|action| {
            matches!(
                action,
                Action::PlayAlly {
                    card: Card::FlagrantGuide,
                    flagrant_level: Some(MAT_ZANDER),
                    ..
                }
            )
        })
        .expect("Flagrant Guide should offer Zander level");
    let (after, steps) = apply(state, play);
    assert_eq!(after.champion_level, 1, "{steps:?}");
    assert!(after.champion_damaged, "{steps:?}");
    assert_eq!(after.prep, 1, "{steps:?}");
    assert_eq!(after.memory_len, 3, "{steps:?}");
    assert!(
        !steps
            .iter()
            .any(|step| step.kind.as_str() == "floatForZander"),
        "Flagrant Guide level should not pay memory: {steps:?}"
    );
    assert!(
        steps
            .iter()
            .any(|step| { format_line_event(step) == "Flagrant Guide On-Enter level (self 6)" }),
        "{steps:?}"
    );
    assert!(
        steps
            .iter()
            .any(|step| format_line_event(step) == "Zander Lvl 1 Glimpse/Prep"),
        "{steps:?}"
    );
}

#[test]
fn flagrant_guide_level_enables_heated_vengeance() {
    let mut state = State::with_queue(
        &[
            Card::FlagrantGuide,
            Card::HeatedVengeance,
            Card::Brick,
            Card::Brick,
            Card::Brick,
            Card::Brick,
        ],
        true,
        1,
        &[],
    );
    state.champion_awake = true;
    state.turn = 1;
    let flagrant = solver_actions(state, false)
        .into_iter()
        .find(|action| {
            matches!(
                action,
                Action::PlayAlly {
                    card: Card::FlagrantGuide,
                    flagrant_level: Some(MAT_ZANDER),
                    ..
                }
            )
        })
        .expect("Flagrant Guide level");
    let (state, _) = apply(state, flagrant);
    let mut state = state;
    state.add_hand(Card::Brick);
    state.add_hand(Card::Brick);
    state.add_hand(Card::Brick);
    let heated = solver_actions(state, false)
        .into_iter()
        .find(|action| {
            matches!(
                action,
                Action::PlayAttack {
                    card: Card::HeatedVengeance,
                    ..
                }
            )
        })
        .expect("Heated Vengeance should be playable");
    let (after, steps) = apply(state, heated);
    assert_eq!(after.damage, 5, "{steps:?}");
}

#[test]
fn zander_level2_only_via_flagrant_guide() {
    let mut state = State::with_queue(
        &[Card::FlagrantGuide, Card::Brick, Card::Brick, Card::Brick],
        false,
        2,
        &[],
    );
    state.phase = Phase::Main;
    state.turn = 1;
    state.champion_level = 1;
    state.champion_awake = true;
    state.materials |= MAT_ZANDER_2;

    let legal = solver_actions(state, false);
    assert!(
        legal.iter().any(|action| {
            matches!(
                action,
                Action::PlayAlly {
                    card: Card::FlagrantGuide,
                    flagrant_level: Some(MAT_ZANDER_2),
                    ..
                }
            )
        }),
        "Deft Executor should only be reachable through Flagrant Guide: {legal:?}"
    );

    let unleveled = {
        let mut s = state;
        s.champion_level = 0;
        s
    };
    assert!(!solver_actions(unleveled, false).iter().any(|action| {
        matches!(
            action,
            Action::PlayAlly {
                flagrant_level: Some(MAT_ZANDER_2),
                ..
            }
        )
    }));
}

#[test]
fn flagrant_guide_levels_zander2_with_prep_and_gy_return() {
    let mut state = State::with_queue(
        &[Card::FlagrantGuide, Card::Brick, Card::Brick, Card::Brick],
        false,
        2,
        &[],
    );
    state.phase = Phase::Main;
    state.turn = 1;
    state.champion_level = 1;
    state.prep = 1;
    state.champion_awake = true;
    state.materials |= MAT_ZANDER_2;
    state.send_to_gy(Card::IgnitedStab);

    let (after, steps) = apply(
        state,
        Action::PlayAlly {
            card: Card::FlagrantGuide,
            kindle: 0,
            sacrifice_ally: None,
            hot_cake_sacrifice: false,
            flagrant_level: Some(MAT_ZANDER_2),
            flagrant_gy_return: Some(Card::IgnitedStab),
        },
    );
    assert_eq!(after.champion_level, 2, "{steps:?}");
    assert_eq!(after.prep, 2, "{steps:?}");
    assert!(after.has(Card::IgnitedStab), "{steps:?}");
    assert_eq!(after.gy_count(Card::IgnitedStab), 0, "{steps:?}");
    assert!(
        steps
            .iter()
            .any(|step| { format_line_event(step) == "Zander, Deft Executor (+2 prep)" }),
        "{steps:?}"
    );
    assert!(
        steps
            .iter()
            .any(|step| { format_line_event(step) == "Zander return Ignit from GY (−1 prep)" }),
        "{steps:?}"
    );
    assert!(
        steps
            .iter()
            .any(|step| { format_line_event(step) == "Flagrant Guide On-Enter level (self 10)" }),
        "{steps:?}"
    );
}

#[test]
fn materialize_ripper_pays_memory_and_equips() {
    let mut state = State::with_queue(&[], false, 2, &[]);
    state.phase = Phase::Materialize;
    state.turn = 2;
    state.champion_level = 1;
    state.materials = MAT_RIPPER;
    state.memory[Card::KingdomInformant.index()] = 1;
    state.memory_len = 1;

    let (after, steps) = apply(state, Action::MaterializeRipper);
    assert_eq!(after.weapon_durability(Weapon::AssassinsRipper), 2);
    assert_eq!(after.memory_len, 0);
    assert_eq!(after.phase, Phase::PreRecollect);
    assert!(
        steps
            .iter()
            .any(|step| { format_line_event(step) == "Materialize Assassin's Ripper" }),
        "{steps:?}"
    );
}

#[test]
fn activate_ripper_spends_prep_and_buffs_weapon() {
    let mut state = State::with_queue(&[], false, 2, &[]);
    state.champion_level = 1;
    state.champion_awake = true;
    state.prep = 1;
    state.equip_weapon(Weapon::AssassinsRipper);

    let (after, steps) = apply(state, Action::ActivateRipper);
    assert_eq!(after.prep, 0);
    assert_eq!(after.weapon_power_bonus, 2);
    assert!(!after.champion_awake);
    assert!(
        steps.iter().any(|step| {
            format_line_event(step) == "Activate Assassin's Ripper (+2 power, REST)"
        }),
        "{steps:?}"
    );
}

#[test]
fn ripper_power_bonus_applies_to_weapon_attacks() {
    let mut state = State::with_queue(&[], false, 2, &[]);
    state.champion_level = 1;
    state.champion_awake = true;
    state.equip_weapon(Weapon::AssassinsRipper);
    state.weapon_power_bonus = 2;

    let (after, steps) = apply(state, Action::AttackWithWeapon(Weapon::AssassinsRipper));
    assert_eq!(after.damage, 3, "{steps:?}");
    assert!(
        steps
            .iter()
            .any(|step| { format_line_event(step) == "Attack with Assassin's Ripper" }),
        "{steps:?}"
    );
}

#[test]
fn soulknife_is_hidden_when_sleeping_without_blazing_throw() {
    let mut sleeping = State::with_queue(&[], false, 2, &[]);
    sleeping.phase = Phase::Main;
    sleeping.turn = 1;
    sleeping.champion_level = 1;
    sleeping.champion_awake = false;
    sleeping.materials = MAT_SOULKNIFE;
    sleeping.fire_gy = 3;
    assert!(
        !solver_actions(sleeping, false)
            .iter()
            .any(|action| matches!(action, Action::MaterializeSoulknife)),
        "sleeping champion with no throw cannot use soulknife: {:?}",
        solver_actions(sleeping, false)
    );

    let mut awake = sleeping;
    awake.champion_awake = true;
    assert!(
        solver_actions(awake, false)
            .iter()
            .any(|action| matches!(action, Action::MaterializeSoulknife)),
        "awake champion can swing soulknife: {:?}",
        solver_actions(awake, false)
    );

    let mut throwing = State::with_queue(&[Card::BlazingThrow, Card::Brick], false, 2, &[]);
    throwing.phase = Phase::Main;
    throwing.turn = 1;
    throwing.champion_level = 1;
    throwing.champion_awake = false;
    throwing.materials = MAT_SOULKNIFE;
    throwing.fire_gy = 3;
    assert!(
        solver_actions(throwing, false)
            .iter()
            .any(|action| matches!(action, Action::MaterializeSoulknife)),
        "Blazing Throw can use soulknife while sleeping: {:?}",
        solver_actions(throwing, false)
    );
}

#[test]
fn mercenary_blade_requires_champion_in_mate_only() {
    let mut unleveled_mate = State::with_queue(&[], false, 2, &[]);
    unleveled_mate.phase = Phase::Materialize;
    unleveled_mate.turn = 2;
    unleveled_mate.prep = 1;
    unleveled_mate.materials = MAT_BLADE;
    assert!(
        !solver_actions(unleveled_mate, false)
            .iter()
            .any(|action| matches!(action, Action::MercenaryBlade)),
        "mate blade requires leveled champion: {:?}",
        solver_actions(unleveled_mate, false)
    );

    let mut unleveled_main = unleveled_mate;
    unleveled_main.phase = Phase::Main;
    assert!(
        solver_actions(unleveled_main, false)
            .iter()
            .any(|action| matches!(action, Action::MercenaryBlade)),
        "main blade only needs prep: {:?}",
        solver_actions(unleveled_main, false)
    );

    let mut leveled_mate = unleveled_main;
    leveled_mate.champion_level = 1;
    leveled_mate.phase = Phase::Materialize;
    assert!(
        solver_actions(leveled_mate, false)
            .iter()
            .any(|action| matches!(action, Action::MercenaryBlade)),
        "mate blade legal once champion is leveled: {:?}",
        solver_actions(leveled_mate, false)
    );
}

#[test]
fn multiple_weapons_coexist_on_field() {
    let mut state = State::with_queue(&[], false, 2, &[]);
    state.phase = Phase::Materialize;
    state.turn = 1;
    state.materials = MAT_HAMMER | MAT_BLADE;
    state.champion_level = 1;
    state.prep = 1;

    let (after_hammer, _) = apply(state, Action::MaterializeHammer);
    assert!(after_hammer.has_weapon(Weapon::ImpactHammer));
    assert_eq!(after_hammer.weapon_durability(Weapon::ImpactHammer), 2);

    let mut after_blade = after_hammer;
    after_blade.phase = Phase::Materialize;
    after_blade.turn = 2;
    after_blade.prep = 1;
    let (after_blade, _) = apply(after_blade, Action::MercenaryBlade);
    assert!(
        after_blade.has_weapon(Weapon::ImpactHammer),
        "hammer should remain when blade is materialized"
    );
    assert!(after_blade.has_weapon(Weapon::MercenaryBlade));
    assert_eq!(after_blade.weapon_durability(Weapon::ImpactHammer), 2);
}

#[test]
fn hammer_and_blade_materialize_on_turn_two() {
    let mut hammer_state = State::with_queue(&[], false, 2, &[]);
    hammer_state.phase = Phase::Materialize;
    hammer_state.turn = 2;
    hammer_state.materials = MAT_HAMMER;
    assert!(
        solver_actions(hammer_state, false)
            .iter()
            .any(|action| matches!(action, Action::MaterializeHammer)),
        "Impact Hammer should be materializable on turn 2: {:?}",
        solver_actions(hammer_state, false)
    );

    let mut blade_state = State::with_queue(&[], false, 2, &[]);
    blade_state.phase = Phase::Materialize;
    blade_state.turn = 2;
    blade_state.champion_level = 1;
    blade_state.prep = 1;
    blade_state.materials = MAT_BLADE;
    assert!(
        solver_actions(blade_state, false)
            .iter()
            .any(|action| matches!(action, Action::MercenaryBlade)),
        "Mercenary's Blade should be materializable on turn 2: {:?}",
        solver_actions(blade_state, false)
    );

    let (after_blade, steps) = apply(blade_state, Action::MercenaryBlade);
    assert_eq!(after_blade.phase, Phase::PreRecollect);
    assert!(after_blade.has_weapon(Weapon::MercenaryBlade));
    assert!(
        steps
            .iter()
            .any(|step| { format_line_event(step) == "Materialize Mercenary's Blade (prep)" }),
        "{steps:?}"
    );
}

#[test]
fn crusader_ring_materializes_and_banishes_immediately() {
    let mut state = State::with_queue(&[], false, 2, &[Card::IgnitedStab, Card::Brick]);
    state.phase = Phase::Materialize;
    state.turn = 2;
    state.materials = MAT_RING;

    let legal_mate = solver_actions(state, false);
    assert!(
        legal_mate
            .iter()
            .any(|action| matches!(action, Action::MaterializeRing)),
        "ring should materialize from deck: {legal_mate:?}"
    );
    assert!(
        !legal_mate
            .iter()
            .any(|action| matches!(action, Action::BanishCrusaderRing)),
        "ring cannot be banished as a separate Mate action: {legal_mate:?}"
    );

    let hand_before = state.hand_len;
    let (after_mate, mate_steps) = apply(state, Action::MaterializeRing);
    assert!(!after_mate.ring, "ring must not linger on the field");
    assert!(!after_mate.has_material(MAT_RING));
    assert_eq!(after_mate.phase, Phase::PreRecollect);
    // Banish draw happens during materialize; recollect draw waits for pre-recollect finish.
    assert!(
        after_mate.hand_len >= hand_before.saturating_add(1),
        "expected banish draw before recollect: before={hand_before} after={}",
        after_mate.hand_len
    );
    let (after_recollect, recollect_steps) = apply(after_mate, Action::SkipPreRecollect);
    assert!(
        after_recollect.hand_len >= hand_before.saturating_add(2),
        "expected banish+recollect draws: before={hand_before} after={}",
        after_recollect.hand_len
    );
    assert!(
        mate_steps
            .iter()
            .any(|step| format_line_event(step) == "Materialize Grand Crusader's Ring"),
        "{mate_steps:?}"
    );
    assert!(
        mate_steps
            .iter()
            .any(|step| { step.kind.as_str() == "banishCrusaderRing" && step.drawn.is_some() }),
        "banish+draw must happen in the same Mate resolution: {mate_steps:?}"
    );
    assert!(
        recollect_steps
            .iter()
            .any(|step| step.kind.as_str() == "recollect"),
        "{recollect_steps:?}"
    );
    let legal_main = solver_actions(after_recollect, false);
    assert!(
        !legal_main
            .iter()
            .any(|action| matches!(action, Action::BanishCrusaderRing)),
        "Main must not offer a delayed ring banish: {legal_main:?}"
    );
}

#[test]
fn last_playable_turn_skips_enemy_cull_and_main() {
    let mut last = State::with_queue(&[Card::Brick], true, 3, &[]);
    last.turn = 2;
    last.add_ally(Card::ManicZealot, true, false);
    let (after_last, last_events) = apply(last, Action::Pass);
    assert!(after_last.is_terminal());
    assert_eq!(after_last.phase, Phase::Main);
    assert_eq!(
        after_last.ally_len, 1,
        "last playable turn has no opponent cull"
    );
    assert_eq!(after_last.damage, 0, "Manic Zealot On Death must not fire");
    let last_labels = labels(&last_events);
    assert!(
        !last_labels.iter().any(|label| label == "Enemy Main Phase"),
        "{last_labels:?}"
    );
    assert!(
        !last_labels
            .iter()
            .any(|label| label.contains("Manic Zealot On Death")),
        "{last_labels:?}"
    );

    let mut mid = State::with_queue(&[Card::Brick], true, 3, &[]);
    mid.add_ally(Card::ClumsyApprentice, true, false);
    let (after_mid, mid_events) = apply(mid, Action::Pass);
    assert!(!after_mid.is_terminal());
    assert_eq!(after_mid.phase, Phase::Materialize);
    assert_eq!(after_mid.ally_len, 0, "mid-line opponent cull still runs");
    let mid_labels = labels(&mid_events);
    assert!(
        mid_labels.iter().any(|label| label == "Enemy Main Phase"),
        "{mid_labels:?}"
    );
}

#[test]
fn wandering_glaivier_on_death_draws_on_cull() {
    let mut state = State::with_queue(&[], false, 3, &[Card::IgnitedStab]);
    state.turn = 1;
    state.add_ally(Card::WanderingGlaivier, true, false);
    let mut tape = EventTape::new();
    state.enemy_cull(Some(&mut tape));
    let steps = tape.events;
    assert_eq!(state.ally_len, 0);
    assert!(state.has(Card::IgnitedStab), "{steps:?}");
    assert!(
        steps
            .iter()
            .any(|step| { format_line_event(step) == "Wandering Glaivier On Death draw (Ignit)" }),
        "{steps:?}"
    );
}

#[test]
fn manic_zealot_on_death_deals_two_on_cull() {
    let mut state = State::with_queue(&[], false, 3, &[]);
    state.turn = 1;
    state.add_ally(Card::ManicZealot, true, false);
    state.add_ally(Card::ClumsyApprentice, true, false);
    let mut tape = EventTape::new();
    state.enemy_cull(Some(&mut tape));
    let steps = tape.events;
    assert_eq!(state.ally_len, 0);
    assert_eq!(state.damage, 2);
    assert!(state.champion_damaged);
    assert!(
        steps
            .iter()
            .any(|step| format_line_event(step) == "Manic Zealot On Death"),
        "{steps:?}"
    );
    assert!(Card::ManicZealot.is_automaton());
}

#[test]
fn manic_zealot_on_death_from_peppered_chef_sacrifice() {
    let mut state = State::with_queue(
        &[Card::PepperedChef, Card::Brick, Card::Brick],
        false,
        1,
        &[],
    );
    state.champion_awake = true;
    state.champion_level = 1;
    state.add_ally(Card::ManicZealot, true, false);
    let play = solver_actions(state, false)
        .into_iter()
        .find(|action| {
            matches!(
                action,
                Action::PlayAlly {
                    card: Card::PepperedChef,
                    sacrifice_ally: Some(0),
                    ..
                }
            )
        })
        .expect("Peppered Chef should be able to sacrifice Manic Zealot");
    let (after, steps) = apply(state, play);
    assert_eq!(after.damage, 2, "{steps:?}");
    assert!(after.champion_damaged, "{steps:?}");
    assert!(
        steps
            .iter()
            .any(|step| format_line_event(step) == "Manic Zealot On Death"),
        "{steps:?}"
    );
    assert_eq!(after.agility, 2);
}

#[test]
fn peppered_chef_sacrifice_requires_non_arthur_ally() {
    let mut state = State::with_queue(
        &[Card::PepperedChef, Card::Brick, Card::Brick],
        false,
        1,
        &[],
    );
    state.champion_awake = true;
    state.add_ally(Card::Arthur, true, true);
    state.hot_cake = 1;

    let legal = solver_actions(state, false);
    assert!(
        !legal.iter().any(|action| matches!(
            action,
            Action::PlayAlly {
                card: Card::PepperedChef,
                sacrifice_ally: Some(_),
                ..
            }
        )),
        "Peppered Chef sacrifice needs a non-Arthur ally, not Hot Cake: {legal:?}"
    );
    assert!(
        legal.iter().any(|action| matches!(
            action,
            Action::PlayAlly {
                card: Card::PepperedChef,
                sacrifice_ally: None,
                hot_cake_sacrifice: true,
                ..
            }
        )),
        "Hot Cake buff is separate from ally sacrifice: {legal:?}"
    );
}

#[test]
fn mercurial_heart_cards_are_recognized() {
    for name in [
        "gildas_chronicler_of_aesa",
        "incapacitate",
        "lurking_assailant",
        "undeniable_truth",
        "corhazi_arsonist",
        "ignite_fate",
        "increasing_danger",
        "reduce_to_ash",
        "smoke_out",
        "spark_alight",
    ] {
        assert!(parse_card(name).is_some(), "missing {name}");
    }
    assert_eq!(parse_card("Gildas, Chronicler of Aesa"), Some(Card::Gildas));
    assert!(Card::Gildas.is_unique());
    assert!(Card::Incapacitate.is_fast());
    assert!(Card::UndeniableTruth.is_fast());
    assert!(Card::IgniteFate.floating_memory());
    assert!(Card::ReduceToAsh.is_fire());
    assert_eq!(Card::SparkAlight.cost(), 2);
    assert_eq!(Card::SmokeOut.cost(), 1);
}

#[test]
fn gildas_balance_grants_plus_three_when_hand_equals_memory() {
    let mut state = State::with_queue(&[Card::Brick, Card::Brick], true, 1, &[]);
    state.add_ally(Card::Gildas, true, false);
    assert_eq!(
        state.ally_power(state.allies[0]),
        1,
        "2 hand vs 0 memory: no Balance"
    );
    state.pay_reserve(1);
    assert_eq!(
        state.ally_power(state.allies[0]),
        4,
        "1 hand vs 1 memory: Balance +3"
    );
    state.pay_reserve(1);
    assert_eq!(
        state.ally_power(state.allies[0]),
        1,
        "0 hand vs 2 memory: no Balance"
    );
}

#[test]
fn lurking_assailant_stealth_only_while_awake() {
    let mut awake = State::with_queue(&[], false, 3, &[]);
    awake.turn = 1;
    awake.add_ally(Card::LurkingAssailant, true, false);
    awake.add_ally(Card::ClumsyApprentice, true, false);
    awake.enemy_cull(None);
    assert_eq!(awake.ally_len, 1);
    assert_eq!(awake.allies[0].card(), Card::LurkingAssailant);

    let mut rested = State::with_queue(&[], false, 3, &[]);
    rested.turn = 1;
    rested.add_ally(Card::LurkingAssailant, false, false);
    rested.add_ally(Card::ClumsyApprentice, true, false);
    rested.enemy_cull(None);
    assert_eq!(
        rested.ally_len, 0,
        "rested Lurking Assailant has no stealth, cull wipes the board"
    );
}

#[test]
fn corhazi_arsonist_spends_prep_for_stealth() {
    let mut state = State::with_queue(&[], false, 3, &[]);
    state.turn = 1;
    state.prep = 1;
    state.add_ally(Card::CorhaziArsonist, true, false);
    let activate = solver_actions(state, false)
        .into_iter()
        .find(|action| matches!(action, Action::ActivateArsonist(0)))
        .expect("Arsonist should offer prep-for-stealth activation");
    let (after, steps) = apply(state, activate);
    assert_eq!(after.prep, 0, "{steps:?}");
    assert!(after.allies[0].stealth(), "{steps:?}");
    assert!(
        steps
            .iter()
            .any(|step| format_line_event(step) == "Corhazi Arsonist gains stealth (−1 prep)"),
        "{steps:?}"
    );

    let mut culled = after;
    culled.enemy_cull(None);
    assert_eq!(culled.ally_len, 1, "stealthed Arsonist survives cull");

    let mut no_prep = State::with_queue(&[], false, 3, &[]);
    no_prep.turn = 1;
    no_prep.add_ally(Card::CorhaziArsonist, true, false);
    assert!(
        !solver_actions(no_prep, false)
            .iter()
            .any(|action| matches!(action, Action::ActivateArsonist(_))),
        "no prep, no activation"
    );
    no_prep.enemy_cull(None);
    assert_eq!(no_prep.ally_len, 0);

    let mut next_turn = after;
    next_turn.wake();
    assert!(
        !next_turn.allies[0].stealth(),
        "granted stealth expires at end of turn"
    );
}

#[test]
fn undeniable_truth_requires_ally_sacrifice() {
    let hand = [Card::UndeniableTruth, Card::Brick, Card::Brick, Card::Brick];
    let no_ally = State::with_queue(&hand, true, 1, &[]);
    assert!(
        !solver_actions(no_ally, false).iter().any(|action| matches!(
            action,
            Action::PlayAction {
                card: Card::UndeniableTruth,
                ..
            }
        )),
        "Undeniable Truth needs an ally to sacrifice"
    );

    let mut state = State::with_queue(&hand, true, 1, &[Card::Brick, Card::Brick]);
    state.champion_awake = true;
    state.add_ally(Card::ClumsyApprentice, true, false);
    state.add_ally(Card::ManicZealot, true, false);
    let plays: Vec<_> = solver_actions(state, false)
        .into_iter()
        .filter(|action| {
            matches!(
                action,
                Action::PlayAction {
                    card: Card::UndeniableTruth,
                    ..
                }
            )
        })
        .collect();
    assert_eq!(plays.len(), 2, "one play per sacrifice target: {plays:?}");

    let zealot_play = plays
        .iter()
        .find(|action| {
            matches!(
                action,
                Action::PlayAction {
                    sacrifice_ally: Some(1),
                    ..
                }
            )
        })
        .copied()
        .expect("sacrifice slot 1");
    let (after, steps) = apply(state, zealot_play);
    assert_eq!(after.damage, 2, "Manic Zealot on-death: {steps:?}");
    assert!(after.champion_damaged, "{steps:?}");
    assert_eq!(after.ally_len, 1, "{steps:?}");
    assert_eq!(after.allies[0].card(), Card::ClumsyApprentice);
    assert_eq!(after.prep, 1, "{steps:?}");
    // Hand: 4 - 1 (Truth) - 1 (reserve) + 1 (draw) = 3.
    assert_eq!(after.hand_len, 3, "{steps:?}");
    assert!(
        steps
            .iter()
            .any(|step| format_line_event(step) == "Sacrifice Manic Zealot"),
        "{steps:?}"
    );
    assert!(
        steps
            .iter()
            .any(|step| format_line_event(step) == "Undeniable Truth (draw Brick, +1 prep)"),
        "{steps:?}"
    );
}

#[test]
fn ignite_fate_damages_both_champions_and_enables_heated_vengeance() {
    let hand = [
        Card::IgniteFate,
        Card::HeatedVengeance,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
    ];
    let mut state = State::with_queue(&hand, true, 1, &[]);
    state.champion_awake = true;
    let ignite = solver_actions(state, false)
        .into_iter()
        .find(|action| {
            matches!(
                action,
                Action::PlayAction {
                    card: Card::IgniteFate,
                    ..
                }
            )
        })
        .expect("Ignite Fate should be playable");
    let (after, steps) = apply(state, ignite);
    assert_eq!(after.damage, 2, "{steps:?}");
    assert!(after.champion_damaged, "{steps:?}");
    assert_eq!(after.float_gy, 1, "{steps:?}");

    let vengeance = Action::PlayAttack {
        card: Card::HeatedVengeance,
        wield: None,
        prepared: false,
        doubled: false,
        command_ally: None,
    };
    let (after_vengeance, vengeance_steps) = apply(after, vengeance);
    assert_eq!(
        after_vengeance.damage, 7,
        "2 Ignite + 2 Heated + 3 champion-damaged bonus: {vengeance_steps:?}"
    );
}

#[test]
fn increasing_danger_draws_to_hand_and_memory() {
    let hand = [Card::IncreasingDanger, Card::Brick, Card::Brick];
    let mut state = State::with_queue(&hand, true, 1, &[Card::SmokeOut, Card::SparkAlight]);
    state.champion_awake = true;
    let play = solver_actions(state, false)
        .into_iter()
        .find(|action| {
            matches!(
                action,
                Action::PlayAction {
                    card: Card::IncreasingDanger,
                    ..
                }
            )
        })
        .expect("Increasing Danger should be playable");
    let (after, steps) = apply(state, play);
    assert_eq!(after.damage, 0, "{steps:?}");
    // Hand: 3 - 1 (Danger) - 2 (reserve) + 1 (draw Smoke Out) = 1.
    assert_eq!(after.hand_len, 1, "{steps:?}");
    assert!(after.has(Card::SmokeOut), "{steps:?}");
    // Two paid bricks plus Spark Alight straight into memory.
    assert_eq!(after.memory_len, 3, "{steps:?}");
    assert_eq!(after.memory[Card::SparkAlight as usize], 1, "{steps:?}");
    assert!(
        steps.iter().any(|step| {
            format_line_event(step) == "Increasing Danger (draw Smoke, memory Spark)"
        }),
        "{steps:?}"
    );
}

#[test]
fn smoke_out_and_spark_alight_burn() {
    let hand = [
        Card::SmokeOut,
        Card::SparkAlight,
        Card::Brick,
        Card::Brick,
        Card::Brick,
    ];
    let result = solve_cards(&hand, true, 1, ALL_MATERIALS).expect("solve_cards");
    assert_eq!(
        result.max_damage, 3,
        "Smoke Out 1 + Spark Alight 2, line: {:?}",
        result.events
    );
}

#[test]
fn flurry_of_fire_should_deal_one_twice() {
    assert_eq!(
        parse_card("Aenean Flurry of Fire"),
        Some(Card::FlurryOfFire)
    );
    let state = State::with_queue(
        &[Card::FlurryOfFire, Card::Brick, Card::Brick],
        true,
        1,
        &[],
    );
    let play = Action::PlayAction {
        card: Card::FlurryOfFire,
        kindle: 0,
        prepared: false,
        imbue: false,
        sacrifice_ally: None,
    };
    let (after, steps) = apply(state, play);
    assert_eq!(after.damage, 2, "{steps:?}");
}

#[test]
fn flurry_of_fire_should_amplify_each_hit_when_poisoned_dagger_is_active() {
    let mut state = State::with_queue(
        &[Card::FlurryOfFire, Card::Brick, Card::Brick],
        true,
        1,
        &[],
    );
    state.amplify = true;
    let play = Action::PlayAction {
        card: Card::FlurryOfFire,
        kindle: 0,
        prepared: false,
        imbue: false,
        sacrifice_ally: None,
    };
    let (after, steps) = apply(state, play);
    assert_eq!(after.damage, 4, "{steps:?}");
}

#[test]
fn spark_alight_should_amplify_once_when_poisoned_dagger_is_active() {
    let mut state = State::with_queue(&[Card::SparkAlight, Card::Brick, Card::Brick], true, 1, &[]);
    state.amplify = true;
    let play = Action::PlayAction {
        card: Card::SparkAlight,
        kindle: 0,
        prepared: false,
        imbue: false,
        sacrifice_ally: None,
    };
    let (after, steps) = apply(state, play);
    assert_eq!(after.damage, 3, "{steps:?}");
}

#[test]
fn incapacitate_class_bonus_discount_and_inert_actions() {
    let hand = [Card::Incapacitate, Card::Brick, Card::Brick];
    let unleveled = State::with_queue(&hand, true, 1, &[]);
    assert!(
        !solver_actions(unleveled, false)
            .iter()
            .any(|action| matches!(
                action,
                Action::PlayAction {
                    card: Card::Incapacitate,
                    ..
                }
            )),
        "unleveled Incapacitate should cost 4"
    );

    let mut leveled = State::with_queue(&hand, true, 1, &[]);
    leveled.champion_level = 1;
    let play = solver_actions(leveled, false)
        .into_iter()
        .find(|action| {
            matches!(
                action,
                Action::PlayAction {
                    card: Card::Incapacitate,
                    ..
                }
            )
        })
        .expect("leveled Incapacitate should cost 2");
    let (after, steps) = apply(leveled, play);
    assert_eq!(after.damage, 0, "Incapacitate is inert: {steps:?}");
    assert_eq!(after.hand_len, 0, "paid 2 reserve: {steps:?}");
    assert_eq!(after.gy[Card::Incapacitate as usize], 1, "{steps:?}");

    let ash_hand = [Card::ReduceToAsh, Card::Brick, Card::Brick, Card::Brick];
    let ash_state = State::with_queue(&ash_hand, true, 1, &[]);
    let ash = solver_actions(ash_state, false)
        .into_iter()
        .find(|action| {
            matches!(
                action,
                Action::PlayAction {
                    card: Card::ReduceToAsh,
                    ..
                }
            )
        })
        .expect("Reduce to Ash should be playable");
    let (after_ash, ash_steps) = apply(ash_state, ash);
    assert_eq!(after_ash.damage, 0, "{ash_steps:?}");
    assert_eq!(after_ash.fire_gy, 1, "{ash_steps:?}");
}

#[test]
fn fast_actions_are_offered_during_pre_recollect() {
    let hand = [Card::SmokeOut, Card::IncreasingDanger, Card::Brick];
    let mut state = State::with_queue(&hand, true, 1, &[]);
    state.champion_awake = true;
    state.phase = Phase::PreRecollect;
    let legal = solver_actions(state, false);
    assert!(
        legal.iter().any(|action| matches!(
            action,
            Action::PlayAction {
                card: Card::SmokeOut,
                ..
            }
        )),
        "fast Smoke Out should be offered in pre-recollect: {legal:?}"
    );
    assert!(
        !legal.iter().any(|action| matches!(
            action,
            Action::PlayAction {
                card: Card::IncreasingDanger,
                ..
            }
        )),
        "slow Increasing Danger must wait for main phase: {legal:?}"
    );
}

#[test]
fn hot_cake_buffs_next_ally_attack() {
    let hand = [
        Card::HotCake,
        Card::ClumsyApprentice,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
    ];
    let result = solve_cards(&hand, false, 1, ALL_MATERIALS).expect("solve_cards");
    assert!(
        result.max_damage >= 4,
        "Hot Cake + Clumsy should reach at least 4 damage, got {}",
        result.max_damage
    );
    assert_eq!(result.effective.max_turns, Some(1));

    let hot_cake = result
        .card_stats
        .iter()
        .find(|stat| stat.card == "hot_cake")
        .expect("hot_cake stat row");
    assert!(
        hot_cake.damage >= 3,
        "Hot Cake buff damage should attribute to Hot Cake, got {}",
        hot_cake.damage
    );
    let clumsy = result
        .card_stats
        .iter()
        .find(|stat| stat.card == "clumsy_apprentice")
        .expect("clumsy stat row");
    assert_eq!(
        clumsy.damage, 1,
        "attacking ally should only get base attack power"
    );
}

#[test]
fn solver_snapshot_equivalence() {
    let drill_three = [
        Card::RendingFlames,
        Card::Arthur,
        Card::HastyMessenger,
        Card::KingdomInformant,
        Card::IgnitedStab,
        Card::SableRemnant,
        Card::ClumsyApprentice,
    ];
    let drill_one = [
        Card::BlazingThrow,
        Card::Arthur,
        Card::RedHare,
        Card::Arthur,
        Card::BlazingThrow,
        Card::KingdomInformant,
        Card::KingdomInformant,
    ];
    let ally_heavy = [
        Card::Arthur,
        Card::Arthur,
        Card::ClumsyApprentice,
        Card::KingdomInformant,
        Card::KingdomInformant,
        Card::RedHare,
        Card::PepperedChef,
    ];
    let expected_drill_three = [
        "Start of Game",
        "Activate Arthur, Young Heir",
        "Immortalize the King",
        "Main: Pass Opportunity",
        "End of Agility Phase",
        "End of End Phase",
        "Enemy Main Phase",
        "End of Enemy End Phase",
        "Wake Up Phase",
        "Materialize Impact Hammer",
        "Materialization Resolves",
        "Recollect (draw Brick)",
        "Attack from Arthur, Young Heir",
        "USE IN BELOW ATTACK (Impact Hammer)",
        "Ignited Stab (no prep) with Impact Hammer",
        "Impact Hammer self 3",
        "Activate Clumsy Apprentice",
        "Clumsy On-Enter draw (Brick)",
        "Attack from Clumsy Apprentice (Arthur +1)",
        "Activate Kingdom Informant",
        "Attack from Kingdom Informant (Arthur +1)",
        "Main: Pass Opportunity",
        "End of Agility Phase",
        "End of End Phase",
        "Enemy Main Phase",
        "End of Enemy End Phase",
        "Wake Up Phase",
        "Mem Cost for Zander Lvl 1 (from Mem)",
        "Zander Lvl 1 Glimpse/Prep",
        "Materialization Resolves",
        "Recollect (draw Brick)",
        "Attack from Kingdom Informant",
        "USE IN BELOW ATTACK (Impact Hammer)",
        "Rending Flames (Doubled) with Impact Hammer",
        "Impact Hammer self 3",
        "Materialize Mercenary's Blade (prep)",
        "Main: Pass Opportunity",
        "End of Agility Phase",
        "End of End Phase",
    ];
    type SolveCase<'a> = (&'a [Card], bool, u8, u8, &'a [&'a str]);
    let cases: [SolveCase<'_>; 3] = [
        (&drill_three, true, 3, 21, &expected_drill_three),
        (&drill_one, true, 3, 24, &[]),
        (&ally_heavy, true, 3, 25, &[]),
    ];
    for (hand, go_first, max_turns, expected_damage, expected_actions) in cases {
        let result = solve_cards(hand, go_first, max_turns, ALL_MATERIALS).expect("solve_cards");
        assert_eq!(result.max_damage, expected_damage, "{hand:?}");
        if !expected_actions.is_empty() {
            let actions = labels(&result.events);
            assert_eq!(actions, expected_actions, "{hand:?}");
        }
    }

    let queue: Vec<Card> = (0..16)
        .map(|index| drill_three[index % drill_three.len()])
        .collect();
    let (pass, _) =
        solve_pass(&drill_three, true, 3, &queue, true, ALL_MATERIALS).expect("solve_pass");
    assert_eq!(pass.max_damage, 21);
    assert_eq!(
        pass.events.first().map(format_line_event).as_deref(),
        Some("Start of Game")
    );
    assert!(
        pass.events
            .iter()
            .any(|step| format_line_event(step).contains("Recollect (draw Rendi)")),
        "{:?}",
        pass.events
    );
}

#[test]
#[ignore]
fn capture_solver_snapshots() {
    let drill_three = [
        Card::RendingFlames,
        Card::Arthur,
        Card::HastyMessenger,
        Card::KingdomInformant,
        Card::IgnitedStab,
        Card::SableRemnant,
        Card::ClumsyApprentice,
    ];
    let drill_one = [
        Card::BlazingThrow,
        Card::Arthur,
        Card::RedHare,
        Card::Arthur,
        Card::BlazingThrow,
        Card::KingdomInformant,
        Card::KingdomInformant,
    ];
    let ally_heavy = [
        Card::Arthur,
        Card::Arthur,
        Card::ClumsyApprentice,
        Card::KingdomInformant,
        Card::KingdomInformant,
        Card::RedHare,
        Card::PepperedChef,
    ];
    for (name, hand, go_first, max_turns) in [
        ("drill_three", &drill_three[..], true, 3),
        ("drill_one", &drill_one[..], true, 3),
        ("ally_heavy", &ally_heavy[..], true, 3),
    ] {
        let result = solve_cards(hand, go_first, max_turns, ALL_MATERIALS).expect("solve_cards");
        let actions = labels(&result.events);
        println!(
            "case {name}: damage={} actions={actions:?}",
            result.max_damage
        );
    }
    let queue: Vec<Card> = (0..16)
        .map(|index| drill_three[index % drill_three.len()])
        .collect();
    let (pass, _) =
        solve_pass(&drill_three, true, 3, &queue, true, ALL_MATERIALS).expect("solve_pass");
    let actions = labels(&pass.events);
    println!(
        "case oracle_16: damage={} actions={actions:?}",
        pass.max_damage
    );
}

#[test]
fn rococo_opens_for_two() {
    let hand = [Card::Rococo, Card::Brick];
    let result = solve_cards(&hand, true, 2, ALL_MATERIALS).expect("solve_cards");
    assert!(result.max_damage >= 2, "{result:#?}");
    assert_eq!(
        result.effective.engine_version.card_digest,
        ENGINE_VERSION.card_digest
    );
}

#[test]
fn solve_clamps_turns_and_rollouts_in_effective() {
    use crate::model::SolveRequest;
    use std::collections::BTreeMap;

    let request = SolveRequest {
        hand: vec!["rococo".into(), "brick".into()],
        go_first: true,
        max_turns: 9,
        sim_type: SimType::MonteCarlo,
        deck: BTreeMap::from([("brick".into(), 58_u8)]),
        queue: None,
        rollouts: 99,
        seed: 1,
        budget: crate::budget::Budget::default(),
        materials: BTreeMap::new(),
        max_threads: None,
        glimpse_enabled: None,
        max_hand_duration_secs: None,

        max_card_draw: None,
    };
    let result = solve(&request).unwrap();
    assert_eq!(result.effective.max_turns, Some(5));
    assert_eq!(result.effective.rollouts, Some(48));
    assert_eq!(result.effective.root_seed, 1);
}

#[test]
fn vermilion_decree_imbues_on_all_fire_hand() {
    let state = State::with_queue(
        &[
            Card::VermilionDecree,
            Card::Brick,
            Card::Brick,
            Card::Brick,
            Card::IgnitedStab,
        ],
        false,
        1,
        &[Card::HotCake],
    );
    let legal = solver_actions(state, false);
    let decree_actions: Vec<_> = legal
        .iter()
        .filter(|action| {
            matches!(
                action,
                Action::PlayAction {
                    card: Card::VermilionDecree,
                    ..
                }
            )
        })
        .collect();
    assert_eq!(
        decree_actions.len(),
        1,
        "all-Fire hand only needs normal reserve: {decree_actions:?}"
    );
    let action = Action::PlayAction {
        card: Card::VermilionDecree,
        kindle: 0,
        prepared: false,
        imbue: false,
        sacrifice_ally: None,
    };
    let (after, steps) = apply(state, action);
    assert_eq!(after.damage, 3, "{steps:?}");
    assert!(
        steps.iter().any(|step| {
            format_line_event(step).starts_with("Vermilion Decree (Imbue, draw HCake)")
        }),
        "{steps:?}"
    );
    assert!(after.has(Card::HotCake), "imbue should draw into hand");
    assert_eq!(after.memory_len, 3);
    assert_eq!(after.hand_len, 2); // leftover IgnitedStab + drawn HotCake
}

#[test]
fn vermilion_decree_offers_fire_only_when_norm_in_hand() {
    // Score-0 Fire + Informant: normal payment takes Informant first, so no imbue.
    // Fire-only is also offered so the solver can still imbue and keep the Norm.
    let state = State::with_queue(
        &[
            Card::VermilionDecree,
            Card::Rococo,
            Card::XiaoQiao,
            Card::CorhaziCourier,
            Card::KingdomInformant,
        ],
        false,
        1,
        &[Card::HotCake],
    );
    let legal = solver_actions(state, false);
    assert!(
        legal.iter().any(|action| matches!(
            action,
            Action::PlayAction {
                card: Card::VermilionDecree,
                imbue: true,
                ..
            }
        )),
        "Fire-only alternate missing: {legal:?}"
    );
    assert!(
        legal.iter().any(|action| matches!(
            action,
            Action::PlayAction {
                card: Card::VermilionDecree,
                imbue: false,
                ..
            }
        )),
        "normal reserve line missing: {legal:?}"
    );

    let (imbued, imbue_steps) = apply(
        state,
        Action::PlayAction {
            card: Card::VermilionDecree,
            kindle: 0,
            prepared: false,
            imbue: true,
            sacrifice_ally: None,
        },
    );
    assert!(
        imbue_steps.iter().any(|event| {
            event.kind == EventKind::Play
                && event.card == Some("vermilion_decree")
                && event.imbue == Some(true)
                && event.drawn.is_some()
        }),
        "{imbue_steps:?}"
    );
    assert!(imbued.has(Card::KingdomInformant));
    assert_eq!(imbued.memory[Card::KingdomInformant.index()], 0);

    let (normal, normal_steps) = apply(
        state,
        Action::PlayAction {
            card: Card::VermilionDecree,
            kindle: 0,
            prepared: false,
            imbue: false,
            sacrifice_ally: None,
        },
    );
    assert!(
        normal_steps.iter().any(|event| {
            event.kind == EventKind::Play
                && event.card == Some("vermilion_decree")
                && event.imbue != Some(true)
        }),
        "normal payment should reserve Informant and skip imbue: {normal_steps:?}"
    );
    assert!(
        !normal_steps
            .iter()
            .any(|event| event.card == Some("vermilion_decree") && event.imbue == Some(true)),
        "{normal_steps:?}"
    );
    assert_eq!(normal.damage, 3);
    assert!(
        normal.memory[Card::KingdomInformant.index()] > 0,
        "normal reserve uses payment scores, so Informant is fodder: memory_len={}",
        normal.memory_len
    );
    assert!(!normal.has(Card::HotCake), "no imbue draw");
}

#[test]
fn vermilion_decree_normal_reserve_still_imbues_when_payment_is_all_fire() {
    // Bricks outscore Informant, so normal payment is all Fire → imbue + draw.
    let state = State::with_queue(
        &[
            Card::VermilionDecree,
            Card::Brick,
            Card::Brick,
            Card::Brick,
            Card::KingdomInformant,
        ],
        false,
        1,
        &[Card::HotCake],
    );
    let (after, steps) = apply(
        state,
        Action::PlayAction {
            card: Card::VermilionDecree,
            kindle: 0,
            prepared: false,
            imbue: false,
            sacrifice_ally: None,
        },
    );
    assert!(
        steps
            .iter()
            .any(|step| format_line_event(step).contains("Vermilion Decree (Imbue, draw")),
        "{steps:?}"
    );
    assert!(after.has(Card::KingdomInformant));
    assert_eq!(after.memory[Card::KingdomInformant.index()], 0);
    assert!(after.has(Card::HotCake));
}

#[test]
fn vermilion_decree_skips_imbue_when_norm_must_pay_cost() {
    let state = State::with_queue(
        &[
            Card::VermilionDecree,
            Card::Brick,
            Card::Brick,
            Card::KingdomInformant,
            Card::SableRemnant,
        ],
        false,
        1,
        &[],
    );
    let legal = solver_actions(state, false);
    assert!(
        !legal.iter().any(|action| matches!(
            action,
            Action::PlayAction {
                card: Card::VermilionDecree,
                imbue: true,
                ..
            }
        )),
        "Imbue 3 is impossible with only 2 Fire left: {legal:?}"
    );
    let (after, steps) = apply(
        state,
        Action::PlayAction {
            card: Card::VermilionDecree,
            kindle: 0,
            prepared: false,
            imbue: false,
            sacrifice_ally: None,
        },
    );
    assert_eq!(after.damage, 3, "{steps:?}");
    assert!(
        steps.iter().any(|event| {
            event.kind == EventKind::Play
                && event.card == Some("vermilion_decree")
                && event.imbue != Some(true)
        }),
        "{steps:?}"
    );
    assert!(
        !steps
            .iter()
            .any(|event| event.card == Some("vermilion_decree") && event.imbue == Some(true)),
        "{steps:?}"
    );
}

#[test]
fn surging_bolt_deals_four_when_imbued() {
    let state = State::with_queue(
        &[
            Card::SurgingBolt,
            Card::Brick,
            Card::Brick,
            Card::Brick,
            Card::IgnitedStab,
        ],
        false,
        1,
        &[],
    );
    let (after, steps) = apply(
        state,
        Action::PlayAction {
            card: Card::SurgingBolt,
            kindle: 0,
            prepared: false,
            imbue: false,
            sacrifice_ally: None,
        },
    );
    assert_eq!(after.damage, 4, "{steps:?}");
    assert!(
        steps
            .iter()
            .any(|step| format_line_event(step) == "Surging Bolt (Imbue)"),
        "{steps:?}"
    );
}

#[test]
fn surging_bolt_offers_fire_only_and_deals_three_without_imbue() {
    let state = State::with_queue(
        &[
            Card::SurgingBolt,
            Card::Rococo,
            Card::XiaoQiao,
            Card::CorhaziCourier,
            Card::KingdomInformant,
        ],
        false,
        1,
        &[],
    );
    let legal = solver_actions(state, false);
    assert!(
        legal.iter().any(|action| matches!(
            action,
            Action::PlayAction {
                card: Card::SurgingBolt,
                imbue: true,
                ..
            }
        )),
        "Fire-only alternate missing: {legal:?}"
    );
    let (after, steps) = apply(
        state,
        Action::PlayAction {
            card: Card::SurgingBolt,
            kindle: 0,
            prepared: false,
            imbue: false,
            sacrifice_ally: None,
        },
    );
    assert_eq!(after.damage, 3, "{steps:?}");
    assert!(
        steps
            .iter()
            .any(|step| format_line_event(step) == "Surging Bolt"),
        "{steps:?}"
    );
    assert!(
        !steps
            .iter()
            .any(|step| format_line_event(step).contains("Imbue")),
        "{steps:?}"
    );
}

#[test]
fn two_pass_exposes_brick_oracle_and_combined_card_stats() {
    let hand = [
        "arthur",
        "clumsy_apprentice",
        "kingdom_informant",
        "brick",
        "brick",
        "brick",
        "brick",
    ]
    .map(str::to_string);
    let deck = BTreeMap::from([
        ("arthur".into(), 3_u8),
        ("clumsy_apprentice".into(), 3),
        ("kingdom_informant".into(), 3),
        ("hot_cake".into(), 3),
    ]);
    let result = solve(&SolveRequest {
        hand: hand.to_vec(),
        go_first: false,
        max_turns: 2,
        sim_type: SimType::TwoPass,
        deck,
        queue: None,
        rollouts: 1,
        seed: 42,
        budget: crate::budget::Budget::default(),
        materials: BTreeMap::new(),
        max_threads: None,
        glimpse_enabled: None,
        max_hand_duration_secs: None,

        max_card_draw: None,
    })
    .expect("two-pass solve");

    let two_pass = result.two_pass.expect("two_pass payload");
    assert!(
        !two_pass.brick.card_stats.is_empty(),
        "brick pass should carry card stats"
    );
    assert!(
        !two_pass.oracle.card_stats.is_empty(),
        "oracle pass should carry card stats"
    );
    assert!(
        result.brick_line_stats.is_some(),
        "brick line stats should be retained"
    );
    assert!(
        !result.card_stats.is_empty(),
        "combined card stats should be non-empty"
    );
    let brick_damage: u32 = two_pass
        .brick
        .card_stats
        .iter()
        .map(|stat| stat.damage)
        .sum();
    let oracle_damage: u32 = two_pass
        .oracle
        .card_stats
        .iter()
        .map(|stat| stat.damage)
        .sum();
    let combined_damage: u32 = result.card_stats.iter().map(|stat| stat.damage).sum();
    assert_eq!(
        combined_damage,
        brick_damage + oracle_damage,
        "combined damage should sum both passes"
    );
}

#[test]
fn oracle_only_matches_two_pass_oracle() {
    let hand = [
        "arthur",
        "clumsy_apprentice",
        "kingdom_informant",
        "brick",
        "brick",
        "brick",
        "brick",
    ]
    .map(str::to_string);
    let deck = BTreeMap::from([
        ("arthur".into(), 3_u8),
        ("clumsy_apprentice".into(), 3),
        ("kingdom_informant".into(), 3),
        ("hot_cake".into(), 3),
    ]);
    let request = |sim_type| SolveRequest {
        hand: hand.to_vec(),
        go_first: false,
        max_turns: 2,
        sim_type,
        deck: deck.clone(),
        queue: None,
        rollouts: 1,
        seed: 42,
        budget: crate::budget::Budget::default(),
        materials: BTreeMap::new(),
        max_threads: None,
        glimpse_enabled: None,
        max_hand_duration_secs: None,

        max_card_draw: None,
    };
    let two_pass = solve(&request(SimType::TwoPass)).expect("two-pass solve");
    let oracle = solve(&request(SimType::OracleOnly)).expect("oracle-only solve");
    let two_pass_oracle = two_pass.two_pass.expect("two_pass payload").oracle;

    assert_eq!(oracle.sim_type, SimType::OracleOnly);
    assert!(oracle.two_pass.is_none());
    assert_eq!(oracle.max_damage, two_pass_oracle.max_damage);
    assert_eq!(oracle.events.len(), two_pass_oracle.events.len());
    assert!(!oracle.card_stats.is_empty());
}

#[test]
fn oracle_only_requires_a_maindeck() {
    let result = solve(&SolveRequest {
        hand: vec!["arthur".into(), "brick".into()],
        go_first: true,
        max_turns: 2,
        sim_type: SimType::OracleOnly,
        deck: BTreeMap::new(),
        queue: None,
        rollouts: 1,
        seed: 1,
        budget: crate::budget::Budget::default(),
        materials: BTreeMap::new(),
        max_threads: None,
        glimpse_enabled: None,
        max_hand_duration_secs: None,

        max_card_draw: None,
    });
    assert!(result.is_err());
    assert!(result.unwrap_err().to_string().contains("need a maindeck"));
}

#[test]
fn oracle_uses_provided_queue_without_reshuffling() {
    let hand = vec!["arthur".into(), "brick".into()];
    let queue = vec!["hot_cake".into(), "rococo".into()];
    let seed_a = solve(&SolveRequest {
        hand: hand.clone(),
        go_first: true,
        max_turns: 2,
        sim_type: SimType::OracleOnly,
        deck: BTreeMap::new(),
        queue: Some(queue.clone()),
        rollouts: 1,
        seed: 1,
        budget: crate::budget::Budget::default(),
        materials: BTreeMap::new(),
        max_threads: None,
        glimpse_enabled: None,
        max_hand_duration_secs: None,

        max_card_draw: None,
    })
    .expect("oracle with queue");
    let seed_b = solve(&SolveRequest {
        hand,
        go_first: true,
        max_turns: 2,
        sim_type: SimType::OracleOnly,
        deck: BTreeMap::new(),
        queue: Some(queue),
        rollouts: 1,
        seed: 99,
        budget: crate::budget::Budget::default(),
        materials: BTreeMap::new(),
        max_threads: None,
        glimpse_enabled: None,
        max_hand_duration_secs: None,

        max_card_draw: None,
    })
    .expect("oracle with same queue");
    assert_eq!(seed_a.max_damage, seed_b.max_damage);
    assert_eq!(seed_a.events.len(), seed_b.events.len());
}

#[test]
fn tristan_assassin_matches_zander_on_b1a069b5_hand() {
    use crate::model::{ALL_MATERIALS, resolve_materials_bitmask};
    use std::collections::BTreeMap;

    let hand = [
        "rending_flames",
        "arthur",
        "hasty_messenger",
        "kingdom_informant",
        "ignited_stab",
        "sable_remnant",
        "clumsy_apprentice",
    ]
    .map(|id| parse_card(id).unwrap());

    let zander = solve_cards(&hand, true, 3, ALL_MATERIALS).expect("solve_cards");

    let mut tristan_counts = BTreeMap::new();
    tristan_counts.insert("impact_hammer".to_string(), 1);
    tristan_counts.insert("mercenary_blade".to_string(), 1);
    tristan_counts.insert("poisoned_dagger".to_string(), 1);
    tristan_counts.insert("tristan_1".to_string(), 1);
    tristan_counts.insert("varuckan_soulknife".to_string(), 1);
    let tristan = solve_cards(&hand, true, 3, resolve_materials_bitmask(&tristan_counts))
        .expect("solve_cards");

    assert_eq!(
        zander.max_damage, tristan.max_damage,
        "Tristan Assassin should match Zander on prep lines: zander={} tristan={}",
        zander.max_damage, tristan.max_damage
    );
    assert!(
        tristan
            .events
            .iter()
            .any(|event| event.kind.as_str() == "levelTristan"),
        "optimal Tristan line should materialize Tristan"
    );
}

#[test]
fn rending_flames_doubled_banishes_from_gy_before_self_enters() {
    let mut state = State::with_queue(
        &[Card::RendingFlames, Card::Brick, Card::Brick, Card::Brick],
        false,
        2,
        &[],
    );
    state.champion_level = 1;
    state.champion_awake = true;
    state.turn = 1;
    state.gy[Card::RendingFlames.index()] = 2;
    state.gy[Card::IgnitedStab.index()] = 1;
    state.gy_total = 3;
    state.fire_gy = 3;

    let doubled_offered = solver_actions(state, false).iter().any(|action| {
        matches!(
            action,
            Action::PlayAttack {
                card: Card::RendingFlames,
                doubled: true,
                ..
            }
        )
    });
    assert!(doubled_offered, "need three Fire in GY before doubling");

    let mut sparse_gy = state;
    sparse_gy.gy[Card::RendingFlames.index()] = 2;
    sparse_gy.gy[Card::IgnitedStab.index()] = 0;
    sparse_gy.gy_total = 2;
    sparse_gy.fire_gy = 2;
    assert!(
        !solver_actions(sparse_gy, false).iter().any(|action| {
            matches!(
                action,
                Action::PlayAttack {
                    card: Card::RendingFlames,
                    doubled: true,
                    ..
                }
            )
        }),
        "two Fire in GY is not enough to double"
    );

    let (after, steps) = apply(
        state,
        Action::PlayAttack {
            card: Card::RendingFlames,
            wield: None,
            prepared: false,
            doubled: true,
            command_ally: None,
        },
    );
    assert_eq!(after.gy_count(Card::RendingFlames), 1, "{steps:?}");
    assert_eq!(after.gy_count(Card::IgnitedStab), 0, "{steps:?}");
    assert_eq!(after.fire_gy, 1, "{steps:?}");
    assert_eq!(after.damage, 6, "{steps:?}");
    assert!(
        steps
            .iter()
            .any(|step| format_line_event(step).contains("Rending Flames (Doubled)")),
        "{steps:?}"
    );
}

#[test]
fn generational_memo_reset_preserves_exact_oracle_damage() {
    let hand = [
        Card::Arthur,
        Card::ClumsyApprentice,
        Card::KingdomInformant,
        Card::IgnitedStab,
        Card::SableRemnant,
        Card::HastyMessenger,
        Card::RendingFlames,
    ];
    let board = State::with_queue(&hand, true, 2, &[Card::Brick]);

    crate::pressure::force_pressure_for_test(crate::pressure::PressureLevel::Clear);
    let mut huge = Search::with_memo_cap(true, usize::MAX / 4);
    let full = huge.visit(board);

    let mut tiny = Search::with_memo_cap(true, 256);
    let capped = tiny.visit(board);

    assert_eq!(full.damage, capped.damage);
    assert_eq!(full.influence, capped.influence);
    assert!(
        tiny.memo_generations > 0,
        "tiny cap should force at least one generational reset"
    );
}

#[test]
fn squeeze_multiplier_still_yields_exact_damage() {
    let hand = [
        Card::Arthur,
        Card::ClumsyApprentice,
        Card::KingdomInformant,
        Card::IgnitedStab,
    ];
    let board = State::with_queue(&hand, true, 1, &[]);

    crate::pressure::force_pressure_for_test(crate::pressure::PressureLevel::Clear);
    let mut full_search = Search::with_memo_cap(false, 10_000);
    let full = full_search.visit(board);

    crate::pressure::force_pressure_for_test(crate::pressure::PressureLevel::Squeeze);
    let mut squeezed = Search::with_memo_cap(false, 10_000);
    let under_pressure = squeezed.visit(board);
    crate::pressure::force_pressure_for_test(crate::pressure::PressureLevel::Clear);

    assert_eq!(full.damage, under_pressure.damage);
    assert_eq!(full.influence, under_pressure.influence);
}

#[test]
fn cancel_flag_aborts_long_oracle_pass() {
    // Needs enough nodes to hit the park/cancel checkpoint mask (~262k).
    let hand = [
        Card::Arthur,
        Card::XiaoQiao,
        Card::DazzlingCourtesan,
        Card::ClumsyApprentice,
        Card::Rococo,
        Card::Rococo,
        Card::HotCake,
    ];
    let queue: Vec<_> = std::iter::repeat_n(Card::Brick, 40).collect();
    let flag = crate::cancel::new_flag();
    let flag_set = flag.clone();
    let handle = std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(20));
        crate::cancel::request(&flag_set);
    });
    let _guard = crate::cancel::install(flag);
    let err = solve_pass(&hand, true, 3, &queue, true, ALL_MATERIALS).expect_err("cancelled");
    assert!(matches!(err, EngineError::Cancelled));
    handle.join().expect("cancel thread");
}

#[test]
fn attack_others_two_hasty_messengers_both_draw_on_auto() {
    let mut state = State::with_queue(
        &[Card::Brick, Card::Brick, Card::KingdomInformant, Card::IgnitedStab],
        true,
        1,
        &[Card::SableRemnant, Card::ClumsyApprentice],
    );
    state.turn = 1;
    state.add_ally(Card::HastyMessenger, true, false);
    state.add_ally(Card::HastyMessenger, true, false);

    let (_, events) = apply(state, Action::AttackOthers);
    let draws = events
        .iter()
        .filter(|e| e.kind == EventKind::OnAttackDraw)
        .count();
    assert_eq!(draws, 2, "{events:?}");
}

#[test]
fn attack_others_two_hasty_messengers_manual_then_auto() {
    use crate::solver::{apply_action_with_payment, ActionPayment, DiscardPayment};
    let mut state = State::with_queue(
        &[Card::Brick, Card::Brick, Card::KingdomInformant, Card::IgnitedStab],
        true,
        1,
        &[Card::SableRemnant, Card::ClumsyApprentice],
    );
    state.turn = 1;
    state.add_ally(Card::HastyMessenger, true, false);
    state.add_ally(Card::HastyMessenger, true, false);

    let payment = Some(ActionPayment {
        reserved: vec![],
        discard: DiscardPayment::Card(Card::KingdomInformant),
        discards: vec![],
    });
    let (_, events) = apply_action_with_payment(state, Action::AttackOthers, payment);
    let draws = events
        .iter()
        .filter(|e| e.kind == EventKind::OnAttackDraw)
        .count();
    assert_eq!(draws, 2, "{events:?}");
}
