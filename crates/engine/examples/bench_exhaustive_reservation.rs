//! Compare oracle solve time with / without exhaustive reservation search.
//! Run: cargo run -p ga-fire-engine --example bench_exhaustive_reservation --release

use ga_fire_engine::cards::Card;
use ga_fire_engine::model::{SimType, SolveRequest};
use ga_fire_engine::solve;
use ga_fire_engine::solve_pass;
use std::collections::BTreeMap;
use std::time::Instant;

fn drill_three_hand() -> [Card; 7] {
    [
        Card::RendingFlames,
        Card::Arthur,
        Card::HastyMessenger,
        Card::KingdomInformant,
        Card::IgnitedStab,
        Card::SableRemnant,
        Card::ClumsyApprentice,
    ]
}

fn oracle_queue() -> Vec<Card> {
    const PILE: [Card; 7] = [
        Card::Arthur,
        Card::Arthur,
        Card::ClumsyApprentice,
        Card::KingdomInformant,
        Card::KingdomInformant,
        Card::RedHare,
        Card::PepperedChef,
    ];
    (0..64).map(|index| PILE[index % PILE.len()]).collect()
}

fn run_solve_once(exhaustive: bool) -> (u8, u64, f64) {
    let hand = drill_three_hand();
    let queue = oracle_queue();
    let result = solve(&SolveRequest {
        hand: hand.iter().map(|c| c.id().to_string()).collect(),
        go_first: true,
        max_turns: 2,
        sim_type: SimType::OracleOnly,
        deck: BTreeMap::from([("arthur".to_string(), 40_u8)]),
        queue: Some(queue.iter().map(|c| c.id().to_string()).collect()),
        rollouts: 1,
        seed: 42,
        budget: Default::default(),
        materials: BTreeMap::new(),
        max_threads: None,
        glimpse_enabled: Some(true),
        max_hand_duration_secs: None,
        max_card_draw: None,
        exhaustive_reservation: Some(exhaustive),
    })
    .expect("solve");
    (result.max_damage, result.nodes, result.elapsed_ms)
}

fn run_pass_once(exhaustive: bool) -> (u8, u64, f64) {
    let hand = drill_three_hand();
    let queue = oracle_queue();
    let start = Instant::now();
    let (pass, _) = solve_pass(
        &hand,
        true,
        2,
        &queue,
        true,
        exhaustive,
        ga_fire_engine::model::ALL_MATERIALS,
    )
    .expect("solve_pass");
    (
        pass.max_damage,
        pass.nodes,
        start.elapsed().as_secs_f64() * 1000.0,
    )
}

fn main() {
    const RUNS: u32 = 10;

    println!("Drill #3 hand, going first, 2 turns, oracle + glimpse + queue\n");

    let mut greedy_ms = 0.0;
    let mut exhaustive_ms = 0.0;
    for _ in 0..RUNS {
        greedy_ms += run_pass_once(false).2;
        exhaustive_ms += run_pass_once(true).2;
    }

    let (greedy_dmg, greedy_nodes, _) = run_pass_once(false);
    let (exhaustive_dmg, exhaustive_nodes, _) = run_pass_once(true);
    let (_, _, solve_greedy_ms) = run_solve_once(false);
    let (_, _, solve_exhaustive_ms) = run_solve_once(true);

    let greedy_avg = greedy_ms / f64::from(RUNS);
    let exhaustive_avg = exhaustive_ms / f64::from(RUNS);

    println!("solve_pass (engine inner loop):");
    println!("  greedy:     damage={greedy_dmg} nodes={greedy_nodes} avg_ms={greedy_avg:.2}");
    println!(
        "  exhaustive: damage={exhaustive_dmg} nodes={exhaustive_nodes} avg_ms={exhaustive_avg:.2}"
    );
    println!(
        "  overhead: {:.2}x (+{:.2} ms avg)\n",
        exhaustive_avg / greedy_avg.max(0.001),
        exhaustive_avg - greedy_avg
    );

    println!("solve() API (single run):");
    println!("  greedy:     {solve_greedy_ms:.2} ms");
    println!("  exhaustive: {solve_exhaustive_ms:.2} ms");
    println!(
        "  overhead: {:.2}x (+{:.2} ms)",
        solve_exhaustive_ms / solve_greedy_ms.max(0.001),
        solve_exhaustive_ms - solve_greedy_ms
    );
}
