//! Reproduce optimal 19 vs playtest 20 (Virgil / Uncanny Realization hand).
//! Run: cargo run -p ga-fire-engine --example repro_virgil_line --release

use ga_fire_engine::cards::Card;
use ga_fire_engine::line_event::format_line_event;
use ga_fire_engine::model::{SimType, SolveRequest};
use ga_fire_engine::solve;
use std::collections::BTreeMap;

fn main() {
    let hand = [
        Card::IgnitedStab,
        Card::DazzlingCourtesan,
        Card::IntensifiedPyre,
        Card::Rococo,
        Card::VermilionDecree,
        Card::UncannyRealization,
        Card::Virgil,
    ];
    let queue = [
        Card::IncreasingDanger,
        Card::ManicZealot,
        Card::SurgingBolt,
        Card::Demolition,
        Card::ClumsyApprentice,
    ];
    let mut materials = BTreeMap::new();
    materials.insert("impact_hammer".to_string(), 1_u8);

    for max_turns in [2_u8, 3] {
        let result = solve(&SolveRequest {
            hand: hand.iter().map(|c| c.id().to_string()).collect(),
            go_first: false,
            max_turns,
            sim_type: SimType::OracleOnly,
            deck: BTreeMap::new(),
            queue: Some(queue.iter().map(|c| c.id().to_string()).collect()),
            rollouts: 1,
            seed: 42,
            budget: Default::default(),
            materials: materials.clone(),
            max_threads: None,
            glimpse_enabled: Some(true),
            max_hand_duration_secs: None,
            exhaustive_reservation: None,
max_card_draw: None,
        })
        .expect("solve");

        println!(
            "\n=== max_turns={max_turns} damage={} nodes={} ===",
            result.max_damage, result.nodes
        );
        for (i, event) in result.events.iter().enumerate() {
            println!("{i:02} {}", format_line_event(event));
        }
    }

    // After Verm→ID, Manic stays in hand; after ID→Verm, Manic is in memory.
    use ga_fire_engine::model::{Action, Phase, State, MAT_HAMMER};
    use ga_fire_engine::solver::apply_action;

    let opening = [
        Card::IgnitedStab,
        Card::DazzlingCourtesan,
        Card::IntensifiedPyre,
        Card::Rococo,
        Card::VermilionDecree,
        Card::UncannyRealization,
        Card::Virgil,
        Card::IncreasingDanger,
    ];
    let queue = [
        Card::ManicZealot,
        Card::SurgingBolt,
        Card::Demolition,
        Card::ClumsyApprentice,
    ];

    let mut verm_first = State::with_queue_and_materials(&opening, false, 2, &queue, MAT_HAMMER);
    let (after_verm, _) = apply_action(
        verm_first,
        Action::PlayAction {
            card: Card::VermilionDecree,
            kindle: 0,
            prepared: false,
            imbue: true,
            sacrifice_ally: None,
        },
    );
    verm_first = after_verm;
    println!(
        "\n=== Verm first: Manic in hand? {} ===",
        verm_first.has(Card::ManicZealot)
    );

    let mut id_first = State::with_queue_and_materials(&opening, false, 2, &queue, MAT_HAMMER);
    let (after_id, _) = apply_action(
        id_first,
        Action::PlayAction {
            card: Card::IncreasingDanger,
            kindle: 0,
            prepared: false,
            imbue: false,
            sacrifice_ally: None,
        },
    );
    id_first = after_id;
    let (after_verm2, _) = apply_action(
        id_first,
        Action::PlayAction {
            card: Card::VermilionDecree,
            kindle: 0,
            prepared: false,
            imbue: true,
            sacrifice_ally: None,
        },
    );
    id_first = after_verm2;
    println!(
        "=== ID first: Manic in hand? {} (memory {}) ===",
        id_first.has(Card::ManicZealot),
        id_first.memory[Card::ManicZealot.index()]
    );

    let mut user_t0 = after_verm;
    let (after_id2, _) = apply_action(
        user_t0,
        Action::PlayAction {
            card: Card::IncreasingDanger,
            kindle: 0,
            prepared: false,
            imbue: false,
            sacrifice_ally: None,
        },
    );
    user_t0 = after_id2;
    println!(
        "=== after Verm→ID: Manic hand={} mem={} damage {} ===",
        user_t0.hand[Card::ManicZealot.index()],
        user_t0.memory[Card::ManicZealot.index()],
        user_t0.damage
    );
    let (after_manic, manic_steps) = apply_action(
        user_t0,
        Action::PlayAlly {
            card: Card::ManicZealot,
            kindle: 0,
            sacrifice_ally: None,
            hot_cake_sacrifice: false,
            flagrant_level: None,
            flagrant_gy_return: None,
            tristan_agility: false,
        },
    );
    user_t0 = after_manic;
    println!(
        "=== after Manic play: allies={} damage {} steps {} ===",
        user_t0.ally_len,
        user_t0.damage,
        manic_steps.len()
    );
    let (after_atk, _) = apply_action(user_t0, Action::AttackOthers);
    user_t0 = after_atk;
    for _ in 0..12 {
        if user_t0.turn == 1 && user_t0.phase == Phase::Main {
            break;
        }
        let (next, _) = apply_action(user_t0, Action::Pass);
        user_t0 = next;
    }
    println!(
        "=== Verm→ID→Manic after T0 pass: turn {} damage {} ===",
        user_t0.turn, user_t0.damage
    );
}
