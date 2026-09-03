//! Reproduce optimal 19 vs playtest 20 gap.
//! Run: cargo run -p ga-fire-engine --example repro_dazzl_line --release

use ga_fire_engine::cards::Card;
use ga_fire_engine::line_event::format_line_event;
use ga_fire_engine::model::{SimType, SolveRequest};
use ga_fire_engine::solve;
use std::collections::BTreeMap;

fn main() {
    let hand = [
        Card::DazzlingCourtesan,
        Card::HeatedVengeance,
        Card::PepperedChef,
        Card::Rococo,
        Card::Demolition,
        Card::SurgingBolt,
        Card::SurgingBolt,
    ];
    // Matches the playtest line: going-second draw HeatV, recollect Manic.
    let queue = [
        Card::HeatedVengeance,
        Card::ManicZealot,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
        Card::Brick,
    ];
    let mut materials = BTreeMap::new();
    materials.insert("impact_hammer".to_string(), 1_u8);
    let mut deck = BTreeMap::new();
    for card in hand.iter().chain(queue.iter()) {
        *deck.entry(card.id().to_string()).or_insert(0_u8) += 1;
    }

    for max_turns in [2_u8, 3] {
        let result = solve(&SolveRequest {
            hand: hand.iter().map(|c| c.id().to_string()).collect(),
            go_first: false,
            max_turns,
            sim_type: SimType::OracleOnly,
            deck: deck.clone(),
            queue: Some(
                [Card::HeatedVengeance, Card::ManicZealot]
                    .iter()
                    .map(|c| c.id().to_string())
                    .collect(),
            ),
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
}
