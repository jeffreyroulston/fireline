use crate::{
    deck::{
        DeckEvalRequest, DeckEvalResult, HistoryPoint, Metric, OptimizeProgress, OptimizeRequest,
        OptimizeResult, RankedDeck, Strategy, consider_top, count_legal_decks, counts_key,
        initial_counts, ranked_decks,
    },
    error::{EngineError, Result},
    model::{Bounds, EffectiveRequest, SimType},
    random::Rng,
};
use std::collections::BTreeMap;
use std::ops::ControlFlow;
use std::time::Instant;

pub fn optimize_with_progress(
    request: &OptimizeRequest,
    on_progress: impl FnMut(OptimizeProgress) -> ControlFlow<()> + Send,
) -> Result<OptimizeResult> {
    match request.strategy {
        Strategy::SwapSweep => optimize_swap_sweep(request, on_progress),
        _ => optimize_search(request, on_progress),
    }
}

fn strategy_label(strategy: Strategy) -> &'static str {
    match strategy {
        Strategy::RandomSample => "randomSample",
        Strategy::HillClimb => "hillClimb",
        Strategy::Genetic => "genetic",
        Strategy::SwapSweep => "swapSweep",
    }
}

fn metric_score(result: &DeckEvalResult, metric: Metric) -> f64 {
    match metric {
        Metric::Mean => result.mean,
        Metric::P50 => f64::from(result.p50),
    }
}

fn build_effective(request: &OptimizeRequest, target: u32) -> EffectiveRequest {
    EffectiveRequest {
        root_seed: request.seed,
        sim_type: Some(SimType::FireBrick),
        deck: if request.strategy == Strategy::SwapSweep {
            request.base_deck.clone()
        } else {
            BTreeMap::new()
        },
        go_first: Some(true),
        max_turns: Some(3),
        rollouts: Some(1),
        samples: Some(request.samples),
        metric: Some(match request.metric {
            Metric::Mean => "mean",
            Metric::P50 => "p50",
        }),
        bounds: request.bounds.clone(),
        deck_size: Some(request.deck_size),
        decks: Some(target),
        strategy: Some(strategy_label(request.strategy)),
        budget: request.budget,
        ..Default::default()
    }
}

struct OptimizeSearchState {
    decks_scored: u32,
    best_score: f64,
    best: BTreeMap<String, u8>,
    top: Vec<(f64, BTreeMap<String, u8>, Vec<crate::stats::CardStat>)>,
    history: Vec<HistoryPoint>,
    seen: rustc_hash::FxHashSet<Vec<u8>>,
}

impl OptimizeSearchState {
    fn new() -> Self {
        Self {
            decks_scored: 0,
            best_score: 0.0,
            best: BTreeMap::new(),
            top: Vec::with_capacity(5),
            history: Vec::new(),
            seen: rustc_hash::FxHashSet::default(),
        }
    }

    fn record(
        &mut self,
        score: f64,
        counts: BTreeMap<String, u8>,
        card_stats: Vec<crate::stats::CardStat>,
    ) {
        consider_top(&mut self.top, score, &counts, card_stats);
        if self.decks_scored == 1 || score > self.best_score {
            self.best_score = score;
            self.best = counts;
        }
        self.history.push(HistoryPoint {
            iteration: self.decks_scored as u16,
            score: self.best_score,
        });
    }
}

struct ScoreContext<'a> {
    request: &'a OptimizeRequest,
    target: u32,
    legal_decks: u64,
    total_hands: u64,
}

fn score_optimize_deck_full(
    counts: &BTreeMap<String, u8>,
    ctx: &ScoreContext<'_>,
    decks_scored: &mut u32,
    best_score: f64,
    on_progress: &mut (impl FnMut(OptimizeProgress) -> ControlFlow<()> + Send),
) -> Result<DeckEvalResult> {
    *decks_scored += 1;
    if crate::cancel::is_cancel_requested() {
        return Err(EngineError::Cancelled);
    }
    let deck_number = *decks_scored;
    let samples = ctx.request.samples;
    crate::deck::evaluate_with_progress(
        &DeckEvalRequest {
            deck: counts.clone(),
            samples,
            go_first: true,
            max_turns: 3,
            seed: ctx.request.seed.wrapping_add(u64::from(deck_number) * 131),
            sim_type: SimType::FireBrick,
            rollouts: 1,
            budget: ctx.request.budget,
            materials: ctx.request.materials.clone(),
        },
        |progress| {
            let hands_simulated = u64::from(deck_number.saturating_sub(1)) * u64::from(samples)
                + u64::from(progress.sample);
            on_progress(OptimizeProgress {
                decks_scored: deck_number,
                total_decks: ctx.target,
                legal_decks: ctx.legal_decks,
                hands_simulated,
                total_hands: ctx.total_hands,
                best_score,
            })
        },
    )
}

fn try_score_search(
    counts: BTreeMap<String, u8>,
    state: &mut OptimizeSearchState,
    ctx: &ScoreContext<'_>,
    on_progress: &mut (impl FnMut(OptimizeProgress) -> ControlFlow<()> + Send),
) -> Result<bool> {
    let key = counts_key(&counts);
    if !state.seen.insert(key) {
        return Ok(false);
    }
    let eval = score_optimize_deck_full(
        &counts,
        ctx,
        &mut state.decks_scored,
        state.best_score,
        on_progress,
    )?;
    let score = metric_score(&eval, ctx.request.metric);
    state.record(score, counts, eval.card_stats);
    Ok(true)
}

fn optimize_search(
    request: &OptimizeRequest,
    mut on_progress: impl FnMut(OptimizeProgress) -> ControlFlow<()> + Send,
) -> Result<OptimizeResult> {
    let started = Instant::now();
    let legal_decks = count_legal_decks(&request.bounds, request.deck_size)?;
    if legal_decks == 0 {
        return Err(EngineError::invalid(
            "no legal lists exist for these bounds and deck size",
        ));
    }

    let target = (request.decks.max(1))
        .min(request.budget.max_optimize_decks)
        .min(u32::try_from(legal_decks).unwrap_or(u32::MAX));
    let total_hands = u64::from(target) * u64::from(request.samples);
    let mut state = OptimizeSearchState::new();

    if on_progress(OptimizeProgress {
        decks_scored: 0,
        total_decks: target,
        legal_decks,
        hands_simulated: 0,
        total_hands,
        best_score: 0.0,
    })
    .is_break()
    {
        return Err(EngineError::Cancelled);
    }

    let ctx = ScoreContext {
        request,
        target,
        legal_decks,
        total_hands,
    };

    match request.strategy {
        Strategy::RandomSample => {
            optimize_random_sample(request, &ctx, &mut state, &mut on_progress)?;
        }
        Strategy::HillClimb => {
            optimize_hill_climb(request, &ctx, &mut state, &mut on_progress)?;
        }
        Strategy::Genetic => {
            optimize_genetic(request, &ctx, &mut state, &mut on_progress)?;
        }
        Strategy::SwapSweep => unreachable!(),
    }

    if state.decks_scored == 0 {
        return Err(EngineError::invalid("could not sample any legal lists"));
    }

    let _ = on_progress(OptimizeProgress {
        decks_scored: state.decks_scored,
        total_decks: target,
        legal_decks,
        hands_simulated: u64::from(state.decks_scored) * u64::from(request.samples),
        total_hands,
        best_score: state.best_score,
    });

    Ok(OptimizeResult {
        best_counts: state.best,
        best_score: state.best_score,
        top: ranked_decks(&state.top),
        history: state.history,
        legal_decks,
        decks_scored: state.decks_scored,
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        effective: build_effective(request, target),
    })
}

fn optimize_random_sample(
    request: &OptimizeRequest,
    ctx: &ScoreContext<'_>,
    state: &mut OptimizeSearchState,
    on_progress: &mut (impl FnMut(OptimizeProgress) -> ControlFlow<()> + Send),
) -> Result<()> {
    let mut rng = Rng::new(request.seed);
    let mut attempts = 0_u64;
    let max_draw_attempts = u64::from(ctx.target).saturating_mul(64).max(64);

    while state.decks_scored < ctx.target && attempts < max_draw_attempts {
        attempts += 1;
        if state.seen.len() as u64 >= ctx.legal_decks {
            break;
        }
        let counts = initial_counts(&request.bounds, request.deck_size, &mut rng)?;
        try_score_search(counts, state, ctx, on_progress)?;
    }
    Ok(())
}

const NEIGHBOR_SAMPLE_CAP: usize = 64;
const POP_SIZE_CAP: u32 = 24;
const ELITE_COUNT: usize = 2;
const TOURNAMENT_SIZE: usize = 3;
const MUTATION_RATE: u64 = 20;

fn legal_neighbors(
    counts: &BTreeMap<String, u8>,
    bounds: &BTreeMap<String, Bounds>,
    cap: usize,
) -> Vec<BTreeMap<String, u8>> {
    let mut dec_candidates = Vec::new();
    let mut inc_candidates = Vec::new();
    for (id, &count) in counts {
        if count > bounds.get(id).map(|b| b.min).unwrap_or(0) {
            dec_candidates.push(id.clone());
        }
        if count < bounds.get(id).map(|b| b.max).unwrap_or(4) {
            inc_candidates.push(id.clone());
        }
    }
    let mut neighbors = Vec::new();
    'outer: for dec in &dec_candidates {
        for inc in &inc_candidates {
            if dec == inc {
                continue;
            }
            let mut next = counts.clone();
            *next.get_mut(dec).expect("dec id") -= 1;
            *next.get_mut(inc).expect("inc id") += 1;
            neighbors.push(next);
            if neighbors.len() >= cap {
                break 'outer;
            }
        }
    }
    neighbors
}

fn optimize_hill_climb(
    request: &OptimizeRequest,
    ctx: &ScoreContext<'_>,
    state: &mut OptimizeSearchState,
    on_progress: &mut (impl FnMut(OptimizeProgress) -> ControlFlow<()> + Send),
) -> Result<()> {
    let mut rng = Rng::new(request.seed);
    let mut attempts = 0_u64;
    let max_draw_attempts = u64::from(ctx.target).saturating_mul(64).max(64);

    while state.decks_scored < ctx.target && attempts < max_draw_attempts {
        attempts += 1;
        let mut current = initial_counts(&request.bounds, request.deck_size, &mut rng)?;
        let eval = score_optimize_deck_full(
            &current,
            ctx,
            &mut state.decks_scored,
            state.best_score,
            on_progress,
        )?;
        let mut current_score = metric_score(&eval, request.metric);
        state.record(current_score, current.clone(), eval.card_stats);
        state.seen.insert(counts_key(&current));

        loop {
            if state.decks_scored >= ctx.target {
                break;
            }
            let neighbors = legal_neighbors(&current, &request.bounds, NEIGHBOR_SAMPLE_CAP);
            if neighbors.is_empty() {
                break;
            }
            let mut best_neighbor: Option<(f64, BTreeMap<String, u8>)> = None;
            for neighbor in neighbors {
                if state.seen.contains(&counts_key(&neighbor)) {
                    continue;
                }
                let eval = score_optimize_deck_full(
                    &neighbor,
                    ctx,
                    &mut state.decks_scored,
                    state.best_score,
                    on_progress,
                )?;
                let score = metric_score(&eval, request.metric);
                state.record(score, neighbor.clone(), eval.card_stats);
                state.seen.insert(counts_key(&neighbor));
                if state.decks_scored >= ctx.target {
                    break;
                }
                if score > current_score {
                    match &best_neighbor {
                        Some((best, _)) if score <= *best => {}
                        _ => best_neighbor = Some((score, neighbor)),
                    }
                }
            }
            let Some((best_score, next)) = best_neighbor else {
                break;
            };
            current_score = best_score;
            current = next;
        }
    }
    Ok(())
}

fn tournament_select<'a>(
    population: &'a [(f64, BTreeMap<String, u8>)],
    rng: &mut Rng,
) -> &'a BTreeMap<String, u8> {
    let pick = rng.index(population.len());
    let mut best_score = population[pick].0;
    let mut best = &population[pick].1;
    for _ in 1..TOURNAMENT_SIZE {
        let index = rng.index(population.len());
        let (score, counts) = &population[index];
        if *score > best_score {
            best_score = *score;
            best = counts;
        }
    }
    best
}

fn crossover(
    left: &BTreeMap<String, u8>,
    right: &BTreeMap<String, u8>,
    bounds: &BTreeMap<String, Bounds>,
    rng: &mut Rng,
) -> BTreeMap<String, u8> {
    let mut child = BTreeMap::new();
    for id in bounds.keys() {
        let count = if rng.next().is_multiple_of(2) {
            *left.get(id).unwrap_or(&0)
        } else {
            *right.get(id).unwrap_or(&0)
        };
        child.insert(id.clone(), count);
    }
    child
}

fn repair_to_size(
    counts: &mut BTreeMap<String, u8>,
    bounds: &BTreeMap<String, Bounds>,
    deck_size: u8,
    rng: &mut Rng,
) -> Result<()> {
    for (id, bound) in bounds {
        let count = counts.entry(id.clone()).or_insert(bound.min);
        *count = (*count).clamp(bound.min, bound.max);
    }
    let total: u16 = counts.values().map(|&c| u16::from(c)).sum();
    let target = u16::from(deck_size);
    let ids: Vec<_> = bounds.keys().cloned().collect();
    if total < target {
        let mut remaining = target - total;
        while remaining > 0 {
            let expandable: Vec<_> = ids
                .iter()
                .filter(|id| counts[*id] < bounds[*id].max)
                .collect();
            if expandable.is_empty() {
                return Err(EngineError::invalid(
                    "could not repair child deck to target size",
                ));
            }
            let id = expandable[rng.index(expandable.len())];
            *counts.get_mut(id).expect("id") += 1;
            remaining -= 1;
        }
    } else if total > target {
        let mut excess = total - target;
        while excess > 0 {
            let shrinkable: Vec<_> = ids
                .iter()
                .filter(|id| counts[*id] > bounds[*id].min)
                .collect();
            if shrinkable.is_empty() {
                return Err(EngineError::invalid(
                    "could not repair child deck to target size",
                ));
            }
            let id = shrinkable[rng.index(shrinkable.len())];
            *counts.get_mut(id).expect("id") -= 1;
            excess -= 1;
        }
    }
    Ok(())
}

fn mutate(counts: &mut BTreeMap<String, u8>, bounds: &BTreeMap<String, Bounds>, rng: &mut Rng) {
    let neighbors = legal_neighbors(counts, bounds, NEIGHBOR_SAMPLE_CAP);
    if !neighbors.is_empty() {
        *counts = neighbors[rng.index(neighbors.len())].clone();
    }
}

fn optimize_genetic(
    request: &OptimizeRequest,
    ctx: &ScoreContext<'_>,
    state: &mut OptimizeSearchState,
    on_progress: &mut (impl FnMut(OptimizeProgress) -> ControlFlow<()> + Send),
) -> Result<()> {
    let mut rng = Rng::new(request.seed.wrapping_add(17));
    let pop_size = ctx.target.clamp(4, POP_SIZE_CAP);
    let mut population: Vec<(f64, BTreeMap<String, u8>)> = Vec::new();
    let mut seed_attempts = 0_u64;

    while population.len() < pop_size as usize && seed_attempts < u64::from(pop_size) * 64 {
        seed_attempts += 1;
        let counts = initial_counts(&request.bounds, request.deck_size, &mut rng)?;
        if state.seen.contains(&counts_key(&counts)) {
            continue;
        }
        let eval = score_optimize_deck_full(
            &counts,
            ctx,
            &mut state.decks_scored,
            state.best_score,
            on_progress,
        )?;
        let score = metric_score(&eval, request.metric);
        state.record(score, counts.clone(), eval.card_stats);
        state.seen.insert(counts_key(&counts));
        population.push((score, counts));
        if state.decks_scored >= ctx.target {
            break;
        }
    }

    population.sort_by(|left, right| {
        right
            .0
            .partial_cmp(&left.0)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    while state.decks_scored < ctx.target && !population.is_empty() {
        let mut next_generation = population
            .iter()
            .take(ELITE_COUNT)
            .map(|(score, counts)| (*score, counts.clone()))
            .collect::<Vec<_>>();

        while next_generation.len() < pop_size as usize && state.decks_scored < ctx.target {
            let parent_a = tournament_select(&population, &mut rng);
            let parent_b = tournament_select(&population, &mut rng);
            let mut child = crossover(parent_a, parent_b, &request.bounds, &mut rng);
            repair_to_size(&mut child, &request.bounds, request.deck_size, &mut rng)?;
            if rng.next() % 100 < MUTATION_RATE {
                mutate(&mut child, &request.bounds, &mut rng);
                repair_to_size(&mut child, &request.bounds, request.deck_size, &mut rng)?;
            }
            if state.seen.contains(&counts_key(&child)) {
                continue;
            }
            let eval = score_optimize_deck_full(
                &child,
                ctx,
                &mut state.decks_scored,
                state.best_score,
                on_progress,
            )?;
            let score = metric_score(&eval, request.metric);
            state.record(score, child.clone(), eval.card_stats);
            state.seen.insert(counts_key(&child));
            next_generation.push((score, child));
        }

        next_generation.sort_by(|left, right| {
            right
                .0
                .partial_cmp(&left.0)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        next_generation.truncate(pop_size as usize);
        population = next_generation;
    }
    Ok(())
}

pub fn apply_fixed_swap(
    base: &BTreeMap<String, u8>,
    from: &str,
    to: &str,
    count: u8,
) -> Result<BTreeMap<String, u8>> {
    crate::cards::parse_card(from).ok_or_else(|| EngineError::UnknownCard(from.to_string()))?;
    crate::cards::parse_card(to).ok_or_else(|| EngineError::UnknownCard(to.to_string()))?;
    if from == to {
        return Err(EngineError::invalid("swap from and to must differ"));
    }
    let from_count = *base.get(from).unwrap_or(&0);
    if from_count < count {
        return Err(EngineError::invalid(format!(
            "not enough copies of {from} to swap {count}"
        )));
    }
    let to_count = *base.get(to).unwrap_or(&0);
    if to_count.saturating_add(count) > 4 {
        return Err(EngineError::invalid(format!(
            "swap would exceed 4 copies of {to}"
        )));
    }
    let mut next = base.clone();
    *next.get_mut(from).expect("from") -= count;
    if next[from] == 0 {
        next.remove(from);
    }
    *next.entry(to.to_string()).or_insert(0) += count;
    Ok(next)
}

fn optimize_swap_sweep(
    request: &OptimizeRequest,
    mut on_progress: impl FnMut(OptimizeProgress) -> ControlFlow<()> + Send,
) -> Result<OptimizeResult> {
    let started = Instant::now();
    let swap = request
        .swap
        .as_ref()
        .ok_or_else(|| EngineError::invalid("swap config is required for swap sweep"))?;
    if swap.candidates.is_empty() {
        return Err(EngineError::invalid(
            "swap sweep requires at least one candidate",
        ));
    }
    if request.base_deck.is_empty() {
        return Err(EngineError::invalid("base deck is required for swap sweep"));
    }

    let target = 1_u32.saturating_add(swap.candidates.len() as u32);
    let total_hands = u64::from(target) * u64::from(request.samples);
    let legal_decks = swap.candidates.len() as u64 + 1;

    if on_progress(OptimizeProgress {
        decks_scored: 0,
        total_decks: target,
        legal_decks,
        hands_simulated: 0,
        total_hands,
        best_score: 0.0,
    })
    .is_break()
    {
        return Err(EngineError::Cancelled);
    }

    let ctx = ScoreContext {
        request,
        target,
        legal_decks,
        total_hands,
    };

    let mut decks_scored = 0_u32;
    let mut history = Vec::new();
    let mut rows: Vec<RankedDeck> = Vec::new();

    let baseline_eval = score_optimize_deck_full(
        &request.base_deck,
        &ctx,
        &mut decks_scored,
        0.0,
        &mut on_progress,
    )?;
    let baseline_score = metric_score(&baseline_eval, request.metric);
    let mut best_score = baseline_score;
    let mut best = request.base_deck.clone();
    rows.push(RankedDeck {
        rank: 0,
        score: baseline_score,
        counts: request.base_deck.clone(),
        score_delta: None,
        card_stats: baseline_eval.card_stats,
        candidate: None,
    });
    history.push(HistoryPoint {
        iteration: decks_scored as u16,
        score: baseline_score,
    });

    let mut candidate_rows: Vec<RankedDeck> = Vec::new();
    for candidate in &swap.candidates {
        let counts = apply_fixed_swap(&request.base_deck, &swap.from, candidate, swap.count)?;
        let eval = score_optimize_deck_full(
            &counts,
            &ctx,
            &mut decks_scored,
            best_score,
            &mut on_progress,
        )?;
        let score = metric_score(&eval, request.metric);
        if score > best_score {
            best_score = score;
            best = counts.clone();
        }
        history.push(HistoryPoint {
            iteration: decks_scored as u16,
            score: best_score,
        });
        candidate_rows.push(RankedDeck {
            rank: 0,
            score,
            counts,
            score_delta: Some(score - baseline_score),
            card_stats: eval.card_stats,
            candidate: Some(candidate.clone()),
        });
    }

    candidate_rows.sort_by(|left, right| {
        right
            .score
            .partial_cmp(&left.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    for (index, row) in candidate_rows.iter_mut().enumerate() {
        row.rank = (index + 1) as u8;
    }
    rows.extend(candidate_rows);

    let _ = on_progress(OptimizeProgress {
        decks_scored,
        total_decks: target,
        legal_decks,
        hands_simulated: u64::from(decks_scored) * u64::from(request.samples),
        total_hands,
        best_score,
    });

    Ok(OptimizeResult {
        best_counts: best,
        best_score,
        top: rows,
        history,
        legal_decks,
        decks_scored,
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        effective: build_effective(request, target),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::budget::Budget;
    use crate::deck::{SwapConfig, optimize};

    fn sample_bounds() -> BTreeMap<String, Bounds> {
        BTreeMap::from([
            ("arthur".into(), Bounds { min: 1, max: 3 }),
            ("kingdom_informant".into(), Bounds { min: 1, max: 3 }),
            ("clumsy_apprentice".into(), Bounds { min: 1, max: 3 }),
        ])
    }

    #[test]
    fn swap_sweep_preserves_deck_size() {
        let base = BTreeMap::from([
            ("arthur".into(), 3_u8),
            ("kingdom_informant".into(), 2),
            ("clumsy_apprentice".into(), 2),
        ]);
        let result = optimize(&OptimizeRequest {
            bounds: BTreeMap::new(),
            deck_size: 7,
            samples: 1,
            decks: 1,
            metric: Metric::Mean,
            seed: 1,
            budget: Budget::default(),
            materials: BTreeMap::new(),
            strategy: Strategy::SwapSweep,
            base_deck: base,
            swap: Some(SwapConfig {
                from: "arthur".into(),
                count: 1,
                candidates: vec!["sable_remnant".into(), "blazing_throw".into()],
            }),
        })
        .unwrap();
        assert!(result.decks_scored >= 3);
        assert_eq!(result.top.len(), 3);
        for row in &result.top {
            let total: u16 = row.counts.values().map(|&c| u16::from(c)).sum();
            assert_eq!(total, 7);
        }
    }

    #[test]
    fn swap_sweep_card_stats_include_full_deck() {
        let base = BTreeMap::from([
            ("arthur".into(), 3_u8),
            ("kingdom_informant".into(), 2),
            ("clumsy_apprentice".into(), 2),
        ]);
        let result = optimize(&OptimizeRequest {
            bounds: BTreeMap::new(),
            deck_size: 7,
            samples: 2,
            decks: 1,
            metric: Metric::Mean,
            seed: 42,
            budget: Budget::default(),
            materials: BTreeMap::new(),
            strategy: Strategy::SwapSweep,
            base_deck: base,
            swap: Some(SwapConfig {
                from: "arthur".into(),
                count: 1,
                candidates: vec!["sable_remnant".into()],
            }),
        })
        .unwrap();
        let candidate = result
            .top
            .iter()
            .find(|row| row.candidate.is_some())
            .expect("candidate row");
        assert!(candidate.card_stats.len() >= 3);
        assert!(
            candidate
                .card_stats
                .iter()
                .any(|stat| stat.card == "kingdom_informant")
        );
        let baseline = result
            .top
            .iter()
            .find(|row| row.rank == 0)
            .expect("baseline row");
        assert!(baseline.card_stats.len() >= 3);
    }

    #[test]
    fn hill_climb_is_deterministic() {
        let request = OptimizeRequest {
            bounds: sample_bounds(),
            deck_size: 7,
            samples: 1,
            decks: 4,
            metric: Metric::Mean,
            seed: 9,
            budget: Budget::default(),
            materials: BTreeMap::new(),
            strategy: Strategy::HillClimb,
            base_deck: BTreeMap::new(),
            swap: None,
        };
        let one = optimize(&request).unwrap();
        let two = optimize(&request).unwrap();
        assert_eq!(one.best_score, two.best_score);
        assert_eq!(one.best_counts, two.best_counts);
    }

    #[test]
    fn genetic_is_deterministic() {
        let request = OptimizeRequest {
            bounds: sample_bounds(),
            deck_size: 7,
            samples: 1,
            decks: 6,
            metric: Metric::Mean,
            seed: 11,
            budget: Budget::default(),
            materials: BTreeMap::new(),
            strategy: Strategy::Genetic,
            base_deck: BTreeMap::new(),
            swap: None,
        };
        let one = optimize(&request).unwrap();
        let two = optimize(&request).unwrap();
        assert_eq!(one.best_score, two.best_score);
    }
}
