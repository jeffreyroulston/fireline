use criterion::{Criterion, criterion_group, criterion_main};
use ga_fire_engine::{
    cards::Card,
    model::{ALL_MATERIALS, PassResult},
    solve_pass,
};
use std::hint::black_box;

const DRILL_THREE: [Card; 7] = [
    Card::RendingFlames,
    Card::Arthur,
    Card::HastyMessenger,
    Card::KingdomInformant,
    Card::IgnitedStab,
    Card::SableRemnant,
    Card::ClumsyApprentice,
];

const ALLY_HEAVY: [Card; 7] = [
    Card::Arthur,
    Card::Arthur,
    Card::ClumsyApprentice,
    Card::KingdomInformant,
    Card::KingdomInformant,
    Card::RedHare,
    Card::PepperedChef,
];

fn full_oracle_queue() -> Vec<Card> {
    (0..64)
        .map(|index| ALLY_HEAVY[index % ALLY_HEAVY.len()])
        .collect()
}

fn bench_with_stats(name: &str, c: &mut Criterion, mut solve: impl FnMut() -> PassResult) {
    let pass = solve();
    eprintln!(
        "{name}: nodes={} memo_entries={} max_damage={}",
        pass.nodes, pass.memo_entries, pass.max_damage
    );
    c.bench_function(name, move |bench| bench.iter(|| black_box(solve())));
}

fn fire_brick_drill_three(c: &mut Criterion) {
    bench_with_stats("fire_brick_drill_three", c, || {
        let (pass, _) = solve_pass(black_box(&DRILL_THREE), true, 3, &[], false, ALL_MATERIALS)
            .expect("solve_pass");
        pass
    });
}

fn fire_brick_ally_heavy(c: &mut Criterion) {
    bench_with_stats("fire_brick_ally_heavy", c, || {
        let (pass, _) = solve_pass(black_box(&ALLY_HEAVY), true, 3, &[], false, ALL_MATERIALS)
            .expect("solve_pass");
        pass
    });
}

fn oracle_full_queue(c: &mut Criterion) {
    let queue = full_oracle_queue();
    bench_with_stats("oracle_full_queue_drill_three", c, || {
        let (pass, _) = solve_pass(
            black_box(&DRILL_THREE),
            true,
            3,
            black_box(&queue),
            true,
            ALL_MATERIALS,
        )
        .expect("solve_pass");
        pass
    });
}

criterion_group!(
    benches,
    fire_brick_drill_three,
    fire_brick_ally_heavy,
    oracle_full_queue
);
criterion_main!(benches);
