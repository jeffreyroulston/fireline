use crate::{
    cards::{ALL_CARDS, Card, parse_card},
    model::{
        Action, DamageDistribution, EffectiveRequest, MAT_BLADE, MAT_DAGGER, MAT_HAMMER,
        MAT_SOULKNIFE, MAT_ZANDER, McRollout, PassResult, Phase, SimType, SolveRequest,
        SolveResult, State, Step, TwoPassResult, Weapon,
    },
    version::ENGINE_VERSION,
};
use rustc_hash::FxHashMap;
use std::collections::BTreeMap;
#[cfg(not(target_arch = "wasm32"))]
use std::time::Instant;

#[derive(Default)]
struct Search {
    memo: FxHashMap<State, u8>,
    dominance: FxHashMap<State, u8>,
    nodes: u64,
}

impl Search {
    fn visit(&mut self, state: State) -> u8 {
        self.nodes += 1;
        if state.is_terminal() {
            return state.damage;
        }
        if let Some(&damage) = self.memo.get(&state) {
            return damage;
        }

        let mut board = state;
        board.damage = 0;
        if self
            .dominance
            .get(&board)
            .is_some_and(|&damage| state.damage < damage)
        {
            return state.damage;
        }
        self.dominance
            .entry(board)
            .and_modify(|damage| *damage = (*damage).max(state.damage))
            .or_insert(state.damage);

        let mut best = state.damage;
        for action in actions(state) {
            let (next, _) = apply(state, action);
            best = best.max(self.visit(next));
        }
        self.memo.insert(state, best);
        best
    }

    fn reconstruct(
        &mut self,
        state: State,
        target: u8,
        output: &mut Vec<Step>,
        stats: &mut crate::stats::LineCardStats,
    ) {
        if state.is_terminal() {
            return;
        }
        for action in actions(state) {
            let (next, steps) = apply(state, action);
            if self.visit(next) == target {
                stats.record_action(action, state, next, &steps);
                output.extend(steps);
                self.reconstruct(next, target, output, stats);
                return;
            }
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
    if request.hand.len() < 2 || request.hand.len() > 8 {
        return Err("hand must contain 2–8 cards".to_string());
    }
    let hand = request
        .hand
        .iter()
        .map(|card| parse_card(card).ok_or_else(|| format!("unknown card: {card}")))
        .collect::<Result<Vec<_>, _>>()?;
    let max_turns = request.max_turns.clamp(2, 3);
    let rollouts = request.rollouts.clamp(1, 48);
    let mut result = match request.sim_type {
        SimType::FireBrick => solve_cards(&hand, request.go_first, max_turns),
        SimType::MonteCarlo => {
            let remaining = remaining_deck(&request.deck, &hand)?;
            solve_monte_carlo(
                &hand,
                &remaining,
                request.go_first,
                max_turns,
                rollouts,
                request.seed,
            )
        }
        SimType::TwoPass => {
            let remaining = remaining_deck(&request.deck, &hand)?;
            solve_two_pass(
                &hand,
                &remaining,
                request.go_first,
                max_turns,
                request.seed,
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
    }
}

fn hand_solve_effective(go_first: bool, max_turns: u8, sim_type: SimType) -> EffectiveRequest {
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
    }
}

pub fn solve_cards(hand: &[Card], go_first: bool, max_turns: u8) -> SolveResult {
    #[cfg(not(target_arch = "wasm32"))]
    let started = Instant::now();
    let (pass, line_stats) = solve_pass(hand, go_first, max_turns, &[]);
    SolveResult {
        sim_type: SimType::FireBrick,
        max_damage: pass.max_damage,
        steps: pass.steps,
        nodes: pass.nodes,
        memo_entries: pass.memo_entries,
        elapsed_ms: {
            #[cfg(target_arch = "wasm32")]
            {
                0.0
            }
            #[cfg(not(target_arch = "wasm32"))]
            {
                started.elapsed().as_secs_f64() * 1000.0
            }
        },
        distribution: None,
        two_pass: None,
        card_stats: summarize_line_stats(hand, &line_stats),
        line_stats,
        effective: hand_solve_effective(go_first, max_turns, SimType::FireBrick),
    }
}

pub fn solve_pass(
    hand: &[Card],
    go_first: bool,
    max_turns: u8,
    queue: &[Card],
) -> (PassResult, crate::stats::LineCardStats) {
    let initial = State::with_queue(hand, go_first, max_turns, queue);
    let mut search = Search::default();
    let max_damage = search.visit(initial);
    let mut steps = vec![Step::new(initial, "Main", "Start of Game")];
    let mut line_stats = crate::stats::LineCardStats::default();
    search.reconstruct(initial, max_damage, &mut steps, &mut line_stats);
    (
        PassResult {
            max_damage,
            steps,
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
) -> SolveResult {
    #[cfg(not(target_arch = "wasm32"))]
    let started = Instant::now();
    let mut rng = Rng(seed);
    let mut damages = Vec::with_capacity(rollouts as usize);
    let mut samples = Vec::with_capacity(rollouts as usize);
    let mut rollout_stats = Vec::with_capacity(rollouts as usize);
    let mut total_nodes = 0;
    let mut total_memo = 0;
    let mut stats_acc = crate::stats::DeckStatAccumulator::with_deck(hand);

    for _ in 0..rollouts {
        let mut queue = remaining.to_vec();
        shuffle_cards(&mut queue, &mut rng);
        let (pass, line_stats) = solve_pass(hand, go_first, max_turns, &queue);
        total_nodes += pass.nodes;
        total_memo += pass.memo_entries;
        damages.push(pass.max_damage);
        samples.push(McRollout {
            damage: pass.max_damage,
            steps: pass.steps,
            nodes: pass.nodes,
        });
        stats_acc.add_sample(hand, &line_stats);
        rollout_stats.push(line_stats);
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
    let headline_stats = rollout_stats
        .get(median_index)
        .cloned()
        .unwrap_or_default();

    SolveResult {
        sim_type: SimType::MonteCarlo,
        max_damage: headline.damage,
        steps: headline.steps.clone(),
        nodes: total_nodes,
        memo_entries: total_memo,
        elapsed_ms: {
            #[cfg(target_arch = "wasm32")]
            {
                0.0
            }
            #[cfg(not(target_arch = "wasm32"))]
            {
                started.elapsed().as_secs_f64() * 1000.0
            }
        },
        distribution: Some(DamageDistribution {
            damages,
            mean,
            p50,
            p90: percentile(&sorted, 90),
            min: sorted.first().copied().unwrap_or(0),
            max: sorted.last().copied().unwrap_or(0),
            rollouts: samples,
        }),
        two_pass: None,
        card_stats: stats_acc.finish(),
        line_stats: headline_stats,
        effective: hand_solve_effective(go_first, max_turns, SimType::MonteCarlo),
    }
}

fn solve_two_pass(
    hand: &[Card],
    remaining: &[Card],
    go_first: bool,
    max_turns: u8,
    seed: u64,
) -> SolveResult {
    #[cfg(not(target_arch = "wasm32"))]
    let started = Instant::now();
    let (brick, _) = solve_pass(hand, go_first, max_turns, &[]);
    let mut queue = remaining.to_vec();
    let mut rng = Rng(seed);
    shuffle_cards(&mut queue, &mut rng);
    let (mut oracle, oracle_stats) = solve_pass(hand, go_first, max_turns, &queue);
    let card_stats = summarize_line_stats(hand, &oracle_stats);
    oracle.card_stats = card_stats.clone();

    SolveResult {
        sim_type: SimType::TwoPass,
        max_damage: brick.max_damage,
        steps: brick.steps.clone(),
        nodes: brick.nodes + oracle.nodes,
        memo_entries: brick.memo_entries + oracle.memo_entries,
        elapsed_ms: {
            #[cfg(target_arch = "wasm32")]
            {
                0.0
            }
            #[cfg(not(target_arch = "wasm32"))]
            {
                started.elapsed().as_secs_f64() * 1000.0
            }
        },
        distribution: None,
        two_pass: Some(TwoPassResult { brick, oracle }),
        card_stats,
        line_stats: oracle_stats,
        effective: hand_solve_effective(go_first, max_turns, SimType::TwoPass),
    }
}

fn remaining_deck(deck: &BTreeMap<String, u8>, hand: &[Card]) -> Result<Vec<Card>, String> {
    if deck.is_empty() {
        return Err(
            "Monte Carlo and Two-pass need a maindeck so unknown draws can be sampled".into(),
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

fn actions(state: State) -> Vec<Action> {
    if state.phase == Phase::Materialize {
        let mut result = Vec::with_capacity(12);
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
        result.push(Action::SkipMaterialize);
        return result;
    }

    let mut result = Vec::with_capacity(48);
    if state.dagger && state.dagger_ready {
        result.push(Action::ActivateDagger);
    }

    for index in 0..state.ally_len as usize {
        if state.allies[index].card() == Card::Sadi && state.hand_len >= 2 {
            result.push(Action::ActivateSadi(index as u8));
        }
    }

    for index in 0..state.ally_len as usize {
        if state.allies[index].card() == Card::Arthur && state.can_ally_attack(index) {
            result.push(Action::AttackArthur(index as u8));
            break;
        }
    }
    if (0..state.ally_len as usize)
        .any(|index| state.allies[index].card() != Card::Arthur && state.can_ally_attack(index))
    {
        result.push(Action::AttackOthers);
    }

    for card in ALL_CARDS {
        if !card.is_ally() || !state.has(card) {
            continue;
        }
        if card.is_unique()
            && state.allies[..state.ally_len as usize]
                .iter()
                .any(|ally| ally.card() == card)
        {
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
                    });
                }
                result.push(Action::PlayAttack {
                    card,
                    weapon,
                    prepared: false,
                    doubled: double,
                });
            }
        }
    }

    for card in [
        Card::FieryInterference,
        Card::IntensifiedPyre,
        Card::MarkTheTarget,
        Card::PlantedExplosive,
        Card::VermilionDecree,
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
            if can_prepare {
                result.push(Action::PlayAction {
                    card,
                    kindle,
                    prepared: true,
                });
            }
            result.push(Action::PlayAction {
                card,
                kindle,
                prepared: false,
            });
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

fn apply(mut state: State, action: Action) -> (State, Vec<Step>) {
    let mut steps = Vec::with_capacity(8);
    match action {
        Action::Pass => advance_after_pass(&mut state, &mut steps),
        Action::SkipMaterialize => finish_materialization(&mut state, &mut steps),
        Action::MaterializeHammer => {
            state.remove_material(MAT_HAMMER);
            state.weapon = Weapon::ImpactHammer;
            state.weapon_durability = state.weapon.durability();
            steps.push(Step::new(state, "Mate", "Materialize Impact Hammer"));
            finish_materialization(&mut state, &mut steps);
        }
        Action::MaterializeDagger => {
            state.remove_material(MAT_DAGGER);
            state.dagger = true;
            state.dagger_ready = false;
            steps.push(Step::new(state, "Mate", "Materialize Poisoned Dagger"));
            finish_materialization(&mut state, &mut steps);
        }
        Action::MaterializeZanderMemory => {
            state.remove_material(MAT_ZANDER);
            if state.float_gy > 0 {
                state.float_gy -= 1;
                state.gy_total = state.gy_total.saturating_sub(1);
                steps.push(Step::new(
                    state,
                    "Mate",
                    "Mem Cost for Zander Lvl 1 (Float from GY)",
                ));
            } else {
                for card in ALL_CARDS.into_iter().rev() {
                    if state.memory[card.index()] > 0 {
                        state.memory[card.index()] -= 1;
                        state.memory_len -= 1;
                        state.send_to_gy(card);
                        steps.push(Step::new(
                            state,
                            "Mate",
                            "Mem Cost for Zander Lvl 1 (from Mem)",
                        ));
                        break;
                    }
                }
            }
            level_zander(&mut state, &mut steps);
            finish_materialization(&mut state, &mut steps);
        }
        Action::MaterializeZanderFloat(index) => {
            state.remove_material(MAT_ZANDER);
            let card = state.allies[index as usize].card();
            state.remove_ally(index as usize, false);
            steps.push(Step::new(
                state,
                "Mate",
                format!("Mem Cost for Zander Lvl 1 (Float {})", card.name()),
            ));
            level_zander(&mut state, &mut steps);
            finish_materialization(&mut state, &mut steps);
        }
        Action::MaterializeSoulknife => {
            state.remove_material(MAT_SOULKNIFE);
            state.banish_fire_from_gy(3, false);
            state.weapon = Weapon::VaruckanSoulknife;
            state.weapon_durability = state.weapon.durability();
            steps.push(Step::new(
                state,
                "Main",
                "Materialize Varuckan Soulknife (banish 3 Fire)",
            ));
        }
        Action::ActivateDagger => {
            state.dagger = false;
            state.dagger_ready = false;
            state.add_damage(1);
            state.amplify = state.is_assassin();
            steps.push(Step::new(state, "Main", "Activate Poisoned Dagger"));
        }
        Action::ActivateSadi(index) => {
            if state.pay_reserve(2) {
                state.remove_ally(index as usize, false);
                state.add_hand(Card::Sadi);
                state.prep = state.prep.saturating_add(1);
                steps.push(Step::new(state, "Main", "Sadi bounce for Prep"));
            }
        }
        Action::AttackArthur(index) => attack_ally(&mut state, index as usize, &mut steps),
        Action::AttackOthers => {
            let mut index = 0;
            while index < state.ally_len as usize {
                if state.allies[index].card() != Card::Arthur && state.can_ally_attack(index) {
                    attack_ally(&mut state, index, &mut steps);
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
            &mut steps,
        ),
        Action::PlayItem { card } => play_item(&mut state, card, &mut steps),
        Action::PlayAttack {
            card,
            weapon,
            prepared,
            doubled,
        } => play_attack(&mut state, card, weapon, prepared, doubled, &mut steps),
        Action::PlayAction {
            card,
            kindle,
            prepared,
        } => play_action(&mut state, card, kindle, prepared, &mut steps),
        Action::BlazingThrow => {
            state.remove_hand(Card::BlazingThrow);
            state.pay_reserve(1);
            let weapon = state.weapon.name();
            state.weapon = Weapon::None;
            state.weapon_durability = 0;
            state.send_to_gy(Card::BlazingThrow);
            state.add_damage(4);
            steps.push(Step::new(
                state,
                "Main",
                format!("Activate Blazing Throw ({weapon})"),
            ));
        }
        Action::MercenaryBlade => {
            state.remove_material(MAT_BLADE);
            state.prep -= 1;
            state.weapon = Weapon::MercenaryBlade;
            state.weapon_durability = state.weapon.durability();
            steps.push(Step::new(
                state,
                "Main",
                "Materialize Mercenary's Blade (prep)",
            ));
        }
    }
    (state, steps)
}

fn play_ally(
    state: &mut State,
    card: Card,
    kindle: u8,
    sacrifice: bool,
    hot_cake_sacrifice: bool,
    steps: &mut Vec<Step>,
) {
    state.remove_hand(card);
    state.pay_with_kindle(card.cost(), kindle);
    let arthur = card == Card::Arthur;
    let immortal = arthur;
    let mut sacrificed = false;
    if sacrifice && card == Card::PepperedChef {
        if let Some(index) = (0..state.ally_len as usize).rev().find(|&index| {
            let victim = state.allies[index].card();
            victim != Card::Arthur
        }) {
            state.remove_ally(index, true);
            sacrificed = true;
            steps.push(Step::new(*state, "Main", "Peppered Chef sacrifice"));
        }
    }
    state.add_ally(card, !arthur, immortal);
    let label = if kindle > 0 {
        format!("Activate {} (Kindle {kindle})", card.name())
    } else {
        format!("Activate {}", card.name())
    };
    steps.push(Step::new(*state, "Main", label));
    if arthur {
        steps.push(Step::new(*state, "Main", "Immortalize the King"));
    } else if card == Card::ClumsyApprentice {
        let drawn = state.draw_unknown();
        steps.push(Step::new(
            *state,
            "Main",
            format!("Clumsy On-Enter draw ({})", drawn.short()),
        ));
    } else if card == Card::Racoo {
        state.add_damage(2);
        steps.push(Step::new(*state, "Main", "Racoo On-Enter damage"));
    } else if card == Card::Rococo {
        let influence = state.hand_len.saturating_add(state.memory_len);
        if influence <= 4 {
            state.add_damage(2);
            steps.push(Step::new(*state, "Main", "Rococo On-Enter damage"));
        }
    } else if card == Card::PepperedChef && sacrificed {
        state.agility = state.agility.saturating_add(2);
        steps.push(Step::new(*state, "Main", "Peppered Chef +2 POWER"));
    }
    if hot_cake_sacrifice && state.hot_cake > 0 {
        state.hot_cake -= 1;
        state.send_to_gy(Card::HotCake);
        let index = state.ally_len as usize - 1;
        state.allies[index].attack_buff = state.allies[index].attack_buff.saturating_add(3);
        steps.push(Step::new(*state, "Main", "Hot Cake sacrifice (+3 next attack)"));
    }
}

fn play_item(state: &mut State, card: Card, steps: &mut Vec<Step>) {
    state.remove_hand(card);
    state.pay_reserve(card.cost());
    if card == Card::HotCake {
        state.hot_cake = state.hot_cake.saturating_add(1);
    }
    steps.push(Step::new(*state, "Main", format!("Activate {}", card.name())));
}

fn attack_ally(state: &mut State, index: usize, steps: &mut Vec<Step>) {
    let ally = state.allies[index];
    let card = ally.card();
    let mut power = state.ally_power(ally);
    if card == Card::PepperedChef && state.agility > 0 {
        let buff = state.agility.min(2);
        power = power.saturating_add(buff);
        state.agility = state.agility.saturating_sub(buff);
    }
    if ally.attack_buff > 0 {
        power = power.saturating_add(ally.attack_buff);
        state.allies[index].attack_buff = 0;
    }
    state.add_damage(power);
    state.allies[index].awake = false;
    steps.push(Step::new(
        *state,
        "Main",
        format!("Attack from {}", card.name()),
    ));
    if card == Card::CaptivatingCutthroat && state.is_assassin() {
        state.champion_damaged = true;
        steps.push(Step::new(*state, "Main", "Cutthroat On-Attack self 1"));
    }
    if matches!(card, Card::HastyMessenger | Card::RedHare) {
        if let Some(discarded) = state.discard_for_effect() {
            let drawn = state.draw_unknown();
            steps.push(Step::new(
                *state,
                "Main",
                format!(
                    "On-Attack discard {} / draw {}",
                    discarded.short(),
                    drawn.short()
                ),
            ));
        }
    }
    if card == Card::CorhaziCourier && state.is_assassin() {
        let drawn = state.draw_unknown();
        if let Some(discarded) = state.discard_for_effect() {
            let mut label = format!(
                "Corhazi On-Hit draw {} / discard {}",
                drawn.short(),
                discarded.short()
            );
            if discarded.is_fire() {
                state.add_damage(1);
                label.push_str(" Fire ping");
            }
            steps.push(Step::new(*state, "Main", label));
        }
    }
}

fn play_attack(
    state: &mut State,
    card: Card,
    use_weapon: bool,
    prepared: bool,
    doubled: bool,
    steps: &mut Vec<Step>,
) {
    state.remove_hand(card);
    state.pay_reserve(card.cost());
    let mut power = card.power();
    if card == Card::IgnitedStab && prepared {
        state.prep -= 1;
        power += 2;
    }
    if card == Card::HeatedVengeance && state.champion_damaged {
        power += 3;
    }
    if use_weapon && state.weapon != Weapon::None {
        let name = state.weapon.name();
        power += state.weapon.power();
        steps.push(Step::new(
            *state,
            "Main",
            format!("USE IN BELOW ATTACK ({name})"),
        ));
        state.consume_weapon();
    }
    state.send_to_gy(card);
    state.champion_awake = false;

    if card == Card::RendingFlames && doubled && state.fire_gy >= 3 {
        state.fire_gy -= 3;
        state.gy_total = state.gy_total.saturating_sub(3);
        if state.march_hare_gy > state.fire_gy {
            state.march_hare_gy = state.fire_gy;
        }
        state.add_damage(power * 2);
        steps.push(Step::new(*state, "Main", "Rending Flames (Doubled)"));
    } else {
        state.add_damage(power);
        let label = match card {
            Card::IgnitedStab if prepared => "Ignited Stab (prepared)",
            Card::IgnitedStab => "Ignited Stab (no prep)",
            Card::HeatedVengeance if state.champion_damaged => "Heated Vengeance (+3)",
            Card::HeatedVengeance => "Heated Vengeance",
            _ => "Rending Flames",
        };
        steps.push(Step::new(*state, "Main", label));
    }
}

fn play_action(state: &mut State, card: Card, kindle: u8, prepared: bool, steps: &mut Vec<Step>) {
    state.remove_hand(card);
    state.pay_with_kindle(card.cost(), kindle);
    if prepared && card.prepare() > 0 {
        state.prep = state.prep.saturating_sub(card.prepare());
    }
    state.send_to_gy(card);

    let (damage, label) = match card {
        Card::FieryInterference => (2, "Fiery Interference"),
        Card::MarkTheTarget => {
            if state.is_assassin() {
                state.prep = state.prep.saturating_add(1);
            }
            (1, "Mark the Target")
        }
        Card::PlantedExplosive if prepared => (4, "Planted Explosive (prepared)"),
        Card::PlantedExplosive => (2, "Planted Explosive"),
        Card::IntensifiedPyre if state.gy_total >= 8 => (6, "Intensified Pyre (GY 8+)"),
        Card::IntensifiedPyre => (2, "Intensified Pyre"),
        Card::VermilionDecree => (3, "Vermilion Decree"),
        _ => (0, "Action"),
    };
    state.add_damage(damage);
    let label = if kindle > 0 {
        format!("{label} (Kindle {kindle})")
    } else {
        label.to_string()
    };
    steps.push(Step::new(*state, "Main", label));
}

fn level_zander(state: &mut State, steps: &mut Vec<Step>) {
    state.champion_level = 1;
    state.prep = state.prep.saturating_add(1);
    steps.push(Step::new(
        state.to_owned(),
        "Mate",
        "Zander Lvl 1 Glimpse/Prep",
    ));
}

fn finish_materialization(state: &mut State, steps: &mut Vec<Step>) {
    steps.push(Step::new(*state, "Reco", "Materialization Resolves"));
    let drawn = state.recollect();
    state.phase = Phase::Main;
    steps.push(Step::new(
        *state,
        "Main",
        format!("Recollect (draw {})", drawn.short()),
    ));
}

fn advance_after_pass(state: &mut State, steps: &mut Vec<Step>) {
    steps.push(Step::new(*state, "Agil", "Main: Pass Opportunity"));
    steps.push(Step::new(*state, "End", "End of Agility Phase"));
    steps.push(Step::new(*state, "EMai", "End of End Phase"));
    state.turn += 1;
    state.enemy_cull();
    steps.push(Step::new(*state, "EEnd", "Enemy Main Phase"));
    steps.push(Step::new(*state, "Wake", "End of Enemy End Phase"));
    state.wake();
    steps.push(Step::new(*state, "Mate", "Wake Up Phase"));
    if !state.is_terminal() {
        state.phase = Phase::Materialize;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::version::ENGINE_VERSION;

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
    fn drill_one_is_twenty_four() {
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
        assert_eq!(result.max_damage, 24, "{result:#?}");
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
        ] {
            assert!(parse_card(name).is_some(), "{name}");
        }
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
    }

    #[test]
    fn rococo_opens_for_two() {
        let hand = [Card::Rococo, Card::Brick];
        let result = solve_cards(&hand, true, 2);
        assert!(result.max_damage >= 2, "{result:#?}");
        assert_eq!(result.effective.engine_version.card_digest, ENGINE_VERSION.card_digest);
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
            rollouts: 99,
            seed: 1,
        };
        let result = solve(&request).unwrap();
        assert_eq!(result.effective.max_turns, Some(3));
        assert_eq!(result.effective.rollouts, Some(48));
        assert_eq!(result.effective.root_seed, 1);
    }
}
