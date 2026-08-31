//! Replay a deck eval's opening-hand draws without solving anything, and
//! optionally re-solve one sample to time it. Draw order matches the engine's
//! eval path exactly, so sample indexes line up with worker run logs
//! (`WORKER_LOG_RUNS=1`).
//!
//! Usage:
//!   cargo run -p ga-fire-engine --example replay_hands --release -- \
//!     '<deck-json>' <seed> <samples> [solve_index] [max_turns] [rollouts] [sim_type]
//!
//! Example — list 40 hands, then re-solve the outlier from the run log:
//!   cargo run -p ga-fire-engine --example replay_hands --release -- \
//!     '{"arthur":4,"brick":56}' 13 40
//!   cargo run -p ga-fire-engine --example replay_hands --release -- \
//!     '{"arthur":4,"brick":56}' 13 40 7 3 40 monte_carlo

use ga_fire_engine::cards::parse_card;
use ga_fire_engine::model::{SimType, SolveRequest};
use ga_fire_engine::{draw_opening_hands, solve};
use std::collections::BTreeMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread;
use std::time::{Duration, Instant};

fn rss_kb() -> u64 {
    std::fs::read_to_string("/proc/self/status")
        .ok()
        .and_then(|status| {
            status.lines().find_map(|line| {
                line.strip_prefix("VmRSS:")
                    .and_then(|rest| rest.split_whitespace().next())
                    .and_then(|value| value.parse().ok())
            })
        })
        .unwrap_or(0)
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 4 {
        eprintln!(
            "usage: replay_hands '<deck-json>' <seed> <samples> [solve_index] [max_turns] [rollouts] [sim_type]"
        );
        std::process::exit(2);
    }
    let deck_map: BTreeMap<String, u8> =
        serde_json::from_str(&args[1]).expect("deck must be a JSON object of card-id -> count");
    let seed: u64 = args[2].parse().expect("seed must be an integer");
    let samples: u16 = args[3].parse().expect("samples must be an integer");
    let solve_index: Option<u16> = args.get(4).and_then(|value| value.parse().ok());
    let max_turns: u8 = args.get(5).and_then(|v| v.parse().ok()).unwrap_or(3);
    let rollouts: u16 = args.get(6).and_then(|v| v.parse().ok()).unwrap_or(8);
    let sim_type = match args.get(7).map(String::as_str) {
        None | Some("monte_carlo") => SimType::MonteCarlo,
        Some("fire_brick") => SimType::FireBrick,
        Some("two_pass") => SimType::TwoPass,
        Some("oracle_only") | Some("oracle") => SimType::OracleOnly,
        Some(other) => {
            eprintln!("unknown sim_type {other}");
            std::process::exit(2);
        }
    };

    let mut deck = Vec::new();
    for (id, count) in &deck_map {
        let card = parse_card(id).unwrap_or_else(|| panic!("unknown card id {id}"));
        deck.extend(std::iter::repeat_n(card, *count as usize));
    }

    let hands = draw_opening_hands(&deck, samples, seed).expect("draw opening hands");
    for (index, hand) in hands.iter().enumerate() {
        let ids: Vec<_> = hand.iter().map(|card| card.id()).collect();
        println!("{index}: {}", ids.join(","));
    }

    let Some(index) = solve_index else { return };
    let hand = hands
        .get(usize::from(index))
        .unwrap_or_else(|| panic!("no sample {index}"));
    let hand_ids: Vec<String> = hand.iter().map(|card| card.id().to_string()).collect();
    eprintln!(
        "solving sample {index} ({sim_type:?}, {rollouts} rollouts, {max_turns} turns): {hand_ids:?}"
    );

    let stop = Arc::new(AtomicU64::new(0));
    let peak = Arc::new(AtomicU64::new(0));
    {
        let stop = stop.clone();
        let peak = peak.clone();
        thread::spawn(move || {
            while stop.load(Ordering::Relaxed) == 0 {
                peak.fetch_max(rss_kb(), Ordering::Relaxed);
                thread::sleep(Duration::from_millis(5));
            }
        });
    }
    let started = Instant::now();
    let result = solve(&SolveRequest {
        hand: hand_ids,
        go_first: true,
        max_turns,
        sim_type,
        deck: deck_map,
        queue: None,
        rollouts,
        // Matches the per-sample seed derivation in deck eval.
        seed: seed.wrapping_add(u64::from(index) * 17),
        budget: Default::default(),
        materials: BTreeMap::new(),
        max_threads: None,
        glimpse_enabled: None,
        max_hand_duration_secs: None,

    max_card_draw: None,
    })
    .expect("solve sample");
    stop.store(1, Ordering::Relaxed);
    thread::sleep(Duration::from_millis(30));

    eprintln!(
        "sample {index}: elapsed={:?} nodes={} memo_entries={} max_damage={} p50={:?} peak_rss_mb={}",
        started.elapsed(),
        result.nodes,
        result.memo_entries,
        result.max_damage,
        result.distribution.as_ref().map(|dist| dist.p50),
        peak.load(Ordering::Relaxed) / 1024,
    );
}
