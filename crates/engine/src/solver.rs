use crate::{
    cards::{ALL_CARDS, Card, parse_card},
    line_event::{
        ActionOp, AttackBonuses, EventFields, EventKind, EventTape, LineEvent, TapePhase,
    },
    model::{
        Action, DRAW_QUEUE_CAP, DamageDistribution, EffectiveRequest, MAT_BLADE, MAT_DAGGER,
        MAT_HAMMER, MAT_SOULKNIFE, MAT_ZANDER, McRollout, PassResult, Phase, SimType, SolveRequest,
        SolveResult, State, TwoPassResult, Weapon,
    },
    version::ENGINE_VERSION,
};
use rustc_hash::FxHashMap;
use std::collections::BTreeMap;
use std::ops::ControlFlow;
use std::time::Instant;

/// Best line score: maximize damage, then final hand+memory (influence).
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct Outcome {
    damage: u8,
    influence: u8,
}

impl Outcome {
    #[inline]
    fn better(self, other: Self) -> bool {
        self.damage > other.damage
            || (self.damage == other.damage && self.influence > other.influence)
    }
}

/// Memoized gain from a board (damage zeroed) plus terminal influence of the best line.
#[derive(Clone, Copy)]
struct MemoValue {
    damage_gain: u8,
    end_influence: u8,
}

struct Search {
    memo: FxHashMap<State, MemoValue>,
    nodes: u64,
    queue_tail: ([u8; DRAW_QUEUE_CAP], u8),
}

impl Search {
    fn new(initial: State) -> Self {
        Self {
            memo: FxHashMap::with_capacity_and_hasher(16_384, Default::default()),
            nodes: 0,
            queue_tail: (initial.queue, initial.queue_len),
        }
    }

    fn visit(&mut self, state: State) -> Outcome {
        debug_assert!(
            state.queue == self.queue_tail.0 && state.queue_len == self.queue_tail.1,
            "draw queue mutated during search"
        );
        self.nodes += 1;
        if state.is_terminal() {
            return Outcome {
                damage: state.damage,
                influence: state.influence(),
            };
        }
        let mut board = state;
        board.damage = 0;
        if let Some(&memo) = self.memo.get(&board) {
            return Outcome {
                damage: state.damage.saturating_add(memo.damage_gain),
                influence: memo.end_influence,
            };
        }

        let mut best = Outcome {
            damage: state.damage,
            influence: 0,
        };
        for action in actions(state) {
            let (next, _) = apply(state, action);
            let outcome = self.visit(next);
            if outcome.better(best) {
                best = outcome;
            }
        }
        debug_assert!(best.damage >= state.damage);
        debug_assert!(best.damage < u8::MAX);
        self.memo.insert(
            board,
            MemoValue {
                damage_gain: best.damage - state.damage,
                end_influence: best.influence,
            },
        );
        best
    }

    fn reconstruct(
        &mut self,
        state: State,
        target: Outcome,
        tape: &mut EventTape,
        stats: &mut crate::stats::LineCardStats,
    ) {
        if state.is_terminal() {
            return;
        }
        for action in actions(state) {
            let saved = tape.checkpoint();
            let next = apply_into(state, action, tape);
            if self.visit(next) == target {
                let burst = &tape.events[saved.events_len..];
                stats.record_action(action, state, next, burst);
                self.reconstruct(next, target, tape, stats);
                return;
            }
            tape.restore(saved);
        }
    }
}

#[derive(Clone, Copy)]
struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9e3779b97f4a7c15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xbf58476d1ce4e5b9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94d049bb133111eb);
        z ^ (z >> 31)
    }

    fn index(&mut self, len: usize) -> usize {
        (self.next() as usize) % len.max(1)
    }
}

fn shuffle_cards(values: &mut [Card], rng: &mut Rng) {
    for index in (1..values.len()).rev() {
        values.swap(index, rng.index(index + 1));
    }
}

pub fn solve(request: &SolveRequest) -> Result<SolveResult, String> {
    solve_with_progress(request, |_, _| ControlFlow::Continue(()))
}

/// Like [`solve`], but reports Monte Carlo rollout progress as `(done, total)`.
pub fn solve_with_progress(
    request: &SolveRequest,
    on_rollout: impl FnMut(u16, u16) -> ControlFlow<()>,
) -> Result<SolveResult, String> {
    if request.hand.len() < 2 || request.hand.len() > 16 {
        return Err("hand must contain 2–16 cards".to_string());
    }
    let hand = request
        .hand
        .iter()
        .map(|card| parse_card(card).ok_or_else(|| format!("unknown card: {card}")))
        .collect::<Result<Vec<_>, _>>()?;
    let max_turns = request
        .max_turns
        .clamp(request.budget.max_turns_min, request.budget.max_turns_max);
    let rollouts = request.rollouts.clamp(1, request.budget.max_solve_rollouts);
    let mut result = match request.sim_type {
        SimType::FireBrick => solve_cards(&hand, request.go_first, max_turns),
        SimType::MonteCarlo => {
            let remaining = remaining_for_solve(request, &hand)?;
            solve_monte_carlo(
                &hand,
                &remaining,
                request.go_first,
                max_turns,
                rollouts,
                request.seed,
                on_rollout,
            )?
        }
        SimType::TwoPass => {
            let (remaining, ordered) = remaining_queue(request, &hand)?;
            solve_two_pass(
                &hand,
                &remaining,
                request.go_first,
                max_turns,
                request.seed,
                ordered,
            )
        }
        SimType::OracleOnly => {
            let (remaining, ordered) = remaining_queue(request, &hand)?;
            solve_oracle_only(
                &hand,
                &remaining,
                request.go_first,
                max_turns,
                request.seed,
                ordered,
            )
        }
    };
    result.effective = solve_effective(request, max_turns, rollouts);
    Ok(result)
}

fn solve_effective(request: &SolveRequest, max_turns: u8, rollouts: u16) -> EffectiveRequest {
    EffectiveRequest {
        engine_version: ENGINE_VERSION,
        root_seed: request.seed,
        sim_type: Some(request.sim_type),
        deck: request.deck.clone(),
        go_first: Some(request.go_first),
        max_turns: Some(max_turns),
        rollouts: Some(rollouts),
        samples: None,
        metric: None,
        bounds: BTreeMap::new(),
        deck_size: None,
        decks: None,
        budget: request.budget,
    }
}

fn hand_solve_effective(
    go_first: bool,
    max_turns: u8,
    sim_type: SimType,
    budget: crate::budget::Budget,
) -> EffectiveRequest {
    EffectiveRequest {
        engine_version: ENGINE_VERSION,
        root_seed: 0,
        sim_type: Some(sim_type),
        deck: BTreeMap::new(),
        go_first: Some(go_first),
        max_turns: Some(max_turns),
        rollouts: None,
        samples: None,
        metric: None,
        bounds: BTreeMap::new(),
        deck_size: None,
        decks: None,
        budget,
    }
}

pub fn solve_cards(hand: &[Card], go_first: bool, max_turns: u8) -> SolveResult {
    let started = Instant::now();
    let (pass, line_stats) = solve_pass(hand, go_first, max_turns, &[]);
    SolveResult {
        sim_type: SimType::FireBrick,
        max_damage: pass.max_damage,
        end_influence: pass.end_influence,
        events: pass.events,
        nodes: pass.nodes,
        memo_entries: pass.memo_entries,
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        distribution: None,
        two_pass: None,
        card_stats: summarize_line_stats(hand, &line_stats),
        line_card_stats: line_stats.to_sparse(),
        line_stats,
        brick_line_stats: None,
        effective: hand_solve_effective(
            go_first,
            max_turns,
            SimType::FireBrick,
            crate::budget::Budget::default(),
        ),
    }
}

pub fn solve_pass(
    hand: &[Card],
    go_first: bool,
    max_turns: u8,
    queue: &[Card],
) -> (PassResult, crate::stats::LineCardStats) {
    let initial = State::with_queue(hand, go_first, max_turns, queue);
    let mut search = Search::new(initial);
    let best = search.visit(initial);
    let mut tape = EventTape::new();
    tape.push_start(initial);
    let mut line_stats = crate::stats::LineCardStats::default();
    search.reconstruct(initial, best, &mut tape, &mut line_stats);
    (
        PassResult {
            max_damage: best.damage,
            end_influence: best.influence,
            events: tape.events,
            nodes: search.nodes,
            memo_entries: search.memo.len(),
            card_stats: Vec::new(),
        },
        line_stats,
    )
}

fn summarize_line_stats(
    opening: &[Card],
    line: &crate::stats::LineCardStats,
) -> Vec<crate::stats::CardStat> {
    let mut acc = crate::stats::DeckStatAccumulator::with_deck(opening);
    acc.add_sample(opening, line);
    acc.finish()
}

fn solve_monte_carlo(
    hand: &[Card],
    remaining: &[Card],
    go_first: bool,
    max_turns: u8,
    rollouts: u16,
    seed: u64,
    mut on_rollout: impl FnMut(u16, u16) -> ControlFlow<()>,
) -> Result<SolveResult, String> {
    let started = Instant::now();
    let mut rng = Rng(seed);
    let mut damages = Vec::with_capacity(rollouts as usize);
    let mut samples = Vec::with_capacity(rollouts as usize);
    let mut sample_influences = Vec::with_capacity(rollouts as usize);
    let mut rollout_stats = Vec::with_capacity(rollouts as usize);
    let mut total_nodes = 0;
    let mut total_memo = 0;
    let mut stats_acc = crate::stats::DeckStatAccumulator::with_deck(hand);

    if on_rollout(0, rollouts).is_break() {
        return Err("cancelled".into());
    }

    for done in 1..=rollouts {
        let mut queue = remaining.to_vec();
        shuffle_cards(&mut queue, &mut rng);
        let (pass, line_stats) = solve_pass(hand, go_first, max_turns, &queue);
        total_nodes += pass.nodes;
        total_memo += pass.memo_entries;
        damages.push(pass.max_damage);
        sample_influences.push(pass.end_influence);
        samples.push(McRollout {
            damage: pass.max_damage,
            events: pass.events,
            nodes: pass.nodes,
        });
        stats_acc.add_sample(hand, &line_stats);
        rollout_stats.push(line_stats);
        if on_rollout(done, rollouts).is_break() {
            return Err("cancelled".into());
        }
    }

    let mut sorted = damages.clone();
    sorted.sort_unstable();
    let mean =
        damages.iter().map(|&value| f64::from(value)).sum::<f64>() / damages.len().max(1) as f64;
    let p50 = percentile(&sorted, 50);
    let median_index = samples
        .iter()
        .position(|sample| sample.damage == p50)
        .unwrap_or(0);
    let headline = samples[median_index].clone();
    let headline_influence = sample_influences.get(median_index).copied().unwrap_or(0);
    let headline_stats = rollout_stats.get(median_index).cloned().unwrap_or_default();

    Ok(SolveResult {
        sim_type: SimType::MonteCarlo,
        max_damage: headline.damage,
        end_influence: headline_influence,
        events: headline.events.clone(),
        nodes: total_nodes,
        memo_entries: total_memo,
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        distribution: Some(DamageDistribution {
            damages,
            mean,
            p10: percentile(&sorted, 10),
            p50,
            p90: percentile(&sorted, 90),
            min: sorted.first().copied().unwrap_or(0),
            max: sorted.last().copied().unwrap_or(0),
            rollouts: samples,
        }),
        two_pass: None,
        card_stats: stats_acc.finish(),
        line_card_stats: headline_stats.to_sparse(),
        line_stats: headline_stats,
        brick_line_stats: None,
        effective: hand_solve_effective(
            go_first,
            max_turns,
            SimType::MonteCarlo,
            crate::budget::Budget::default(),
        ),
    })
}

fn oracle_queue(remaining: &[Card], seed: u64, ordered: bool) -> Vec<Card> {
    if ordered {
        return remaining.to_vec();
    }
    let mut queue = remaining.to_vec();
    let mut rng = Rng(seed);
    shuffle_cards(&mut queue, &mut rng);
    queue
}

fn remaining_for_solve(request: &SolveRequest, hand: &[Card]) -> Result<Vec<Card>, String> {
    Ok(remaining_queue(request, hand)?.0)
}

fn remaining_queue(request: &SolveRequest, hand: &[Card]) -> Result<(Vec<Card>, bool), String> {
    if let Some(ids) = &request.queue {
        let cards = ids
            .iter()
            .map(|id| parse_card(id).ok_or_else(|| format!("unknown card in queue: {id}")))
            .collect::<Result<Vec<_>, _>>()?;
        return Ok((cards, true));
    }
    Ok((remaining_deck(&request.deck, hand)?, false))
}

fn solve_two_pass(
    hand: &[Card],
    remaining: &[Card],
    go_first: bool,
    max_turns: u8,
    seed: u64,
    ordered: bool,
) -> SolveResult {
    let started = Instant::now();
    let (mut brick, brick_stats) = solve_pass(hand, go_first, max_turns, &[]);
    let queue = oracle_queue(remaining, seed, ordered);
    let (mut oracle, oracle_stats) = solve_pass(hand, go_first, max_turns, &queue);
    brick.card_stats = summarize_line_stats(hand, &brick_stats);
    oracle.card_stats = summarize_line_stats(hand, &oracle_stats);
    let mut combined = crate::stats::DeckStatAccumulator::with_deck(hand);
    combined.add_sample(hand, &brick_stats);
    combined.add_sample(hand, &oracle_stats);

    SolveResult {
        sim_type: SimType::TwoPass,
        max_damage: brick.max_damage,
        end_influence: brick.end_influence,
        events: brick.events.clone(),
        nodes: brick.nodes + oracle.nodes,
        memo_entries: brick.memo_entries + oracle.memo_entries,
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        distribution: None,
        two_pass: Some(TwoPassResult { brick, oracle }),
        card_stats: combined.finish(),
        line_card_stats: oracle_stats.to_sparse(),
        line_stats: oracle_stats,
        brick_line_stats: Some(brick_stats),
        effective: hand_solve_effective(
            go_first,
            max_turns,
            SimType::TwoPass,
            crate::budget::Budget::default(),
        ),
    }
}

fn solve_oracle_only(
    hand: &[Card],
    remaining: &[Card],
    go_first: bool,
    max_turns: u8,
    seed: u64,
    ordered: bool,
) -> SolveResult {
    let started = Instant::now();
    let queue = oracle_queue(remaining, seed, ordered);
    let (pass, line_stats) = solve_pass(hand, go_first, max_turns, &queue);
    SolveResult {
        sim_type: SimType::OracleOnly,
        max_damage: pass.max_damage,
        end_influence: pass.end_influence,
        events: pass.events,
        nodes: pass.nodes,
        memo_entries: pass.memo_entries,
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
        distribution: None,
        two_pass: None,
        card_stats: summarize_line_stats(hand, &line_stats),
        line_card_stats: line_stats.to_sparse(),
        line_stats,
        brick_line_stats: None,
        effective: hand_solve_effective(
            go_first,
            max_turns,
            SimType::OracleOnly,
            crate::budget::Budget::default(),
        ),
    }
}

fn remaining_deck(deck: &BTreeMap<String, u8>, hand: &[Card]) -> Result<Vec<Card>, String> {
    if deck.is_empty() {
        return Err(
            "Monte Carlo, Two-pass, and Oracle need a maindeck so unknown draws can be sampled"
                .into(),
        );
    }
    let mut counts = BTreeMap::new();
    for (id, &count) in deck {
        let card = parse_card(id).ok_or_else(|| format!("unknown card in deck: {id}"))?;
        *counts.entry(card).or_insert(0_u8) += count;
    }

    // Prefer treating `deck` as a full maindeck and removing the opening hand.
    // If the hand is not a subset (common in the hand solver when improvising),
    // treat the provided counts as the remaining library as-is.
    let mut after_hand = counts.clone();
    let mut hand_fits = true;
    for &card in hand {
        match after_hand.get_mut(&card) {
            Some(entry) if *entry > 0 => *entry -= 1,
            _ => {
                hand_fits = false;
                break;
            }
        }
    }
    let final_counts = if hand_fits { after_hand } else { counts };

    let mut remaining = Vec::new();
    for (card, count) in final_counts {
        remaining.extend(std::iter::repeat_n(card, count as usize));
    }
    if remaining.is_empty() {
        return Err("no cards remain in the deck after removing the opening hand".into());
    }
    Ok(remaining)
}

fn percentile(sorted: &[u8], percentile: usize) -> u8 {
    if sorted.is_empty() {
        return 0;
    }
    let index = ((percentile * sorted.len()) / 100).min(sorted.len() - 1);
    sorted[index]
}

fn push_fast_plays(state: State, result: &mut Vec<Action>) {
    for card in ALL_CARDS {
        if !card.is_fast() || !state.has(card) {
            continue;
        }
        let reserve = card.cost();
        if state.hand_len.saturating_sub(1) < reserve {
            continue;
        }
        if card.is_ally() {
            result.push(Action::PlayAlly {
                card,
                kindle: 0,
                sacrifice: false,
                hot_cake_sacrifice: false,
            });
        } else if card.is_action() {
            result.push(Action::PlayAction {
                card,
                kindle: 0,
                prepared: false,
                imbue: false,
            });
        }
    }
}

fn actions(state: State) -> Vec<Action> {
    if state.phase == Phase::Materialize {
        let mut result = Vec::with_capacity(16);
        if state.turn == 1 {
            if state.has_material(MAT_HAMMER) {
                result.push(Action::MaterializeHammer);
            }
            if state.has_material(MAT_DAGGER) {
                result.push(Action::MaterializeDagger);
            }
        }
        if state.turn >= 1 && state.champion_level == 0 && state.has_material(MAT_ZANDER) {
            for index in 0..state.ally_len {
                result.push(Action::MaterializeZanderFloat(index));
            }
            if state.memory_len > 0 || state.float_gy > 0 {
                result.push(Action::MaterializeZanderMemory);
            }
        }
        // Fast activations before recollect (e.g. Virgil, Demolition).
        push_fast_plays(state, &mut result);
        result.push(Action::SkipMaterialize);
        return result;
    }

    // Safe reduction: activating Poisoned Dagger first always weakly dominates.
    // Amplify sticks for the rest of the turn and buffs every later damage hit.
    if state.dagger && state.dagger_ready {
        return vec![Action::ActivateDagger];
    }

    let mut result = Vec::with_capacity(48);

    for index in 0..state.ally_len as usize {
        if state.allies[index].card() == Card::Sadi && state.hand_len >= 2 {
            result.push(Action::ActivateSadi(index as u8));
        }
    }

    let mut arthur_ready = false;
    for index in 0..state.ally_len as usize {
        if state.allies[index].card() == Card::Arthur && state.can_ally_attack(index) {
            result.push(Action::AttackArthur(index as u8));
            arthur_ready = true;
            break;
        }
    }
    // Safe reduction: never attack other allies while Arthur can still attack.
    // Resting Arthur first always dominates for the +1 rested buff.
    if !arthur_ready
        && (0..state.ally_len as usize)
            .any(|index| state.allies[index].card() != Card::Arthur && state.can_ally_attack(index))
    {
        result.push(Action::AttackOthers);
    }

    for card in ALL_CARDS {
        if !card.is_ally() || !state.has(card) {
            continue;
        }
        let max_kindle = card.kindle().min(state.fire_gy).min(card.cost());
        for kindle in 0..=max_kindle {
            let reserve = card.cost().saturating_sub(kindle);
            if state.hand_len.saturating_sub(1) < reserve {
                continue;
            }
            if card == Card::PepperedChef && state.ally_len > 0 {
                if state.hot_cake > 0 {
                    result.push(Action::PlayAlly {
                        card,
                        kindle,
                        sacrifice: true,
                        hot_cake_sacrifice: true,
                    });
                    result.push(Action::PlayAlly {
                        card,
                        kindle,
                        sacrifice: true,
                        hot_cake_sacrifice: false,
                    });
                } else {
                    result.push(Action::PlayAlly {
                        card,
                        kindle,
                        sacrifice: true,
                        hot_cake_sacrifice: false,
                    });
                }
            }
            if state.hot_cake > 0 {
                result.push(Action::PlayAlly {
                    card,
                    kindle,
                    sacrifice: false,
                    hot_cake_sacrifice: true,
                });
            }
            result.push(Action::PlayAlly {
                card,
                kindle,
                sacrifice: false,
                hot_cake_sacrifice: false,
            });
        }
    }

    for card in ALL_CARDS {
        if !card.is_item() || !state.has(card) {
            continue;
        }
        if state.hand_len.saturating_sub(1) < card.cost() {
            continue;
        }
        result.push(Action::PlayItem { card });
    }

    if state.champion_awake && !(state.go_first && state.turn == 0) {
        for card in [
            Card::IgnitedStab,
            Card::RendingFlames,
            Card::HeatedVengeance,
            Card::ViciousSlice,
        ] {
            if !state.has(card) || state.hand_len.saturating_sub(1) < card.cost() {
                continue;
            }
            let weapon_count = usize::from(state.weapon != Weapon::None) + 1;
            let weapon_options = [true, false];
            let prep_options = card == Card::IgnitedStab && state.prep > 0 && state.is_assassin();
            let double = card == Card::RendingFlames && state.is_assassin() && state.fire_gy >= 2;
            for &weapon in &weapon_options[..weapon_count] {
                if prep_options {
                    result.push(Action::PlayAttack {
                        card,
                        weapon,
                        prepared: true,
                        doubled: false,
                        command_ally: None,
                    });
                }
                result.push(Action::PlayAttack {
                    card,
                    weapon,
                    prepared: false,
                    doubled: double,
                    command_ally: None,
                });
            }
        }
        // Weapon-only champion attack (no attack card required).
        if state.weapon != Weapon::None {
            result.push(Action::AttackWithWeapon);
        }
    }

    // Command Automaton: an Automaton ally performs the attack (champion need not be awake).
    if !(state.go_first && state.turn == 0)
        && state.has(Card::UncannyRealization)
        && state.hand_len.saturating_sub(1) >= Card::UncannyRealization.cost()
    {
        for index in 0..state.ally_len as usize {
            let ally = state.allies[index];
            if !ally.card().is_automaton() || !ally.awake() {
                continue;
            }
            result.push(Action::PlayAttack {
                card: Card::UncannyRealization,
                weapon: false,
                prepared: false,
                doubled: false,
                command_ally: Some(index as u8),
            });
        }
    }

    for card in [
        Card::FieryInterference,
        Card::IntensifiedPyre,
        Card::MarkTheTarget,
        Card::PlantedExplosive,
        Card::VermilionDecree,
        Card::Demolition,
        Card::SurgingBolt,
    ] {
        if !state.has(card) {
            continue;
        }
        let max_kindle = card.kindle().min(state.fire_gy).min(card.cost());
        for kindle in 0..=max_kindle {
            let reserve = card.cost().saturating_sub(kindle);
            if state.hand_len.saturating_sub(1) < reserve {
                continue;
            }
            let can_prepare =
                card.prepare() > 0 && state.prep >= card.prepare() && state.is_assassin();
            let fire_after = if card.is_fire() {
                state.fire_hand_count().saturating_sub(1)
            } else {
                state.fire_hand_count()
            };
            let can_fire_imbue =
                card.imbue() > 0 && reserve >= card.imbue() && fire_after >= reserve;
            // Fire-only is an alternate when Norms are around; otherwise normal reserve is enough.
            let offer_fire_only = can_fire_imbue && state.non_fire_hand_count() > 0;

            let mut push_action = |prepared: bool, imbue: bool| {
                result.push(Action::PlayAction {
                    card,
                    kindle,
                    prepared,
                    imbue,
                });
            };

            if can_prepare {
                if offer_fire_only {
                    push_action(true, true);
                }
                push_action(true, false);
            }
            if offer_fire_only {
                push_action(false, true);
            }
            push_action(false, false);
        }
    }

    if state.has(Card::BlazingThrow)
        && state.weapon != Weapon::None
        && state.hand_len >= 2
        && !(state.go_first && state.turn == 0)
    {
        result.push(Action::BlazingThrow);
    }
    if state.is_assassin() && state.prep > 0 && state.has_material(MAT_BLADE) {
        result.push(Action::MercenaryBlade);
    }
    if state.is_assassin()
        && state.has_material(MAT_SOULKNIFE)
        && state.fire_gy >= 3
        && state.weapon == Weapon::None
    {
        result.push(Action::MaterializeSoulknife);
    }
    result.push(Action::Pass);
    result
}

fn tape_phase(state: &State) -> TapePhase {
    if state.phase == Phase::Materialize {
        TapePhase::Materialize
    } else {
        TapePhase::Main
    }
}

fn apply(state: State, action: Action) -> (State, Vec<LineEvent>) {
    let mut tape = EventTape::new();
    let next = apply_into(state, action, &mut tape);
    (next, tape.events)
}

fn apply_into(mut state: State, action: Action, tape: &mut EventTape) -> State {
    tape.begin_action(ActionOp::from_action(action));
    match action {
        Action::Pass => advance_after_pass(&mut state, tape),
        Action::SkipMaterialize => finish_materialization(&mut state, tape),
        Action::MaterializeHammer => {
            state.remove_material(MAT_HAMMER);
            state.weapon = Weapon::ImpactHammer;
            state.weapon_durability = state.weapon.durability();
            tape.push(
                state,
                TapePhase::Materialize,
                EventKind::MaterializeHammer,
                EventFields::default(),
            );
            finish_materialization(&mut state, tape);
        }
        Action::MaterializeDagger => {
            state.remove_material(MAT_DAGGER);
            state.dagger = true;
            state.dagger_ready = false;
            tape.push(
                state,
                TapePhase::Materialize,
                EventKind::MaterializeDagger,
                EventFields::default(),
            );
            finish_materialization(&mut state, tape);
        }
        Action::MaterializeZanderMemory => {
            state.remove_material(MAT_ZANDER);
            if state.float_gy > 0 {
                state.float_gy -= 1;
                state.gy_total = state.gy_total.saturating_sub(1);
                tape.push(
                    state,
                    TapePhase::Materialize,
                    EventKind::FloatForZander,
                    EventFields::default(),
                );
            } else {
                for card in ALL_CARDS.into_iter().rev() {
                    if state.memory[card.index()] > 0 {
                        state.memory[card.index()] -= 1;
                        state.memory_len -= 1;
                        state.send_to_gy(card);
                        tape.push(
                            state,
                            TapePhase::Materialize,
                            EventKind::FloatForZander,
                            EventFields::default().from_memory(),
                        );
                        break;
                    }
                }
            }
            level_zander(&mut state, tape);
            finish_materialization(&mut state, tape);
        }
        Action::MaterializeZanderFloat(index) => {
            state.remove_material(MAT_ZANDER);
            let card = state.allies[index as usize].card();
            state.remove_ally(index as usize, false);
            tape.push(
                state,
                TapePhase::Materialize,
                EventKind::FloatForZander,
                EventFields::card(card),
            );
            level_zander(&mut state, tape);
            finish_materialization(&mut state, tape);
        }
        Action::MaterializeSoulknife => {
            state.remove_material(MAT_SOULKNIFE);
            state.banish_fire_from_gy(3, false);
            state.weapon = Weapon::VaruckanSoulknife;
            state.weapon_durability = state.weapon.durability();
            tape.push(
                state,
                TapePhase::Main,
                EventKind::MaterializeSoulknife,
                EventFields::default(),
            );
        }
        Action::ActivateDagger => {
            state.dagger = false;
            state.dagger_ready = false;
            state.add_damage(1);
            state.amplify = state.is_assassin();
            tape.push(
                state,
                TapePhase::Main,
                EventKind::ActivateDagger,
                EventFields::default(),
            );
        }
        Action::ActivateSadi(index) => {
            if state.pay_reserve(2) {
                state.remove_ally(index as usize, false);
                state.add_hand(Card::Sadi);
                state.prep = state.prep.saturating_add(1);
                tape.push(
                    state,
                    TapePhase::Main,
                    EventKind::SadiBounce,
                    EventFields::default(),
                );
            }
        }
        Action::AttackArthur(index) => attack_ally(&mut state, index as usize, tape),
        Action::AttackOthers => {
            let mut index = 0;
            while index < state.ally_len as usize {
                if state.allies[index].card() != Card::Arthur && state.can_ally_attack(index) {
                    attack_ally(&mut state, index, tape);
                }
                index += 1;
            }
        }
        Action::PlayAlly {
            card,
            kindle,
            sacrifice,
            hot_cake_sacrifice,
        } => play_ally(
            &mut state,
            card,
            kindle,
            sacrifice,
            hot_cake_sacrifice,
            tape,
        ),
        Action::PlayItem { card } => play_item(&mut state, card, tape),
        Action::PlayAttack {
            card,
            weapon,
            prepared,
            doubled,
            command_ally,
        } => play_attack(
            &mut state,
            card,
            weapon,
            prepared,
            doubled,
            command_ally,
            tape,
        ),
        Action::PlayAction {
            card,
            kindle,
            prepared,
            imbue,
        } => play_action(&mut state, card, kindle, prepared, imbue, tape),
        Action::BlazingThrow => {
            state.remove_hand(Card::BlazingThrow);
            state.pay_reserve(1);
            let weapon = state.weapon;
            state.weapon = Weapon::None;
            state.weapon_durability = 0;
            state.send_to_gy(Card::BlazingThrow);
            state.add_damage(4);
            tape.push(
                state,
                TapePhase::Main,
                EventKind::Play,
                EventFields::card(Card::BlazingThrow).with_weapon(weapon),
            );
        }
        Action::MercenaryBlade => {
            state.remove_material(MAT_BLADE);
            state.prep -= 1;
            state.weapon = Weapon::MercenaryBlade;
            state.weapon_durability = state.weapon.durability();
            tape.push(
                state,
                TapePhase::Main,
                EventKind::MaterializeBlade,
                EventFields::default(),
            );
        }
        Action::AttackWithWeapon => attack_with_weapon(&mut state, tape),
    }
    state
}

fn attack_with_weapon(state: &mut State, tape: &mut EventTape) {
    if state.weapon == Weapon::None || !state.champion_awake {
        return;
    }
    let weapon = state.weapon;
    let power = weapon.power();
    tape.push(
        *state,
        TapePhase::Main,
        EventKind::WieldForAttack,
        EventFields::default().with_weapon(weapon),
    );
    state.consume_weapon();
    state.champion_awake = false;
    state.add_damage(power);
    tape.push(
        *state,
        TapePhase::Main,
        EventKind::WeaponAttack,
        EventFields::default().with_weapon(weapon),
    );
    apply_weapon_wield_self_damage(state, weapon, tape);
}

fn apply_weapon_wield_self_damage(state: &mut State, weapon: Weapon, tape: &mut EventTape) {
    if weapon == Weapon::ImpactHammer {
        state.champion_damaged = true;
        tape.push(
            *state,
            TapePhase::Main,
            EventKind::HammerSelf,
            EventFields::default(),
        );
    }
}

fn play_ally(
    state: &mut State,
    card: Card,
    kindle: u8,
    sacrifice: bool,
    hot_cake_sacrifice: bool,
    tape: &mut EventTape,
) {
    state.remove_hand(card);
    state.pay_with_kindle(card.cost(), kindle);
    let arthur = card == Card::Arthur;
    let immortal = arthur;
    let phase = tape_phase(state);
    let mut sacrificed = false;
    if sacrifice && card == Card::PepperedChef {
        if let Some(index) = (0..state.ally_len as usize).rev().find(|&index| {
            let victim = state.allies[index].card();
            victim != Card::Arthur
        }) {
            if let Some(victim) = state.remove_ally(index, true) {
                sacrificed = true;
                if victim.on_death_damage() > 0 {
                    tape.push(*state, phase, EventKind::OnDeath, EventFields::card(victim));
                }
                tape.push(*state, phase, EventKind::Sacrifice, EventFields::default());
            }
        }
    }
    // Unique: playing a second copy kills the one already on the board.
    if card.is_unique() {
        if let Some(index) =
            (0..state.ally_len as usize).find(|&index| state.allies[index].card() == card)
        {
            if let Some(victim) = state.remove_ally(index, true) {
                if victim.on_death_damage() > 0 {
                    tape.push(*state, phase, EventKind::OnDeath, EventFields::card(victim));
                }
                tape.push(
                    *state,
                    phase,
                    EventKind::UniqueDies,
                    EventFields::card(victim),
                );
            }
        }
    }
    state.add_ally(card, !arthur, immortal);
    let mut fields = EventFields::card(card).with_kindle(kindle);
    if card.is_fast() && state.phase == Phase::Materialize {
        fields = fields.fast();
    }
    tape.push(*state, phase, EventKind::Play, fields);
    if arthur {
        tape.push(
            *state,
            phase,
            EventKind::Immortalize,
            EventFields::default(),
        );
    } else if card == Card::ClumsyApprentice {
        let drawn = state.draw_unknown();
        tape.push(
            *state,
            phase,
            EventKind::OnEnterDraw,
            EventFields::default().with_drawn(drawn),
        );
    } else if card == Card::Rococo {
        let influence = state.influence();
        if influence <= 4 {
            state.add_damage(2);
            tape.push(
                *state,
                phase,
                EventKind::OnEnterDamage,
                EventFields::card(Card::Rococo),
            );
        }
    } else if card == Card::PepperedChef && sacrificed {
        state.agility = state.agility.saturating_add(2);
        tape.push(*state, phase, EventKind::ChefBuff, EventFields::default());
    }
    if hot_cake_sacrifice && state.hot_cake > 0 {
        state.hot_cake -= 1;
        state.send_to_gy(Card::HotCake);
        let index = state.ally_len as usize - 1;
        state.allies[index].set_attack_buff(state.allies[index].attack_buff().saturating_add(3));
        tape.push(
            *state,
            phase,
            EventKind::HotCakeSacrifice,
            EventFields::default(),
        );
    }
}

fn play_item(state: &mut State, card: Card, tape: &mut EventTape) {
    state.remove_hand(card);
    state.pay_reserve(card.cost());
    if card == Card::HotCake {
        state.hot_cake = state.hot_cake.saturating_add(1);
    }
    tape.push(
        *state,
        TapePhase::Main,
        EventKind::Play,
        EventFields::card(card),
    );
}

fn attack_ally(state: &mut State, index: usize, tape: &mut EventTape) {
    let ally = state.allies[index];
    let card = ally.card();
    let arthur_buff = u8::from(card != Card::Arthur && state.arthur_rested());
    let hot_cake_buff = ally.attack_buff();
    if hot_cake_buff > 0 {
        state.allies[index].set_attack_buff(0);
    }
    let mut power = state.ally_power(ally);
    if card == Card::PepperedChef && state.agility > 0 {
        let buff = state.agility.min(2);
        power = power.saturating_add(buff);
        state.agility = state.agility.saturating_sub(buff);
    }
    power = power.saturating_add(hot_cake_buff);
    state.add_damage(power);
    state.allies[index].set_awake(false);
    let bonuses = AttackBonuses {
        arthur: arthur_buff,
        hot_cake: hot_cake_buff,
        unique: 0,
        ally_attack: 0,
    };
    tape.push(
        *state,
        TapePhase::Main,
        EventKind::AllyAttack,
        EventFields::card(card).with_bonuses(bonuses),
    );
    if card == Card::CaptivatingCutthroat && state.is_assassin() {
        state.champion_damaged = true;
        tape.push(
            *state,
            TapePhase::Main,
            EventKind::CutthroatSelf,
            EventFields::default(),
        );
    }
    if matches!(card, Card::HastyMessenger | Card::RedHare) {
        if let Some(discarded) = state.discard_for_effect() {
            let drawn = state.draw_unknown();
            tape.push(
                *state,
                TapePhase::Main,
                EventKind::OnAttackDraw,
                EventFields::default()
                    .with_discarded(discarded)
                    .with_drawn(drawn),
            );
        }
    }
    if card == Card::CorhaziCourier && state.is_assassin() {
        let drawn = state.draw_unknown();
        if let Some(discarded) = state.discard_for_effect() {
            if discarded.is_fire() {
                state.add_damage(1);
            }
            tape.push(
                *state,
                TapePhase::Main,
                EventKind::CorhaziOnHit,
                EventFields::default()
                    .with_drawn(drawn)
                    .with_discarded(discarded),
            );
        }
    }
}

fn play_attack(
    state: &mut State,
    card: Card,
    use_weapon: bool,
    prepared: bool,
    doubled: bool,
    command_ally: Option<u8>,
    tape: &mut EventTape,
) {
    if card.is_command_automaton() {
        let Some(index) = command_ally.map(|i| i as usize) else {
            return;
        };
        if index >= state.ally_len as usize {
            return;
        }
        let ally = state.allies[index];
        if !ally.card().is_automaton() || !ally.awake() {
            return;
        }

        state.remove_hand(card);
        state.pay_reserve(card.cost());
        let ally_attack = ally.card().power();
        let unique_bonus = u8::from(ally.card().is_unique()) * 2;
        let arthur_buff = u8::from(ally.card() != Card::Arthur && state.arthur_rested());
        let hot_cake_buff = ally.attack_buff();
        if hot_cake_buff > 0 {
            state.allies[index].set_attack_buff(0);
        }
        let power = card
            .power()
            .saturating_add(ally_attack)
            .saturating_add(unique_bonus)
            .saturating_add(arthur_buff)
            .saturating_add(hot_cake_buff);
        state.send_to_gy(card);
        state.allies[index].set_awake(false);
        state.add_damage(power);

        let bonuses = AttackBonuses {
            arthur: arthur_buff,
            hot_cake: hot_cake_buff,
            unique: unique_bonus,
            ally_attack,
        };
        tape.push(
            *state,
            TapePhase::Main,
            EventKind::Play,
            EventFields::card(card)
                .with_command_ally(ally.card())
                .with_bonuses(bonuses),
        );
        return;
    }

    state.remove_hand(card);
    state.pay_reserve(card.cost());
    let mut power = card.power();
    if card == Card::IgnitedStab && prepared {
        state.prep -= 1;
        power += 2;
    }
    let heated_bonus = card == Card::HeatedVengeance && state.champion_damaged;
    if heated_bonus {
        power += 3;
    }
    // Champions are Human; Class Bonus +1 always applies while Assassin.
    let human_bonus = card == Card::ViciousSlice && state.is_assassin();
    if human_bonus {
        power += 1;
    }
    let mut wielded = Weapon::None;
    if use_weapon && state.weapon != Weapon::None {
        wielded = state.weapon;
        power += wielded.power();
        tape.push(
            *state,
            TapePhase::Main,
            EventKind::WieldForAttack,
            EventFields::default().with_weapon(wielded),
        );
        state.consume_weapon();
    }
    state.send_to_gy(card);
    state.champion_awake = false;

    let mut fields = EventFields::card(card);
    if card == Card::IgnitedStab {
        fields = fields.with_prepared(prepared);
    }
    if heated_bonus {
        fields = fields.heated();
    }
    if human_bonus {
        fields = fields.human();
    }
    if wielded != Weapon::None {
        fields = fields.with_weapon(wielded);
    }

    if card == Card::RendingFlames && doubled && state.fire_gy >= 3 {
        state.fire_gy -= 3;
        state.gy_total = state.gy_total.saturating_sub(3);
        if state.march_hare_gy > state.fire_gy {
            state.march_hare_gy = state.fire_gy;
        }
        state.add_damage(power * 2);
        tape.push(*state, TapePhase::Main, EventKind::Play, fields.doubled());
    } else {
        state.add_damage(power);
        tape.push(*state, TapePhase::Main, EventKind::Play, fields);
    }
    apply_weapon_wield_self_damage(state, wielded, tape);
}

fn play_action(
    state: &mut State,
    card: Card,
    kindle: u8,
    prepared: bool,
    imbue: bool,
    tape: &mut EventTape,
) {
    state.remove_hand(card);

    let imbued = state.pay_imbue_cost(card.cost(), card.imbue(), kindle, imbue);

    if prepared && card.prepare() > 0 {
        state.prep = state.prep.saturating_sub(card.prepare());
    }
    state.send_to_gy(card);

    let phase = tape_phase(state);
    let mut drawn = None;
    let damage = match card {
        Card::FieryInterference => 2,
        Card::MarkTheTarget => {
            if state.is_assassin() {
                state.prep = state.prep.saturating_add(1);
            }
            1
        }
        Card::PlantedExplosive if prepared => 4,
        Card::PlantedExplosive => 2,
        Card::IntensifiedPyre if state.gy_total >= 8 => 6,
        Card::IntensifiedPyre => 2,
        Card::VermilionDecree if imbued => {
            drawn = Some(state.draw_unknown());
            3
        }
        Card::VermilionDecree => 3,
        Card::Demolition => 3,
        Card::SurgingBolt if imbued => 4,
        Card::SurgingBolt => 3,
        _ => 0,
    };
    state.add_damage(damage);

    let mut fields = EventFields::card(card).with_kindle(kindle);
    if card.prepare() > 0 {
        fields = fields.with_prepared(prepared);
    }
    if imbued {
        fields = fields.with_imbue(true);
    }
    if let Some(drawn) = drawn {
        fields = fields.with_drawn(drawn);
    }
    if card == Card::Demolition && state.phase == Phase::Materialize {
        fields = fields.fast();
    }
    if card == Card::IntensifiedPyre && damage == 6 {
        fields = fields.gy_threshold();
    }

    tape.push(*state, phase, EventKind::Play, fields);
}

fn level_zander(state: &mut State, tape: &mut EventTape) {
    state.champion_level = 1;
    state.prep = state.prep.saturating_add(1);
    tape.push(
        *state,
        TapePhase::Materialize,
        EventKind::LevelZander,
        EventFields::default(),
    );
}

fn finish_materialization(state: &mut State, tape: &mut EventTape) {
    tape.push(
        *state,
        TapePhase::Recollect,
        EventKind::MaterializeResolves,
        EventFields::default(),
    );
    let drawn = state.recollect();
    state.phase = Phase::Main;
    tape.push(
        *state,
        TapePhase::Main,
        EventKind::Recollect,
        EventFields::default().with_drawn(drawn),
    );
}

fn advance_after_pass(state: &mut State, tape: &mut EventTape) {
    tape.push(
        *state,
        TapePhase::Agility,
        EventKind::PassOpportunity,
        EventFields::default(),
    );
    tape.push(
        *state,
        TapePhase::End,
        EventKind::EndAgility,
        EventFields::default(),
    );
    tape.push(
        *state,
        TapePhase::EnemyMain,
        EventKind::EndMain,
        EventFields::default(),
    );
    state.turn += 1;
    state.enemy_cull(Some(tape));
    tape.push(
        *state,
        TapePhase::EnemyEnd,
        EventKind::EnemyMain,
        EventFields::default(),
    );
    tape.push(
        *state,
        TapePhase::Wake,
        EventKind::Wake,
        EventFields::default(),
    );
    state.wake();
    tape.push(
        *state,
        TapePhase::Materialize,
        EventKind::Wake,
        EventFields::default(),
    );
    if !state.is_terminal() {
        state.phase = Phase::Materialize;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::line_event::format_line_event;
    use crate::version::ENGINE_VERSION;

    fn labels(events: &[LineEvent]) -> Vec<String> {
        events.iter().map(format_line_event).collect()
    }

    #[test]
    fn equal_damage_prefers_higher_end_influence() {
        // Playing Hot Cake deals no damage but spends cards to memory; Pass keeps them
        // in hand. Same damage (0), so the line with more hand+memory at the end wins.
        let hand = [Card::HotCake, Card::Brick, Card::Brick, Card::Brick];
        let result = solve_cards(&hand, true, 1);
        assert_eq!(result.max_damage, 0, "{result:#?}");
        assert_eq!(result.end_influence, 4, "{result:#?}");
        assert!(
            !result
                .events
                .iter()
                .any(|step| format_line_event(step).contains("Hot Cake")),
            "should Pass instead of playing Hot Cake: {:?}",
            labels(&result.events)
        );
    }

    #[test]
    fn drill_three_meets_published_twenty() {
        let hand = [
            Card::RendingFlames,
            Card::Arthur,
            Card::HastyMessenger,
            Card::KingdomInformant,
            Card::IgnitedStab,
            Card::SableRemnant,
            Card::ClumsyApprentice,
        ];
        let result = solve_cards(&hand, true, 3);
        assert!(result.max_damage >= 20, "{result:#?}");
        assert_eq!(result.effective.engine_version, ENGINE_VERSION);
        assert_eq!(result.effective.max_turns, Some(3));
        assert_eq!(result.effective.sim_type, Some(SimType::FireBrick));
    }

    #[test]
    fn drill_one_is_twenty_six() {
        let hand = [
            Card::BlazingThrow,
            Card::Arthur,
            Card::RedHare,
            Card::Arthur,
            Card::BlazingThrow,
            Card::KingdomInformant,
            Card::KingdomInformant,
        ];
        let result = solve_cards(&hand, true, 3);
        assert_eq!(result.max_damage, 26, "{result:#?}");
        assert_eq!(result.effective.go_first, Some(true));
    }

    #[test]
    fn new_deck_cards_are_recognized() {
        for name in [
            "sadi_blood_harvester",
            "corhazi_courier",
            "dazzling_courtesan",
            "march_hare_mottled_host",
            "rococo_explosive_maven",
            "vermilion_decree",
            "xiao_qiao_cinderkeeper",
            "planted_explosive",
            "intensified_pyre",
            "hot_cake",
            "uncanny_realization",
            "virgil_altered_future",
            "vicious_slice",
            "manic_zealot",
            "demolition",
            "surging_bolt",
        ] {
            assert!(parse_card(name).is_some(), "{name}");
        }
    }

    #[test]
    fn arthur_buff_attributed_to_arthur() {
        let hand = [
            Card::Arthur,
            Card::ClumsyApprentice,
            Card::KingdomInformant,
            Card::Brick,
            Card::Brick,
            Card::Brick,
            Card::Brick,
        ];
        let result = solve_cards(&hand, false, 2);
        let arthur = result
            .card_stats
            .iter()
            .find(|stat| stat.card == "arthur")
            .expect("arthur stat row");
        assert!(
            arthur.attacks >= 1,
            "Arthur should attack at least once, got {}",
            arthur.attacks
        );
        assert!(
            arthur.damage >= 3,
            "Arthur should get own attack plus rested buff, got {}",
            arthur.damage
        );
        let clumsy = result
            .card_stats
            .iter()
            .find(|stat| stat.card == "clumsy_apprentice")
            .expect("clumsy stat row");
        if clumsy.attacks > 0 {
            assert_eq!(
                clumsy.damage, clumsy.attacks,
                "buffed ally should only get base attack power per attack"
            );
        }
    }

    #[test]
    fn poisoned_dagger_must_activate_before_other_main_actions() {
        let mut state = State::with_queue(&[Card::IgnitedStab], false, 2, &[]);
        state.dagger = true;
        state.dagger_ready = true;
        state.champion_level = 1;
        state.champion_awake = true;

        let legal = actions(state);
        assert_eq!(legal.len(), 1, "{legal:?}");
        assert!(matches!(legal[0], Action::ActivateDagger), "{legal:?}");

        let (after, _) = apply(state, Action::ActivateDagger);
        let legal_after = actions(after);
        assert!(
            !legal_after
                .iter()
                .any(|action| matches!(action, Action::ActivateDagger)),
            "{legal_after:?}"
        );
        assert!(
            legal_after
                .iter()
                .any(|action| matches!(action, Action::PlayAttack { .. } | Action::Pass)),
            "{legal_after:?}"
        );
    }

    #[test]
    fn other_allies_cannot_attack_while_arthur_is_ready() {
        let mut state = State::with_queue(&[], false, 2, &[]);
        state.add_ally(Card::Arthur, true, true);
        state.add_ally(Card::ClumsyApprentice, true, false);

        let legal = actions(state);
        assert!(
            legal
                .iter()
                .any(|action| matches!(action, Action::AttackArthur(_))),
            "{legal:?}"
        );
        assert!(
            !legal
                .iter()
                .any(|action| matches!(action, Action::AttackOthers)),
            "AttackOthers must wait until Arthur has attacked: {legal:?}"
        );

        let (after_arthur, _) = apply(state, Action::AttackArthur(0));
        let legal_after = actions(after_arthur);
        assert!(
            legal_after
                .iter()
                .any(|action| matches!(action, Action::AttackOthers)),
            "{legal_after:?}"
        );
    }

    #[test]
    fn vicious_slice_deals_three_vs_human_while_assassin() {
        let mut state = State::with_queue(&[Card::ViciousSlice, Card::Brick], false, 1, &[]);
        state.champion_level = 1;
        state.champion_awake = true;
        let legal = actions(state);
        let attack = legal
            .iter()
            .copied()
            .find(|action| {
                matches!(
                    action,
                    Action::PlayAttack {
                        card: Card::ViciousSlice,
                        ..
                    }
                )
            })
            .expect("vicious slice play");
        let (after, steps) = apply(state, attack);
        assert_eq!(after.damage, 3, "{steps:?}");
        assert!(
            steps
                .iter()
                .any(|step| format_line_event(step).contains("Vicious Slice (Human)")),
            "{steps:?}"
        );
    }

    #[test]
    fn champion_can_attack_with_weapon_without_attack_card() {
        let mut state = State::with_queue(&[], false, 2, &[]);
        state.champion_level = 1;
        state.champion_awake = true;
        state.prep = 1;
        state.materials = MAT_BLADE;

        assert!(
            actions(state)
                .iter()
                .any(|action| matches!(action, Action::MercenaryBlade)),
            "blade should be materializable"
        );
        let (equipped, _) = apply(state, Action::MercenaryBlade);
        assert_eq!(equipped.weapon, Weapon::MercenaryBlade);
        assert!(
            equipped.champion_awake,
            "materializing the blade must not rest the champion"
        );
        assert!(
            actions(equipped)
                .iter()
                .any(|action| matches!(action, Action::AttackWithWeapon)),
            "awake champion with weapon must be able to swing"
        );

        let (after, steps) = apply(equipped, Action::AttackWithWeapon);
        assert_eq!(after.damage, 1, "{steps:?}");
        assert!(!after.champion_awake);
        assert_eq!(after.weapon, Weapon::None);
        assert!(
            steps
                .iter()
                .any(|step| format_line_event(step) == "Attack with Mercenary's Blade"),
            "{steps:?}"
        );
    }

    #[test]
    fn impact_hammer_self_damage_enables_heated_vengeance() {
        let mut state = State::with_queue(
            &[Card::HeatedVengeance, Card::Brick, Card::Brick, Card::Brick],
            false,
            1,
            &[],
        );
        state.champion_level = 1;
        state.weapon = Weapon::ImpactHammer;
        state.weapon_durability = 2;

        let (after_swing, steps) = apply(state, Action::AttackWithWeapon);
        assert!(after_swing.champion_damaged);
        assert!(
            steps
                .iter()
                .any(|step| format_line_event(step) == "Impact Hammer self 3"),
            "{steps:?}"
        );
        assert_eq!(after_swing.damage, 2, "{steps:?}");

        // Wake for a second attack with Heated Vengeance (same turn damaged flag).
        let mut ready = after_swing;
        ready.champion_awake = true;
        let (after_hv, hv_steps) = apply(
            ready,
            Action::PlayAttack {
                card: Card::HeatedVengeance,
                weapon: false,
                prepared: false,
                doubled: false,
                command_ally: None,
            },
        );
        assert_eq!(after_hv.damage, 2 + 5, "{hv_steps:?}");
        assert!(
            hv_steps
                .iter()
                .any(|step| format_line_event(step) == "Heated Vengeance (+3)"),
            "{hv_steps:?}"
        );
    }

    #[test]
    fn ally_attacks_do_not_rest_champion_for_later_weapon_swing() {
        let mut state = State::with_queue(&[], false, 2, &[]);
        state.champion_level = 1;
        state.champion_awake = true;
        state.weapon = Weapon::MercenaryBlade;
        state.weapon_durability = 1;
        state.add_ally(Card::Arthur, true, true);

        let (after_arthur, _) = apply(state, Action::AttackArthur(0));
        assert!(
            after_arthur.champion_awake,
            "ally attack must leave champion awake"
        );
        assert!(
            actions(after_arthur)
                .iter()
                .any(|action| matches!(action, Action::AttackWithWeapon)),
            "{:?}",
            actions(after_arthur)
        );
    }

    #[test]
    fn demolition_fast_deals_three_during_materialize() {
        let mut state = State::with_queue(
            &[
                Card::Demolition,
                Card::Brick,
                Card::Brick,
                Card::Brick,
                Card::Brick,
            ],
            false,
            1,
            &[],
        );
        state.phase = Phase::Materialize;
        state.turn = 1;

        let legal = actions(state);
        assert!(
            legal.iter().any(|action| matches!(
                action,
                Action::PlayAction {
                    card: Card::Demolition,
                    ..
                }
            )),
            "Demolition should be Fast-playable during materialize: {legal:?}"
        );

        let play = legal
            .iter()
            .copied()
            .find(|action| {
                matches!(
                    action,
                    Action::PlayAction {
                        card: Card::Demolition,
                        ..
                    }
                )
            })
            .expect("demolition play");
        let (after, steps) = apply(state, play);
        assert_eq!(after.phase, Phase::Materialize);
        assert_eq!(after.damage, 3);
        assert!(!after.has(Card::Demolition));
        assert!(
            steps
                .iter()
                .any(|step| format_line_event(step).contains("Fast Activate Demolition")),
            "{steps:?}"
        );
    }

    #[test]
    fn virgil_fast_activates_before_recollect_and_commands_uncanny() {
        let mut state = State::with_queue(
            &[
                Card::Virgil,
                Card::Brick,
                Card::Brick,
                Card::Brick,
                Card::UncannyRealization,
                Card::Brick,
            ],
            false,
            2,
            &[],
        );
        state.phase = Phase::Materialize;
        state.turn = 1;

        let legal = actions(state);
        assert!(
            legal.iter().any(|action| matches!(
                action,
                Action::PlayAlly {
                    card: Card::Virgil,
                    ..
                }
            )),
            "Virgil should be Fast-playable during materialize: {legal:?}"
        );

        let play = legal
            .iter()
            .copied()
            .find(|action| {
                matches!(
                    action,
                    Action::PlayAlly {
                        card: Card::Virgil,
                        ..
                    }
                )
            })
            .expect("virgil play");
        let (after_play, steps) = apply(state, play);
        assert_eq!(after_play.phase, Phase::Materialize);
        assert_eq!(after_play.ally_len, 1);
        assert_eq!(after_play.allies[0].card(), Card::Virgil);
        assert!(
            steps
                .iter()
                .any(|step| format_line_event(step).contains("Fast Activate")),
            "{steps:?}"
        );

        let (after_skip, _) = apply(after_play, Action::SkipMaterialize);
        assert_eq!(after_skip.phase, Phase::Main);
        let legal_main = actions(after_skip);
        assert!(
            legal_main.iter().any(|action| matches!(
                action,
                Action::PlayAttack {
                    card: Card::UncannyRealization,
                    command_ally: Some(0),
                    ..
                }
            )),
            "Virgil should enable Uncanny Realization: {legal_main:?}"
        );
    }

    #[test]
    fn playing_unique_ally_kills_existing_copy() {
        let mut state = State::with_queue(&[Card::Rococo, Card::Brick], false, 1, &[]);
        state.add_ally(Card::Rococo, true, false);
        state.add_ally(Card::ClumsyApprentice, true, false);
        let legal = actions(state);
        let play = legal
            .into_iter()
            .find(|action| {
                matches!(
                    action,
                    Action::PlayAlly {
                        card: Card::Rococo,
                        ..
                    }
                )
            })
            .expect("second Rococo should be playable over the board copy");
        let (after, steps) = apply(state, play);
        assert_eq!(after.ally_len, 2, "{steps:?}");
        assert_eq!(after.allies[0].card(), Card::ClumsyApprentice);
        assert_eq!(after.allies[1].card(), Card::Rococo);
        assert!(
            steps
                .iter()
                .any(|step| format_line_event(step) == "Unique: Rococo, Explosive Maven dies"),
            "{steps:?}"
        );
        assert!(after.fire_gy >= 1, "killed Rococo should go to GY");
    }

    #[test]
    fn uncanny_realization_requires_automaton_and_buffs_unique() {
        let mut no_auto =
            State::with_queue(&[Card::UncannyRealization, Card::Brick], false, 1, &[]);
        no_auto.add_ally(Card::ClumsyApprentice, true, false);
        let legal = actions(no_auto);
        assert!(
            !legal.iter().any(|action| matches!(
                action,
                Action::PlayAttack {
                    card: Card::UncannyRealization,
                    ..
                }
            )),
            "non-Automaton allies cannot Command Uncanny Realization: {legal:?}"
        );

        let mut with_rococo =
            State::with_queue(&[Card::UncannyRealization, Card::Brick], false, 1, &[]);
        with_rococo.add_ally(Card::Rococo, true, false);
        let legal = actions(with_rococo);
        let command = legal
            .iter()
            .find(|action| {
                matches!(
                    action,
                    Action::PlayAttack {
                        card: Card::UncannyRealization,
                        command_ally: Some(0),
                        ..
                    }
                )
            })
            .copied()
            .expect("Rococo should enable Uncanny Realization");
        let (after, steps) = apply(with_rococo, command);
        assert_eq!(
            after.damage, 6,
            "3 Uncanny +1 Rococo attack +2 unique: {steps:?}"
        );
        assert!(!after.allies[0].awake());
        assert!(
            after.champion_awake,
            "Command Automaton should not rest champion"
        );
    }

    #[test]
    fn tweedledum_stealth_only_after_zander_levels() {
        // Later turn, still unleveled: Assassin class bonus is off, so cull kills Tweedledum.
        let mut unleveled = State::with_queue(&[], false, 3, &[]);
        unleveled.turn = 2;
        unleveled.champion_level = 0;
        unleveled.add_ally(Card::Tweedledum, true, false);
        unleveled.add_ally(Card::KingdomInformant, true, false);
        unleveled.enemy_cull(None);
        assert_eq!(unleveled.ally_len, 1);
        assert_eq!(unleveled.allies[0].card(), Card::KingdomInformant);

        // Same later turn after leveling: class stealth applies, Tweedledum survives.
        let mut leveled = State::with_queue(&[], false, 3, &[]);
        leveled.turn = 2;
        leveled.champion_level = 1;
        leveled.add_ally(Card::Tweedledum, true, false);
        leveled.add_ally(Card::ClumsyApprentice, true, false);
        leveled.enemy_cull(None);
        assert_eq!(leveled.ally_len, 1);
        assert_eq!(leveled.allies[0].card(), Card::Tweedledum);
    }

    #[test]
    fn manic_zealot_on_death_deals_two_on_cull() {
        let mut state = State::with_queue(&[], false, 3, &[]);
        state.turn = 1;
        state.add_ally(Card::ManicZealot, true, false);
        state.add_ally(Card::ClumsyApprentice, true, false);
        let mut tape = EventTape::new();
        state.enemy_cull(Some(&mut tape));
        let steps = tape.events;
        assert_eq!(state.ally_len, 0);
        assert_eq!(state.damage, 2);
        assert!(state.champion_damaged);
        assert!(
            steps
                .iter()
                .any(|step| format_line_event(step) == "Manic Zealot On Death"),
            "{steps:?}"
        );
        assert!(Card::ManicZealot.is_automaton());
    }

    #[test]
    fn manic_zealot_on_death_from_peppered_chef_sacrifice() {
        let mut state = State::with_queue(
            &[Card::PepperedChef, Card::Brick, Card::Brick],
            false,
            1,
            &[],
        );
        state.champion_awake = true;
        state.champion_level = 1;
        state.add_ally(Card::ManicZealot, true, false);
        let play = actions(state)
            .into_iter()
            .find(|action| {
                matches!(
                    action,
                    Action::PlayAlly {
                        card: Card::PepperedChef,
                        sacrifice: true,
                        ..
                    }
                )
            })
            .expect("Peppered Chef should be able to sacrifice Manic Zealot");
        let (after, steps) = apply(state, play);
        assert_eq!(after.damage, 2, "{steps:?}");
        assert!(after.champion_damaged, "{steps:?}");
        assert!(
            steps
                .iter()
                .any(|step| format_line_event(step) == "Manic Zealot On Death"),
            "{steps:?}"
        );
        assert_eq!(after.agility, 2);
    }

    #[test]
    fn hot_cake_buffs_next_ally_attack() {
        let hand = [
            Card::HotCake,
            Card::ClumsyApprentice,
            Card::Brick,
            Card::Brick,
            Card::Brick,
            Card::Brick,
            Card::Brick,
        ];
        let result = solve_cards(&hand, false, 1);
        assert!(
            result.max_damage >= 4,
            "Hot Cake + Clumsy should reach at least 4 damage, got {}",
            result.max_damage
        );
        assert_eq!(result.effective.max_turns, Some(1));

        let hot_cake = result
            .card_stats
            .iter()
            .find(|stat| stat.card == "hot_cake")
            .expect("hot_cake stat row");
        assert!(
            hot_cake.damage >= 3,
            "Hot Cake buff damage should attribute to Hot Cake, got {}",
            hot_cake.damage
        );
        let clumsy = result
            .card_stats
            .iter()
            .find(|stat| stat.card == "clumsy_apprentice")
            .expect("clumsy stat row");
        assert_eq!(
            clumsy.damage, 1,
            "attacking ally should only get base attack power"
        );
    }

    #[test]
    fn solver_snapshot_equivalence() {
        let drill_three = [
            Card::RendingFlames,
            Card::Arthur,
            Card::HastyMessenger,
            Card::KingdomInformant,
            Card::IgnitedStab,
            Card::SableRemnant,
            Card::ClumsyApprentice,
        ];
        let drill_one = [
            Card::BlazingThrow,
            Card::Arthur,
            Card::RedHare,
            Card::Arthur,
            Card::BlazingThrow,
            Card::KingdomInformant,
            Card::KingdomInformant,
        ];
        let ally_heavy = [
            Card::Arthur,
            Card::Arthur,
            Card::ClumsyApprentice,
            Card::KingdomInformant,
            Card::KingdomInformant,
            Card::RedHare,
            Card::PepperedChef,
        ];
        let expected_drill_three = [
            "Start of Game",
            "Activate Arthur, Young Heir",
            "Immortalize the King",
            "Main: Pass Opportunity",
            "End of Agility Phase",
            "End of End Phase",
            "Enemy Main Phase",
            "End of Enemy End Phase",
            "Wake Up Phase",
            "Materialize Impact Hammer",
            "Materialization Resolves",
            "Recollect (draw Brick)",
            "Attack from Arthur, Young Heir",
            "Activate Kingdom Informant",
            "Attack from Kingdom Informant (Arthur +1)",
            "Activate Clumsy Apprentice",
            "Clumsy On-Enter draw (Brick)",
            "Attack from Clumsy Apprentice (Arthur +1)",
            "USE IN BELOW ATTACK (Impact Hammer)",
            "Attack with Impact Hammer",
            "Impact Hammer self 3",
            "Main: Pass Opportunity",
            "End of Agility Phase",
            "End of End Phase",
            "Enemy Main Phase",
            "End of Enemy End Phase",
            "Wake Up Phase",
            "Mem Cost for Zander Lvl 1 (Float Kingdom Informant)",
            "Zander Lvl 1 Glimpse/Prep",
            "Materialization Resolves",
            "Recollect (draw Brick)",
            "Activate Sable Remnant",
            "Attack from Sable Remnant",
            "USE IN BELOW ATTACK (Impact Hammer)",
            "Rending Flames (Doubled) with Impact Hammer",
            "Impact Hammer self 3",
            "Materialize Mercenary's Blade (prep)",
            "Main: Pass Opportunity",
            "End of Agility Phase",
            "End of End Phase",
            "Enemy Main Phase",
            "End of Enemy End Phase",
            "Wake Up Phase",
        ];
        let cases: [(&[Card], bool, u8, u8, &[&str]); 3] = [
            (&drill_three, true, 3, 20, &expected_drill_three),
            (&drill_one, true, 3, 26, &[]),
            (&ally_heavy, true, 3, 24, &[]),
        ];
        for (hand, go_first, max_turns, expected_damage, expected_actions) in cases {
            let result = solve_cards(hand, go_first, max_turns);
            assert_eq!(result.max_damage, expected_damage, "{hand:?}");
            if !expected_actions.is_empty() {
                let actions = labels(&result.events);
                assert_eq!(actions, expected_actions, "{hand:?}");
            }
        }

        let queue: Vec<Card> = (0..16)
            .map(|index| drill_three[index % drill_three.len()])
            .collect();
        let (pass, _) = solve_pass(&drill_three, true, 3, &queue);
        assert_eq!(pass.max_damage, 21);
        assert_eq!(
            pass.events.first().map(|e| format_line_event(e)).as_deref(),
            Some("Start of Game")
        );
        assert!(
            pass.events
                .iter()
                .any(|step| format_line_event(step).contains("Recollect (draw Rendi)")),
            "{:?}",
            pass.events
        );
    }

    #[test]
    #[ignore]
    fn capture_solver_snapshots() {
        let drill_three = [
            Card::RendingFlames,
            Card::Arthur,
            Card::HastyMessenger,
            Card::KingdomInformant,
            Card::IgnitedStab,
            Card::SableRemnant,
            Card::ClumsyApprentice,
        ];
        let drill_one = [
            Card::BlazingThrow,
            Card::Arthur,
            Card::RedHare,
            Card::Arthur,
            Card::BlazingThrow,
            Card::KingdomInformant,
            Card::KingdomInformant,
        ];
        let ally_heavy = [
            Card::Arthur,
            Card::Arthur,
            Card::ClumsyApprentice,
            Card::KingdomInformant,
            Card::KingdomInformant,
            Card::RedHare,
            Card::PepperedChef,
        ];
        for (name, hand, go_first, max_turns) in [
            ("drill_three", &drill_three[..], true, 3),
            ("drill_one", &drill_one[..], true, 3),
            ("ally_heavy", &ally_heavy[..], true, 3),
        ] {
            let result = solve_cards(hand, go_first, max_turns);
            let actions = labels(&result.events);
            println!(
                "case {name}: damage={} actions={actions:?}",
                result.max_damage
            );
        }
        let queue: Vec<Card> = (0..16)
            .map(|index| drill_three[index % drill_three.len()])
            .collect();
        let (pass, _) = solve_pass(&drill_three, true, 3, &queue);
        let actions = labels(&pass.events);
        println!(
            "case oracle_16: damage={} actions={actions:?}",
            pass.max_damage
        );
    }

    #[test]
    fn rococo_opens_for_two() {
        let hand = [Card::Rococo, Card::Brick];
        let result = solve_cards(&hand, true, 2);
        assert!(result.max_damage >= 2, "{result:#?}");
        assert_eq!(
            result.effective.engine_version.card_digest,
            ENGINE_VERSION.card_digest
        );
    }

    #[test]
    fn solve_clamps_turns_and_rollouts_in_effective() {
        use crate::model::SolveRequest;
        use std::collections::BTreeMap;

        let request = SolveRequest {
            hand: vec!["rococo".into(), "brick".into()],
            go_first: true,
            max_turns: 9,
            sim_type: SimType::MonteCarlo,
            deck: BTreeMap::from([("brick".into(), 58_u8)]),
            queue: None,
            rollouts: 99,
            seed: 1,
            budget: crate::budget::Budget::default(),
        };
        let result = solve(&request).unwrap();
        assert_eq!(result.effective.max_turns, Some(3));
        assert_eq!(result.effective.rollouts, Some(48));
        assert_eq!(result.effective.root_seed, 1);
    }

    #[test]
    fn vermilion_decree_imbues_on_all_fire_hand() {
        let state = State::with_queue(
            &[
                Card::VermilionDecree,
                Card::Brick,
                Card::Brick,
                Card::Brick,
                Card::IgnitedStab,
            ],
            false,
            1,
            &[Card::HotCake],
        );
        let legal = actions(state);
        let decree_actions: Vec<_> = legal
            .iter()
            .filter(|action| {
                matches!(
                    action,
                    Action::PlayAction {
                        card: Card::VermilionDecree,
                        ..
                    }
                )
            })
            .collect();
        assert_eq!(
            decree_actions.len(),
            1,
            "all-Fire hand only needs normal reserve: {decree_actions:?}"
        );
        let action = Action::PlayAction {
            card: Card::VermilionDecree,
            kindle: 0,
            prepared: false,
            imbue: false,
        };
        let (after, steps) = apply(state, action);
        assert_eq!(after.damage, 3, "{steps:?}");
        assert!(
            steps.iter().any(|step| {
                format_line_event(step).starts_with("Vermilion Decree (Imbue, draw HCake)")
            }),
            "{steps:?}"
        );
        assert!(after.has(Card::HotCake), "imbue should draw into hand");
        assert_eq!(after.memory_len, 3);
        assert_eq!(after.hand_len, 2); // leftover IgnitedStab + drawn HotCake
    }

    #[test]
    fn vermilion_decree_offers_fire_only_when_norm_in_hand() {
        // Score-0 Fire + Informant: normal payment takes Informant first, so no imbue.
        // Fire-only is also offered so the solver can still imbue and keep the Norm.
        let state = State::with_queue(
            &[
                Card::VermilionDecree,
                Card::Rococo,
                Card::XiaoQiao,
                Card::CorhaziCourier,
                Card::KingdomInformant,
            ],
            false,
            1,
            &[Card::HotCake],
        );
        let legal = actions(state);
        assert!(
            legal.iter().any(|action| matches!(
                action,
                Action::PlayAction {
                    card: Card::VermilionDecree,
                    imbue: true,
                    ..
                }
            )),
            "Fire-only alternate missing: {legal:?}"
        );
        assert!(
            legal.iter().any(|action| matches!(
                action,
                Action::PlayAction {
                    card: Card::VermilionDecree,
                    imbue: false,
                    ..
                }
            )),
            "normal reserve line missing: {legal:?}"
        );

        let (imbued, imbue_steps) = apply(
            state,
            Action::PlayAction {
                card: Card::VermilionDecree,
                kindle: 0,
                prepared: false,
                imbue: true,
            },
        );
        assert!(
            imbue_steps.iter().any(|event| {
                event.kind == EventKind::Play
                    && event.card == Some("vermilion_decree")
                    && event.imbue == Some(true)
                    && event.drawn.is_some()
            }),
            "{imbue_steps:?}"
        );
        assert!(imbued.has(Card::KingdomInformant));
        assert_eq!(imbued.memory[Card::KingdomInformant.index()], 0);

        let (normal, normal_steps) = apply(
            state,
            Action::PlayAction {
                card: Card::VermilionDecree,
                kindle: 0,
                prepared: false,
                imbue: false,
            },
        );
        assert!(
            normal_steps.iter().any(|event| {
                event.kind == EventKind::Play
                    && event.card == Some("vermilion_decree")
                    && event.imbue != Some(true)
            }),
            "normal payment should reserve Informant and skip imbue: {normal_steps:?}"
        );
        assert!(
            !normal_steps
                .iter()
                .any(|event| event.card == Some("vermilion_decree") && event.imbue == Some(true)),
            "{normal_steps:?}"
        );
        assert_eq!(normal.damage, 3);
        assert!(
            normal.memory[Card::KingdomInformant.index()] > 0,
            "normal reserve uses payment scores, so Informant is fodder: memory_len={}",
            normal.memory_len
        );
        assert!(!normal.has(Card::HotCake), "no imbue draw");
    }

    #[test]
    fn vermilion_decree_normal_reserve_still_imbues_when_payment_is_all_fire() {
        // Bricks outscore Informant, so normal payment is all Fire → imbue + draw.
        let state = State::with_queue(
            &[
                Card::VermilionDecree,
                Card::Brick,
                Card::Brick,
                Card::Brick,
                Card::KingdomInformant,
            ],
            false,
            1,
            &[Card::HotCake],
        );
        let (after, steps) = apply(
            state,
            Action::PlayAction {
                card: Card::VermilionDecree,
                kindle: 0,
                prepared: false,
                imbue: false,
            },
        );
        assert!(
            steps
                .iter()
                .any(|step| format_line_event(step).contains("Vermilion Decree (Imbue, draw")),
            "{steps:?}"
        );
        assert!(after.has(Card::KingdomInformant));
        assert_eq!(after.memory[Card::KingdomInformant.index()], 0);
        assert!(after.has(Card::HotCake));
    }

    #[test]
    fn vermilion_decree_skips_imbue_when_norm_must_pay_cost() {
        let state = State::with_queue(
            &[
                Card::VermilionDecree,
                Card::Brick,
                Card::Brick,
                Card::KingdomInformant,
                Card::SableRemnant,
            ],
            false,
            1,
            &[],
        );
        let legal = actions(state);
        assert!(
            !legal.iter().any(|action| matches!(
                action,
                Action::PlayAction {
                    card: Card::VermilionDecree,
                    imbue: true,
                    ..
                }
            )),
            "Imbue 3 is impossible with only 2 Fire left: {legal:?}"
        );
        let (after, steps) = apply(
            state,
            Action::PlayAction {
                card: Card::VermilionDecree,
                kindle: 0,
                prepared: false,
                imbue: false,
            },
        );
        assert_eq!(after.damage, 3, "{steps:?}");
        assert!(
            steps.iter().any(|event| {
                event.kind == EventKind::Play
                    && event.card == Some("vermilion_decree")
                    && event.imbue != Some(true)
            }),
            "{steps:?}"
        );
        assert!(
            !steps
                .iter()
                .any(|event| event.card == Some("vermilion_decree") && event.imbue == Some(true)),
            "{steps:?}"
        );
    }

    #[test]
    fn surging_bolt_deals_four_when_imbued() {
        let state = State::with_queue(
            &[
                Card::SurgingBolt,
                Card::Brick,
                Card::Brick,
                Card::Brick,
                Card::IgnitedStab,
            ],
            false,
            1,
            &[],
        );
        let (after, steps) = apply(
            state,
            Action::PlayAction {
                card: Card::SurgingBolt,
                kindle: 0,
                prepared: false,
                imbue: false,
            },
        );
        assert_eq!(after.damage, 4, "{steps:?}");
        assert!(
            steps
                .iter()
                .any(|step| format_line_event(step) == "Surging Bolt (Imbue)"),
            "{steps:?}"
        );
    }

    #[test]
    fn surging_bolt_offers_fire_only_and_deals_three_without_imbue() {
        let state = State::with_queue(
            &[
                Card::SurgingBolt,
                Card::Rococo,
                Card::XiaoQiao,
                Card::CorhaziCourier,
                Card::KingdomInformant,
            ],
            false,
            1,
            &[],
        );
        let legal = actions(state);
        assert!(
            legal.iter().any(|action| matches!(
                action,
                Action::PlayAction {
                    card: Card::SurgingBolt,
                    imbue: true,
                    ..
                }
            )),
            "Fire-only alternate missing: {legal:?}"
        );
        let (after, steps) = apply(
            state,
            Action::PlayAction {
                card: Card::SurgingBolt,
                kindle: 0,
                prepared: false,
                imbue: false,
            },
        );
        assert_eq!(after.damage, 3, "{steps:?}");
        assert!(
            steps
                .iter()
                .any(|step| format_line_event(step) == "Surging Bolt"),
            "{steps:?}"
        );
        assert!(
            !steps
                .iter()
                .any(|step| format_line_event(step).contains("Imbue")),
            "{steps:?}"
        );
    }

    #[test]
    fn two_pass_exposes_brick_oracle_and_combined_card_stats() {
        let hand = [
            "arthur",
            "clumsy_apprentice",
            "kingdom_informant",
            "brick",
            "brick",
            "brick",
            "brick",
        ]
        .map(str::to_string);
        let deck = BTreeMap::from([
            ("arthur".into(), 3_u8),
            ("clumsy_apprentice".into(), 3),
            ("kingdom_informant".into(), 3),
            ("hot_cake".into(), 3),
        ]);
        let result = solve(&SolveRequest {
            hand: hand.to_vec(),
            go_first: false,
            max_turns: 2,
            sim_type: SimType::TwoPass,
            deck,
            queue: None,
            rollouts: 1,
            seed: 42,
            budget: crate::budget::Budget::default(),
        })
        .expect("two-pass solve");

        let two_pass = result.two_pass.expect("two_pass payload");
        assert!(
            !two_pass.brick.card_stats.is_empty(),
            "brick pass should carry card stats"
        );
        assert!(
            !two_pass.oracle.card_stats.is_empty(),
            "oracle pass should carry card stats"
        );
        assert!(
            result.brick_line_stats.is_some(),
            "brick line stats should be retained"
        );
        assert!(
            !result.card_stats.is_empty(),
            "combined card stats should be non-empty"
        );
        let brick_damage: u32 = two_pass
            .brick
            .card_stats
            .iter()
            .map(|stat| stat.damage)
            .sum();
        let oracle_damage: u32 = two_pass
            .oracle
            .card_stats
            .iter()
            .map(|stat| stat.damage)
            .sum();
        let combined_damage: u32 = result.card_stats.iter().map(|stat| stat.damage).sum();
        assert_eq!(
            combined_damage,
            brick_damage + oracle_damage,
            "combined damage should sum both passes"
        );
    }

    #[test]
    fn oracle_only_matches_two_pass_oracle() {
        let hand = [
            "arthur",
            "clumsy_apprentice",
            "kingdom_informant",
            "brick",
            "brick",
            "brick",
            "brick",
        ]
        .map(str::to_string);
        let deck = BTreeMap::from([
            ("arthur".into(), 3_u8),
            ("clumsy_apprentice".into(), 3),
            ("kingdom_informant".into(), 3),
            ("hot_cake".into(), 3),
        ]);
        let request = |sim_type| SolveRequest {
            hand: hand.to_vec(),
            go_first: false,
            max_turns: 2,
            sim_type,
            deck: deck.clone(),
            queue: None,
            rollouts: 1,
            seed: 42,
            budget: crate::budget::Budget::default(),
        };
        let two_pass = solve(&request(SimType::TwoPass)).expect("two-pass solve");
        let oracle = solve(&request(SimType::OracleOnly)).expect("oracle-only solve");
        let two_pass_oracle = two_pass.two_pass.expect("two_pass payload").oracle;

        assert_eq!(oracle.sim_type, SimType::OracleOnly);
        assert!(oracle.two_pass.is_none());
        assert_eq!(oracle.max_damage, two_pass_oracle.max_damage);
        assert_eq!(oracle.events.len(), two_pass_oracle.events.len());
        assert!(!oracle.card_stats.is_empty());
    }

    #[test]
    fn oracle_only_requires_a_maindeck() {
        let result = solve(&SolveRequest {
            hand: vec!["arthur".into(), "brick".into()],
            go_first: true,
            max_turns: 2,
            sim_type: SimType::OracleOnly,
            deck: BTreeMap::new(),
            queue: None,
            rollouts: 1,
            seed: 1,
            budget: crate::budget::Budget::default(),
        });
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("need a maindeck"),);
    }

    #[test]
    fn oracle_uses_provided_queue_without_reshuffling() {
        let hand = vec!["arthur".into(), "brick".into()];
        let queue = vec!["hot_cake".into(), "rococo".into()];
        let seed_a = solve(&SolveRequest {
            hand: hand.clone(),
            go_first: true,
            max_turns: 2,
            sim_type: SimType::OracleOnly,
            deck: BTreeMap::new(),
            queue: Some(queue.clone()),
            rollouts: 1,
            seed: 1,
            budget: crate::budget::Budget::default(),
        })
        .expect("oracle with queue");
        let seed_b = solve(&SolveRequest {
            hand,
            go_first: true,
            max_turns: 2,
            sim_type: SimType::OracleOnly,
            deck: BTreeMap::new(),
            queue: Some(queue),
            rollouts: 1,
            seed: 99,
            budget: crate::budget::Budget::default(),
        })
        .expect("oracle with same queue");
        assert_eq!(seed_a.max_damage, seed_b.max_damage);
        assert_eq!(seed_a.events.len(), seed_b.events.len());
    }
}
