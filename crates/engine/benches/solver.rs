use criterion::{Criterion, criterion_group, criterion_main};
use ga_fire_engine::{cards::Card, solve_cards};
use std::hint::black_box;

fn drill_three(c: &mut Criterion) {
    let hand = [
        Card::RendingFlames,
        Card::Arthur,
        Card::HastyMessenger,
        Card::KingdomInformant,
        Card::IgnitedStab,
        Card::SableRemnant,
        Card::ClumsyApprentice,
    ];
    c.bench_function("drill_three", |bench| {
        bench.iter(|| solve_cards(black_box(&hand), true, 3))
    });
}

criterion_group!(benches, drill_three);
criterion_main!(benches);
