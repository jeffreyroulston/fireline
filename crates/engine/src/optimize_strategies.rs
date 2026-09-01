use crate::{
    deck::{
        DeckEvalRequest, DeckEvalResult, HandProgress, HistoryPoint, Metric, OptimizeProgress,
        OptimizeRequest, OptimizeResult, RankedDeck, Strategy, consider_top, count_legal_decks,
        counts_key, initial_counts, ranked_decks,
    },
    error::{EngineError, Result},
    model::{Bounds, EffectiveRequest},
    random::Rng,
    version::ENGINE_VERSION,
};
use std::collections::BTreeMap;
use std::ops::ControlFlow;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::OnceLock;
use std::time::Instant;

pub fn optimize_with_progress(
    request: &OptimizeRequest,
    on_progress: impl FnMut(OptimizeProgress) -> ControlFlow<()> + Send,
) -> Result<OptimizeResult> {
    optimize_with_hand_progress(request, on_progress, |_| ControlFlow::Continue(()))
}

pub fn optimize_with_hand_progress(
    request: &OptimizeRequest,
    on_progress: impl FnMut(OptimizeProgress) -> ControlFlow<()> + Send,
    on_hand_progress: impl FnMut(HandProgress) -> ControlFlow<()> + Send,
) -> Result<OptimizeResult> {
    let on_hand_progress = Mutex::new(on_hand_progress);
    match request.strategy {
        Strategy::SwapSweep => optimize_swap_sweep(request, on_progress, &on_hand_progress),
        Strategy::MultiDeck => optimize_multi_deck(request, on_progress, &on_hand_progress),
        _ => optimize_search(request, on_progress, &on_hand_progress),
    }
}

fn strategy_label(strategy: Strategy) -> &'static str {
    match strategy {
        Strategy::RandomSample => "randomSample",
        Strategy::HillClimb => "hillClimb",
        Strategy::Genetic => "genetic",
        Strategy::SwapSweep => "swapSweep",
        Strategy::MultiDeck => "multiDeck",
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
        engine_version: ENGINE_VERSION,
        root_seed: request.seed,
        sim_type: Some(request.sim_type),
        deck: if request.strategy == Strategy::SwapSweep {
            request.base_deck.clone()
        } else {
            BTreeMap::new()
        },
        go_first: Some(request.go_first),
        max_turns: Some(request.max_turns),
        rollouts: Some(request.rollouts),
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
        max_threads: request.max_threads,
        glimpse_enabled: request.glimpse_enabled,
        max_hand_duration_secs: request.max_hand_duration_secs,
        max_card_draw: request.max_card_draw,
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

struct ScoreContext<'a, H> {
    request: &'a OptimizeRequest,
    target: u32,
    legal_decks: u64,
    total_hands: u64,
    on_hand_progress: &'a Mutex<H>,
}

fn deck_parallelism() -> usize {
    static CAP: OnceLock<usize> = OnceLock::new();
    *CAP.get_or_init(|| {
        std::env::var("GA_FIRE_DECK_PARALLEL")
            .ok()
            .and_then(|value| value.parse().ok())
            .filter(|&count| count > 0)
            .unwrap_or_else(|| {
                std::thread::available_parallelism()
                    .map(|count| (count.get() / 2).max(1).min(8))
                    .unwrap_or(2)
            })
    })
}

struct ParallelDeckControl {
    stop: AtomicBool,
    save_cutoff: AtomicU32,
    cancel: Option<crate::cancel::CancelFlag>,
}

fn save_keep_partial() -> bool {
    crate::cancel::is_save_requested()
        || crate::cancel::current_flag()
            .is_some_and(|flag| crate::cancel::is_save_requested_on(&flag))
}

fn should_abort_deck(control: Option<&ParallelDeckControl>, deck_number: u32) -> bool {
    let Some(ctrl) = control else {
        return crate::cancel::is_cancel_requested();
    };
    let Some(flag) = ctrl.cancel.as_ref() else {
        return false;
    };
    if !crate::cancel::is_requested(flag) {
        return false;
    }
    if crate::cancel::is_save_requested_on(flag) {
        return deck_number >= ctrl.save_cutoff.load(Ordering::Relaxed);
    }
    true
}

impl ParallelDeckControl {
    fn new(cancel: Option<crate::cancel::CancelFlag>) -> Self {
        Self {
            stop: AtomicBool::new(false),
            save_cutoff: AtomicU32::new(u32::MAX),
            cancel,
        }
    }

    fn note_progress(&self, decks_scored: u32) {
        let save = self
            .cancel
            .as_ref()
            .is_some_and(crate::cancel::is_save_requested_on)
            || save_keep_partial();
        if save {
            // Record the first save cutoff only. In-flight decks with lower
            // deck numbers can still report progress after save is requested.
            let _ = self.save_cutoff.compare_exchange(
                u32::MAX,
                decks_scored,
                Ordering::Relaxed,
                Ordering::Relaxed,
            );
            self.stop.store(true, Ordering::Relaxed);
        }
    }

    fn should_stop(&self) -> bool {
        self.stop.load(Ordering::Relaxed)
            || self
                .cancel
                .as_ref()
                .is_some_and(|flag| crate::cancel::is_requested(flag) && !crate::cancel::is_save_requested_on(flag))
    }
}

fn score_single_deck(
    counts: &BTreeMap<String, u8>,
    deck_number: u32,
    ctx: &ScoreContext<'_, impl FnMut(HandProgress) -> ControlFlow<()> + Send>,
    best_score: f64,
    on_progress: &Mutex<impl FnMut(OptimizeProgress) -> ControlFlow<()> + Send>,
    control: Option<&ParallelDeckControl>,
) -> Result<DeckEvalResult> {
    if should_abort_deck(control, deck_number) {
        return Err(EngineError::Cancelled);
    }
    let samples = ctx.request.samples;
    let request = DeckEvalRequest {
        deck: counts.clone(),
        samples,
        go_first: ctx.request.go_first,
        max_turns: ctx.request.max_turns,
        seed: ctx.request.seed.wrapping_add(u64::from(deck_number) * 131),
        sim_type: ctx.request.sim_type,
        rollouts: ctx.request.rollouts,
        budget: ctx.request.budget,
        materials: ctx.request.materials.clone(),
        max_threads: ctx.request.max_threads,
        glimpse_enabled: ctx.request.glimpse_enabled,
        max_hand_duration_secs: ctx.request.max_hand_duration_secs,
        max_card_draw: ctx.request.max_card_draw,
    };
    let on_eval_progress = |progress: crate::deck::EvalProgress| {
        let hands_simulated = u64::from(deck_number.saturating_sub(1)) * u64::from(samples)
            + u64::from(progress.sample);
        let flow = on_progress.lock().unwrap_or_else(|err| err.into_inner())(OptimizeProgress {
            decks_scored: deck_number,
            total_decks: ctx.target,
            legal_decks: ctx.legal_decks,
            hands_simulated,
            total_hands: ctx.total_hands,
            best_score,
        });
        if let Some(ctrl) = control {
            ctrl.note_progress(deck_number);
        }
        flow
    };
    let on_eval_hand = |hand| {
        ctx.on_hand_progress
            .lock()
            .unwrap_or_else(|err| err.into_inner())(hand)
    };
    let eval = if control.is_some_and(|ctrl| {
        !ctrl
            .cancel
            .as_ref()
            .is_some_and(|flag| crate::cancel::is_requested(flag) && !crate::cancel::is_save_requested_on(flag))
    }) {
        crate::deck::evaluate_with_hand_progress(&request, on_eval_progress, on_eval_hand)?
    } else {
        match control
            .and_then(|ctrl| ctrl.cancel.clone())
            .or_else(crate::cancel::current_flag)
        {
            Some(flag) if crate::cancel::is_requested(&flag) => {
                crate::deck::evaluate_with_hand_progress_cancel(
                    &request,
                    on_eval_progress,
                    on_eval_hand,
                    flag,
                )?
            }
            _ => crate::deck::evaluate_with_hand_progress(&request, on_eval_progress, on_eval_hand)?,
        }
    };
    if should_abort_deck(control, deck_number) {
        return Err(EngineError::Cancelled);
    }
    Ok(eval)
}

fn score_decks_parallel(
    decks: Vec<BTreeMap<String, u8>>,
    ctx: &ScoreContext<'_, impl FnMut(HandProgress) -> ControlFlow<()> + Send>,
    decks_scored: &mut u32,
    best_score: f64,
    on_progress: &mut (impl FnMut(OptimizeProgress) -> ControlFlow<()> + Send),
) -> Result<Vec<(BTreeMap<String, u8>, DeckEvalResult)>> {
    if decks.is_empty() {
        return Ok(Vec::new());
    }
    if decks.len() == 1 {
        let counts = decks.into_iter().next().expect("one deck");
        let deck_number = decks_scored.saturating_add(1);
        let progress = Mutex::new(on_progress);
        let eval = score_single_deck(&counts, deck_number, ctx, best_score, &progress, None)?;
        *decks_scored = deck_number;
        return Ok(vec![(counts, eval)]);
    }

    let base = *decks_scored;
    let job_cancel = crate::cancel::current_flag();
    let control = ParallelDeckControl::new(job_cancel);
    let next_index = AtomicU32::new(0);
    let outcomes = Mutex::new(Vec::<(u32, BTreeMap<String, u8>, DeckEvalResult)>::new());
    let first_error = Mutex::new(None::<EngineError>);
    let progress = Mutex::new(on_progress);
    let workers = deck_parallelism().min(decks.len());

    std::thread::scope(|scope| {
        for _ in 0..workers {
            scope.spawn(|| {
                loop {
                    let index = next_index.fetch_add(1, Ordering::Relaxed) as usize;
                    if index >= decks.len() {
                        return;
                    }
                    let deck_number = base.saturating_add(index as u32).saturating_add(1);
                    if deck_number >= control.save_cutoff.load(Ordering::Relaxed) {
                        return;
                    }
                    if control.should_stop() && !save_keep_partial() {
                        return;
                    }
                    let counts = decks[index].clone();
                    match score_single_deck(
                        &counts,
                        deck_number,
                        ctx,
                        best_score,
                        &progress,
                        Some(&control),
                    ) {
                        Ok(eval) => {
                            if deck_number >= control.save_cutoff.load(Ordering::Relaxed) {
                                control.stop.store(true, Ordering::Relaxed);
                                return;
                            }
                            let mut outcomes = outcomes.lock().unwrap_or_else(|err| err.into_inner());
                            outcomes.push((deck_number, counts, eval));
                            let kept = outcomes.len() as u32;
                            drop(outcomes);
                            let hands_simulated =
                                u64::from(base.saturating_add(kept)) * u64::from(ctx.request.samples);
                            if progress
                                .lock()
                                .unwrap_or_else(|err| err.into_inner())(OptimizeProgress {
                                    decks_scored: base.saturating_add(kept),
                                    total_decks: ctx.target,
                                    legal_decks: ctx.legal_decks,
                                    hands_simulated,
                                    total_hands: ctx.total_hands,
                                    best_score,
                                })
                                .is_break()
                            {
                                control.stop.store(true, Ordering::Relaxed);
                            }
                        }
                        Err(EngineError::Cancelled) => {
                            control.stop.store(true, Ordering::Relaxed);
                            return;
                        }
                        Err(error) => {
                            *first_error.lock().unwrap_or_else(|err| err.into_inner()) = Some(error);
                            control.stop.store(true, Ordering::Relaxed);
                            return;
                        }
                    }
                }
            });
        }
    });

    if let Some(error) = first_error.lock().unwrap_or_else(|err| err.into_inner()).take() {
        if !matches!(error, EngineError::Cancelled) || !save_keep_partial() {
            return Err(error);
        }
    }

    let cutoff = control.save_cutoff.load(Ordering::Relaxed);
    let mut kept = outcomes
        .lock()
        .unwrap_or_else(|err| err.into_inner())
        .drain(..)
        .filter(|(deck_number, _, _)| *deck_number < cutoff)
        .collect::<Vec<_>>();
    kept.sort_by_key(|(deck_number, _, _)| *deck_number);
    let scored = kept
        .into_iter()
        .map(|(_, counts, eval)| (counts, eval))
        .collect::<Vec<_>>();
    *decks_scored = base.saturating_add(scored.len() as u32);

    if control.should_stop() && !save_keep_partial() && scored.len() < decks.len() {
        return Err(EngineError::Cancelled);
    }

    Ok(scored)
}

fn score_optimize_deck_full(
    counts: &BTreeMap<String, u8>,
    ctx: &ScoreContext<'_, impl FnMut(HandProgress) -> ControlFlow<()> + Send>,
    decks_scored: &mut u32,
    best_score: f64,
    on_progress: &mut (impl FnMut(OptimizeProgress) -> ControlFlow<()> + Send),
) -> Result<DeckEvalResult> {
    let deck_number = decks_scored.saturating_add(1);
    let progress = Mutex::new(on_progress);
    let eval = score_single_deck(counts, deck_number, ctx, best_score, &progress, None)?;
    *decks_scored = deck_number;
    Ok(eval)
}

fn try_score_search_batch(
    counts_list: Vec<BTreeMap<String, u8>>,
    state: &mut OptimizeSearchState,
    ctx: &ScoreContext<'_, impl FnMut(HandProgress) -> ControlFlow<()> + Send>,
    on_progress: &mut (impl FnMut(OptimizeProgress) -> ControlFlow<()> + Send),
) -> Result<()> {
    let mut to_score = Vec::new();
    for counts in counts_list {
        if state.seen.insert(counts_key(&counts)) {
            to_score.push(counts);
        }
    }
    if to_score.is_empty() {
        return Ok(());
    }
    to_score.sort_by(|left, right| counts_key(left).cmp(&counts_key(right)));
    let results = score_decks_parallel(
        to_score,
        ctx,
        &mut state.decks_scored,
        state.best_score,
        on_progress,
    )?;
    for (counts, eval) in results {
        let score = metric_score(&eval, ctx.request.metric);
        state.record(score, counts, eval.card_stats);
        if state.decks_scored >= ctx.target {
            break;
        }
    }
    Ok(())
}

fn optimize_search(
    request: &OptimizeRequest,
    mut on_progress: impl FnMut(OptimizeProgress) -> ControlFlow<()> + Send,
    on_hand_progress: &Mutex<impl FnMut(HandProgress) -> ControlFlow<()> + Send>,
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
        on_hand_progress,
    };

    let search = match request.strategy {
        Strategy::RandomSample => optimize_random_sample(request, &ctx, &mut state, &mut on_progress),
        Strategy::HillClimb => optimize_hill_climb(request, &ctx, &mut state, &mut on_progress),
        Strategy::Genetic => optimize_genetic(request, &ctx, &mut state, &mut on_progress),
        Strategy::SwapSweep => unreachable!(),
        Strategy::MultiDeck => unreachable!(),
    };
    if let Err(EngineError::Cancelled) = &search
        && crate::cancel::is_save_requested()
        && !state.history.is_empty()
    {
        return Ok(optimize_result_from_search(
            request, target, legal_decks, state, started,
        ));
    }
    search?;

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

    Ok(optimize_result_from_search(
        request, target, legal_decks, state, started,
    ))
}

fn optimize_result_from_search(
    request: &OptimizeRequest,
    target: u32,
    legal_decks: u64,
    state: OptimizeSearchState,
    started: Instant,
) -> OptimizeResult {
    OptimizeResult {
        best_counts: state.best,
        best_score: state.best_score,
        top: ranked_decks(&state.top),
        history: state.history,
        legal_decks,
        decks_scored: state.decks_scored,
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        effective: build_effective(request, target),
    }
}

fn optimize_random_sample(
    request: &OptimizeRequest,
    ctx: &ScoreContext<'_, impl FnMut(HandProgress) -> ControlFlow<()> + Send>,
    state: &mut OptimizeSearchState,
    on_progress: &mut (impl FnMut(OptimizeProgress) -> ControlFlow<()> + Send),
) -> Result<()> {
    let mut rng = Rng::new(request.seed);
    let mut attempts = 0_u64;
    let max_draw_attempts = u64::from(ctx.target).saturating_mul(64).max(64);
    let batch_size = deck_parallelism();

    while state.decks_scored < ctx.target && attempts < max_draw_attempts {
        if state.seen.len() as u64 >= ctx.legal_decks {
            break;
        }
        let remaining = ctx.target.saturating_sub(state.decks_scored) as usize;
        let mut batch = Vec::new();
        while batch.len() < batch_size.min(remaining) && attempts < max_draw_attempts {
            attempts += 1;
            let counts = initial_counts(&request.bounds, request.deck_size, &mut rng)?;
            let key = counts_key(&counts);
            if state.seen.contains(&key) {
                continue;
            }
            batch.push(counts);
        }
        if batch.is_empty() {
            continue;
        }
        try_score_search_batch(batch, state, ctx, on_progress)?;
        if save_keep_partial() {
            break;
        }
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
    ctx: &ScoreContext<'_, impl FnMut(HandProgress) -> ControlFlow<()> + Send>,
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
            let remaining = ctx.target.saturating_sub(state.decks_scored) as usize;
            let unscored: Vec<_> = neighbors
                .into_iter()
                .filter(|neighbor| !state.seen.contains(&counts_key(neighbor)))
                .take(remaining)
                .collect();
            if unscored.is_empty() {
                break;
            }
            for neighbor in &unscored {
                state.seen.insert(counts_key(neighbor));
            }
            let results = score_decks_parallel(
                unscored.clone(),
                ctx,
                &mut state.decks_scored,
                state.best_score,
                on_progress,
            )?;
            if save_keep_partial() {
                break;
            }
            let mut by_key = rustc_hash::FxHashMap::default();
            for (counts, eval) in results {
                by_key.insert(counts_key(&counts), (counts, eval));
            }

            let mut best_neighbor: Option<(f64, BTreeMap<String, u8>)> = None;
            for neighbor in unscored {
                let Some((counts, eval)) = by_key.remove(&counts_key(&neighbor)) else {
                    continue;
                };
                let score = metric_score(&eval, request.metric);
                state.record(score, counts.clone(), eval.card_stats);
                if state.decks_scored >= ctx.target {
                    break;
                }
                if score > current_score {
                    match &best_neighbor {
                        Some((best, _)) if score <= *best => {}
                        _ => best_neighbor = Some((score, counts)),
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
    ctx: &ScoreContext<'_, impl FnMut(HandProgress) -> ControlFlow<()> + Send>,
    state: &mut OptimizeSearchState,
    on_progress: &mut (impl FnMut(OptimizeProgress) -> ControlFlow<()> + Send),
) -> Result<()> {
    let mut rng = Rng::new(request.seed.wrapping_add(17));
    let pop_size = ctx.target.clamp(4, POP_SIZE_CAP);
    let batch_size = deck_parallelism();
    let mut population: Vec<(f64, BTreeMap<String, u8>)> = Vec::new();
    let mut seed_attempts = 0_u64;

    while population.len() < pop_size as usize && seed_attempts < u64::from(pop_size) * 64 {
        let remaining = pop_size as usize - population.len();
        let mut batch = Vec::new();
        while batch.len() < batch_size.min(remaining) && seed_attempts < u64::from(pop_size) * 64 {
            seed_attempts += 1;
            let counts = initial_counts(&request.bounds, request.deck_size, &mut rng)?;
            if state.seen.contains(&counts_key(&counts)) {
                continue;
            }
            state.seen.insert(counts_key(&counts));
            batch.push(counts);
        }
        if batch.is_empty() {
            continue;
        }
        batch.sort_by(|left, right| counts_key(left).cmp(&counts_key(right)));
        let results = score_decks_parallel(
            batch,
            ctx,
            &mut state.decks_scored,
            state.best_score,
            on_progress,
        )?;
        for (counts, eval) in results {
            let score = metric_score(&eval, request.metric);
            state.record(score, counts.clone(), eval.card_stats);
            population.push((score, counts));
            if state.decks_scored >= ctx.target {
                break;
            }
        }
        if save_keep_partial() {
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
            let slots = pop_size as usize - next_generation.len();
            let mut children = Vec::new();
            let mut child_attempts = 0_u64;
            let max_child_attempts = u64::from(pop_size).saturating_mul(64);
            while children.len() < batch_size.min(slots) && child_attempts < max_child_attempts {
                child_attempts += 1;
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
                state.seen.insert(counts_key(&child));
                children.push(child);
            }
            if children.is_empty() {
                break;
            }
            children.sort_by(|left, right| counts_key(left).cmp(&counts_key(right)));
            let results = score_decks_parallel(
                children,
                ctx,
                &mut state.decks_scored,
                state.best_score,
                on_progress,
            )?;
            for (child, eval) in results {
                let score = metric_score(&eval, request.metric);
                state.record(score, child.clone(), eval.card_stats);
                next_generation.push((score, child));
                if next_generation.len() >= pop_size as usize || state.decks_scored >= ctx.target {
                    break;
                }
            }
            if save_keep_partial() {
                break;
            }
        }

        if save_keep_partial() {
            break;
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
    on_hand_progress: &Mutex<impl FnMut(HandProgress) -> ControlFlow<()> + Send>,
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
        on_hand_progress,
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
    let mut candidate_decks = Vec::new();
    for candidate in &swap.candidates {
        candidate_decks.push((
            candidate.clone(),
            apply_fixed_swap(&request.base_deck, &swap.from, candidate, swap.count)?,
        ));
    }
    let candidate_results = match score_decks_parallel(
        candidate_decks
            .iter()
            .map(|(_, counts)| counts.clone())
            .collect(),
        &ctx,
        &mut decks_scored,
        best_score,
        &mut on_progress,
    ) {
        Ok(results) => results,
        Err(EngineError::Cancelled) if crate::cancel::is_save_requested() => {
            return Ok(finish_swap_sweep(
                request,
                target,
                legal_decks,
                best,
                best_score,
                rows,
                candidate_rows,
                history,
                decks_scored,
                started,
            ));
        }
        Err(error) => return Err(error),
    };
    let mut by_counts = rustc_hash::FxHashMap::default();
    for (counts, eval) in candidate_results {
        by_counts.insert(counts_key(&counts), (counts, eval));
    }
    for (candidate, counts) in candidate_decks {
        let Some((counts, eval)) = by_counts.remove(&counts_key(&counts)) else {
            continue;
        };
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
            candidate: Some(candidate),
        });
    }

    let _ = on_progress(OptimizeProgress {
        decks_scored,
        total_decks: target,
        legal_decks,
        hands_simulated: u64::from(decks_scored) * u64::from(request.samples),
        total_hands,
        best_score,
    });

    Ok(finish_swap_sweep(
        request,
        target,
        legal_decks,
        best,
        best_score,
        rows,
        candidate_rows,
        history,
        decks_scored,
        started,
    ))
}

fn deck_total(counts: &BTreeMap<String, u8>) -> u32 {
    counts.values().map(|copies| u32::from(*copies)).sum()
}

fn optimize_multi_deck(
    request: &OptimizeRequest,
    mut on_progress: impl FnMut(OptimizeProgress) -> ControlFlow<()> + Send,
    on_hand_progress: &Mutex<impl FnMut(HandProgress) -> ControlFlow<()> + Send>,
) -> Result<OptimizeResult> {
    let started = Instant::now();
    let multi = request
        .multi_deck
        .as_ref()
        .ok_or_else(|| EngineError::invalid("multi deck config is required for multi deck"))?;
    if multi.decks.is_empty() {
        return Err(EngineError::invalid(
            "multi deck requires at least one decklist",
        ));
    }

    let target = multi.decks.len() as u32;
    let total_hands = u64::from(target) * u64::from(request.samples);
    let legal_decks = u64::from(target);

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
        on_hand_progress,
    };

    let mut decks_scored = 0_u32;
    let mut history = Vec::new();
    let mut rows: Vec<RankedDeck> = Vec::with_capacity(multi.decks.len());

    for counts in &multi.decks {
        let total = deck_total(counts);
        if total != u32::from(request.deck_size) {
            return Err(EngineError::invalid(format!(
                "decklist has {total} cards; expected {}",
                request.deck_size
            )));
        }
    }

    let deck_list: Vec<_> = multi.decks.iter().cloned().collect();
    let scored = match score_decks_parallel(
        deck_list.clone(),
        &ctx,
        &mut decks_scored,
        0.0,
        &mut on_progress,
    ) {
        Ok(results) => results,
        Err(EngineError::Cancelled) if crate::cancel::is_save_requested() => {
            return Ok(finish_multi_deck(
                request,
                target,
                legal_decks,
                rows,
                history,
                decks_scored,
                started,
            ));
        }
        Err(error) => return Err(error),
    };
    let mut by_counts = rustc_hash::FxHashMap::default();
    for (counts, eval) in scored {
        by_counts.insert(counts_key(&counts), (counts, eval));
    }
    for counts in deck_list {
        let Some((counts, eval)) = by_counts.remove(&counts_key(&counts)) else {
            continue;
        };
        let score = metric_score(&eval, request.metric);
        history.push(HistoryPoint {
            iteration: decks_scored as u16,
            score,
        });
        rows.push(RankedDeck {
            rank: 0,
            score,
            counts,
            score_delta: None,
            card_stats: eval.card_stats,
            candidate: None,
        });
    }

    let _ = on_progress(OptimizeProgress {
        decks_scored,
        total_decks: target,
        legal_decks,
        hands_simulated: u64::from(decks_scored) * u64::from(request.samples),
        total_hands,
        best_score: rows
            .iter()
            .map(|row| row.score)
            .max_by(f64::total_cmp)
            .unwrap_or(0.0),
    });

    Ok(finish_multi_deck(
        request,
        target,
        legal_decks,
        rows,
        history,
        decks_scored,
        started,
    ))
}

fn finish_multi_deck(
    request: &OptimizeRequest,
    target: u32,
    legal_decks: u64,
    mut rows: Vec<RankedDeck>,
    history: Vec<HistoryPoint>,
    decks_scored: u32,
    started: Instant,
) -> OptimizeResult {
    rows.sort_by(|left, right| {
        right
            .score
            .partial_cmp(&left.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    for (index, row) in rows.iter_mut().enumerate() {
        row.rank = (index + 1) as u8;
    }
    let best = rows
        .first()
        .map(|row| row.counts.clone())
        .unwrap_or_default();
    let best_score = rows.first().map(|row| row.score).unwrap_or(0.0);

    OptimizeResult {
        best_counts: best,
        best_score,
        top: rows,
        history,
        legal_decks,
        decks_scored,
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        effective: build_effective(request, target),
    }
}

#[expect(clippy::too_many_arguments)]
fn finish_swap_sweep(
    request: &OptimizeRequest,
    target: u32,
    legal_decks: u64,
    best: BTreeMap<String, u8>,
    best_score: f64,
    mut rows: Vec<RankedDeck>,
    mut candidate_rows: Vec<RankedDeck>,
    history: Vec<HistoryPoint>,
    decks_scored: u32,
    started: Instant,
) -> OptimizeResult {
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

    OptimizeResult {
        best_counts: best,
        best_score,
        top: rows,
        history,
        legal_decks,
        decks_scored,
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        effective: build_effective(request, target),
    }
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
            multi_deck: None,
            go_first: true,
            max_turns: 3,
            sim_type: crate::model::SimType::FireBrick,
            rollouts: 1,
            max_threads: None,
            glimpse_enabled: None,
            max_hand_duration_secs: None,
            max_card_draw: None,
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
            multi_deck: None,
            go_first: true,
            max_turns: 3,
            sim_type: crate::model::SimType::FireBrick,
            rollouts: 1,
            max_threads: None,
            glimpse_enabled: None,
            max_hand_duration_secs: None,
            max_card_draw: None,
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
        let sable = candidate
            .card_stats
            .iter()
            .find(|stat| stat.card == "sable_remnant")
            .expect("candidate card stats");
        assert_eq!(
            sable.with_hand_samples + sable.without_hand_samples,
            2,
            "each candidate sample should land in a with/without opening-hand bucket"
        );
        let baseline = result
            .top
            .iter()
            .find(|row| row.rank == 0)
            .expect("baseline row");
        assert!(baseline.card_stats.len() >= 3);
    }

    #[test]
    fn optimize_save_discards_the_in_progress_deck() {
        let flag = crate::cancel::new_flag();
        let request = OptimizeRequest {
            bounds: sample_bounds(),
            deck_size: 7,
            samples: 4,
            decks: 4,
            metric: Metric::Mean,
            seed: 3,
            budget: Budget::default(),
            materials: BTreeMap::new(),
            strategy: Strategy::RandomSample,
            base_deck: BTreeMap::new(),
            swap: None,
            multi_deck: None,
            go_first: true,
            max_turns: 2,
            sim_type: crate::model::SimType::FireBrick,
            rollouts: 1,
            max_threads: None,
            glimpse_enabled: None,
            max_hand_duration_secs: None,
            max_card_draw: None,
        };
        let _guard = crate::cancel::install(flag.clone());
        let result = optimize_with_progress(&request, |progress| {
            if progress.decks_scored >= 2 {
                crate::cancel::request_save(&flag);
            }
            ControlFlow::Continue(())
        })
        .expect("save should keep finished lists");
        assert_eq!(result.decks_scored, 1);
        assert_eq!(result.history.len(), 1);
        assert_eq!(result.top.len(), 1);
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
            multi_deck: None,
            go_first: true,
            max_turns: 3,
            sim_type: crate::model::SimType::FireBrick,
            rollouts: 1,
            max_threads: None,
            glimpse_enabled: None,
            max_hand_duration_secs: None,
            max_card_draw: None,
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
            multi_deck: None,
            go_first: true,
            max_turns: 3,
            sim_type: crate::model::SimType::FireBrick,
            rollouts: 1,
            max_threads: None,
            glimpse_enabled: None,
            max_hand_duration_secs: None,
            max_card_draw: None,
        };
        let one = optimize(&request).unwrap();
        let two = optimize(&request).unwrap();
        assert_eq!(one.best_score, two.best_score);
    }
}
