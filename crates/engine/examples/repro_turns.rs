use ga_fire_engine::cards::Card;
use ga_fire_engine::line_event::format_line_event;
use ga_fire_engine::model::{SimType, SolveRequest};
use ga_fire_engine::solve;
use std::collections::BTreeMap;

fn solve_hand(hand: &[Card], queue: &[Card], seed: u64, turns: u8) -> ga_fire_engine::model::SolveResult {
    let mut deck = BTreeMap::new();
    for c in hand.iter().chain(queue.iter()) { *deck.entry(c.id().to_string()).or_insert(0u8) += 1; }
    *deck.entry("brick".into()).or_insert(0) += 40;
    solve(&SolveRequest {
        hand: hand.iter().map(|c| c.id().to_string()).collect(),
        go_first: true, max_turns: turns, sim_type: SimType::OracleOnly, deck,
        queue: Some(queue.iter().map(|c| c.id().to_string()).collect()),
        rollouts: 1, seed, budget: Default::default(), materials: BTreeMap::new(),
        max_threads: None, glimpse_enabled: Some(true),
        max_hand_duration_secs: None, max_card_draw: None,
    }).expect("solve")
}

fn main() {
    let ally_heavy = [Card::Arthur, Card::Arthur, Card::ClumsyApprentice, Card::KingdomInformant, Card::KingdomInformant, Card::RedHare, Card::PepperedChef];
    let vermilion_hand = [Card::VermilionDecree, Card::ClumsyApprentice, Card::Arthur, Card::CorhaziCourier, Card::BlazingThrow, Card::PepperedChef, Card::IncreasingDanger];
    let queue = [Card::Rococo, Card::DazzlingCourtesan, Card::MarchHare, Card::IgnitedStab, Card::RendingFlames, Card::HastyMessenger, Card::SableRemnant, Card::HotCake, Card::KingdomInformant, Card::Brick, Card::Brick, Card::Brick];
    for (name, hand) in [("ally_heavy", &ally_heavy[..]), ("vermilion", &vermilion_hand[..])] {
        let r = solve_hand(hand, &queue, 42, 3);
        println!("{name} damage={} events={}", r.max_damage, r.events.len());
        for (i, e) in r.events.iter().enumerate() {
            println!("{i:02} {}", format_line_event(e));
        }
        println!();
    }
}
