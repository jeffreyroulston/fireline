//! Peak RSS probe for oracle/Monte Carlo solves. Run with:
//! `cargo run -p ga-fire-engine --example mc_rss --release`
//!
//! Linux-only dev tool: reads `/proc/self/status`.
//!
//! Useful when checking that Monte Carlo rollouts reuse one Search memo
//! instead of stacking allocator arenas.

use ga_fire_engine::cards::Card;
use ga_fire_engine::model::{SimType, SolveRequest};
use ga_fire_engine::{hand_threads, solve, solve_pass};
use std::collections::BTreeMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread;
use std::time::Duration;

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

fn sample_peak(stop: Arc<AtomicU64>, peak: Arc<AtomicU64>) {
    thread::spawn(move || {
        while stop.load(Ordering::Relaxed) == 0 {
            peak.fetch_max(rss_kb(), Ordering::Relaxed);
            thread::sleep(Duration::from_millis(5));
        }
    });
}

fn main() {
    eprintln!(
        "State={} bytes; monte_carlo_hand_threads={}",
        std::mem::size_of::<ga_fire_engine::model::State>(),
        hand_threads(SimType::MonteCarlo)
    );

    let hand = [
        Card::Arthur,
        Card::RendingFlames,
        Card::KingdomInformant,
        Card::HastyMessenger,
        Card::IgnitedStab,
        Card::SableRemnant,
        Card::ClumsyApprentice,
    ];
    let queue: Vec<_> = (0..53)
        .map(|i| {
            [
                Card::Arthur,
                Card::KingdomInformant,
                Card::RendingFlames,
                Card::Brick,
                Card::IgnitedStab,
            ][i % 5]
        })
        .collect();

    let stop = Arc::new(AtomicU64::new(0));
    let peak = Arc::new(AtomicU64::new(0));
    sample_peak(stop.clone(), peak.clone());
    let before = rss_kb();
    let (pass, _) = solve_pass(
        &hand,
        true,
        3,
        &queue,
        true,
        ga_fire_engine::model::ALL_MATERIALS,
    );
    stop.store(1, Ordering::Relaxed);
    thread::sleep(Duration::from_millis(30));
    eprintln!(
        "oracle_pass nodes={} memo={} events={} rss_before_kb={before} rss_after_kb={} peak_kb={}",
        pass.nodes,
        pass.memo_entries,
        pass.events.len(),
        rss_kb(),
        peak.load(Ordering::Relaxed)
    );

    let mut deck = BTreeMap::new();
    for id in [
        "arthur",
        "rending_flames",
        "kingdom_informant",
        "hasty_messenger",
        "ignited_stab",
        "sable_remnant",
        "clumsy_apprentice",
        "planted_explosive",
        "intensified_pyre",
        "vermilion_decree",
        "red_hare",
        "march_hare",
        "rococo",
        "peppered_chef",
        "brick",
    ] {
        deck.insert(id.to_string(), 4);
    }

    let stop = Arc::new(AtomicU64::new(0));
    let peak = Arc::new(AtomicU64::new(0));
    sample_peak(stop.clone(), peak.clone());
    let before = rss_kb();
    let result = solve(&SolveRequest {
        hand: hand.iter().map(|card| card.id().to_string()).collect(),
        go_first: true,
        max_turns: 3,
        sim_type: SimType::MonteCarlo,
        deck,
        queue: None,
        rollouts: 8,
        seed: 42,
        budget: Default::default(),
        materials: BTreeMap::new(),
    })
    .expect("mc solve");
    stop.store(1, Ordering::Relaxed);
    thread::sleep(Duration::from_millis(30));
    eprintln!(
        "mc_solve nodes={} memo={} rollouts={} rss_before_kb={before} rss_after_kb={} peak_kb={}",
        result.nodes,
        result.memo_entries,
        result
            .distribution
            .as_ref()
            .map(|dist| dist.rollouts.len())
            .unwrap_or(0),
        rss_kb(),
        peak.load(Ordering::Relaxed)
    );
}
