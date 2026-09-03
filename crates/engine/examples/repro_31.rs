//! Reproduce 28-vs-31 oracle gap from playtest compare.
//! Run: cargo run -p ga-fire-engine --example repro_31 --release

use ga_fire_engine::cards::Card;
use ga_fire_engine::line_event::format_line_event;
use ga_fire_engine::model::{SimType, SolveRequest};
use ga_fire_engine::solve;
use std::collections::BTreeMap;

fn oracle(
    hand: &[Card],
    queue: &[Card],
    seed: u64,
    glimpse: bool,
) -> ga_fire_engine::model::SolveResult {
    let mut deck = BTreeMap::new();
    for card in hand.iter().chain(queue.iter()) {
        *deck.entry(card.id().to_string()).or_insert(0u8) += 1;
    }
    for id in ["brick"] {
        *deck.entry(id.to_string()).or_insert(0) += 40;
    }
    solve(&SolveRequest {
        hand: hand.iter().map(|c| c.id().to_string()).collect(),
        go_first: true,
        max_turns: 3,
        sim_type: SimType::OracleOnly,
        deck,
        queue: Some(queue.iter().map(|c| c.id().to_string()).collect()),
        rollouts: 1,
        seed,
        budget: Default::default(),
        materials: BTreeMap::new(),
        max_threads: None,
        glimpse_enabled: Some(glimpse),
        max_hand_duration_secs: None,
        max_card_draw: None,
    })
    .expect("solve")
}

fn main() {
    let hand = [
        Card::VermilionDecree,
        Card::ClumsyApprentice,
        Card::Arthur,
        Card::CorhaziCourier,
        Card::MarchHare,
        Card::BlazingThrow,
        Card::PepperedChef,
    ];
    let queue = [
        Card::Rococo,
        Card::DazzlingCourtesan,
        Card::IncreasingDanger,
        Card::KingdomInformant,
        Card::IgnitedStab,
        Card::RendingFlames,
        Card::HastyMessenger,
        Card::SableRemnant,
        Card::HotCake,
        Card::Brick,
        Card::Brick,
        Card::Brick,
    ];

    let no_bnb = std::env::var_os("GA_FIRE_NO_BNB").is_some();
    println!("GA_FIRE_NO_BNB={no_bnb}");

    for glimpse in [true, false] {
        let result = oracle(&hand, &queue, 42, glimpse);
        let labels: Vec<_> = result.events.iter().map(format_line_event).collect();
        println!(
            "\n=== glimpse={glimpse} damage={} nodes={} ===",
            result.max_damage, result.nodes
        );
        for (i, label) in labels.iter().enumerate() {
            println!("{i:02} {label}");
        }
    }
}

fn oracle_turns(hand: &[Card], queue: &[Card], seed: u64, max_turns: u8) -> u8 {
    let mut deck = BTreeMap::new();
    for card in hand.iter().chain(queue.iter()) {
        *deck.entry(card.id().to_string()).or_insert(0u8) += 1;
    }
    *deck.entry("brick".to_string()).or_insert(0) += 40;
    solve(&SolveRequest {
        hand: hand.iter().map(|c| c.id().to_string()).collect(),
        go_first: true,
        max_turns,
        sim_type: SimType::OracleOnly,
        deck,
        queue: Some(queue.iter().map(|c| c.id().to_string()).collect()),
        rollouts: 1,
        seed,
        budget: Default::default(),
        materials: BTreeMap::new(),
        max_threads: None,
        glimpse_enabled: Some(true),
        max_hand_duration_secs: None,
        max_card_draw: None,
    })
    .map(|r| r.max_damage)
    .unwrap_or(0)
}
