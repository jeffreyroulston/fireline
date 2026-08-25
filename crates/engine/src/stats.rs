//! Per-card line statistics collected from the reconstructed optimal path.

use crate::cards::{ALL_CARDS, CARD_COUNT, Card, PLAYABLE_CARDS};
use crate::model::{Action, State, Step};
use serde::Serialize;

#[derive(Clone, Debug, Default)]
pub struct LineCardStats {
    pub plays: [u32; CARD_COUNT],
    pub attacks: [u32; CARD_COUNT],
    pub damage: [u32; CARD_COUNT],
    /// Mid-line draws (not opening hand). Bricks ignored.
    pub drawn: [u32; CARD_COUNT],
}

impl LineCardStats {
    pub fn record_action(
        &mut self,
        action: Action,
        before: State,
        after: State,
        steps: &[Step],
    ) {
        let before_damage = before.damage;
        match action {
            Action::PlayAlly { card, .. } => {
                self.plays[card.index()] += 1;
                self.attribute_play_bundle(card, steps, before_damage);
            }
            Action::PlayItem { card } => {
                self.plays[card.index()] += 1;
                self.record_draws_in_steps(steps);
            }
            Action::PlayAttack { card, .. } | Action::PlayAction { card, .. } => {
                self.plays[card.index()] += 1;
                let delta = u32::from(after.damage.saturating_sub(before_damage));
                self.damage[card.index()] += delta;
                self.record_draws_in_steps(steps);
            }
            Action::BlazingThrow => {
                self.plays[Card::BlazingThrow.index()] += 1;
                self.damage[Card::BlazingThrow.index()] +=
                    u32::from(after.damage.saturating_sub(before_damage));
            }
            Action::AttackArthur(index) => {
                let card = before.allies[index as usize].card();
                self.attacks[card.index()] += 1;
                self.attribute_attack_bundle(card, steps, before_damage);
            }
            Action::AttackOthers => self.attribute_multi_attacks(steps, before_damage),
            _ => self.record_draws_in_steps(steps),
        }
    }

    fn attribute_play_bundle(&mut self, card: Card, steps: &[Step], before_damage: u8) {
        let mut prev = before_damage;
        for step in steps {
            let delta = u32::from(step.damage.saturating_sub(prev));
            prev = step.damage;
            if delta > 0
                && (step.action.contains("On-Enter")
                    || step.action.starts_with("Racoo")
                    || step.action.starts_with("Rococo"))
            {
                self.damage[card.index()] += delta;
            }
            self.record_draw_label(&step.action);
        }
    }

    fn attribute_attack_bundle(&mut self, card: Card, steps: &[Step], before_damage: u8) {
        let mut prev = before_damage;
        for step in steps {
            let delta = u32::from(step.damage.saturating_sub(prev));
            prev = step.damage;
            if step.action.starts_with("Corhazi") {
                self.damage[Card::CorhaziCourier.index()] += delta;
            } else if delta > 0 {
                self.damage[card.index()] += delta;
            }
            self.record_draw_label(&step.action);
        }
    }

    fn attribute_multi_attacks(&mut self, steps: &[Step], before_damage: u8) {
        let mut prev = before_damage;
        let mut current: Option<Card> = None;
        for step in steps {
            let delta = u32::from(step.damage.saturating_sub(prev));
            prev = step.damage;
            if let Some(card) = parse_attack_from(&step.action) {
                current = Some(card);
                self.attacks[card.index()] += 1;
                self.damage[card.index()] += delta;
            } else if step.action.starts_with("Corhazi") {
                self.damage[Card::CorhaziCourier.index()] += delta;
                self.record_draw_label(&step.action);
            } else {
                if delta > 0 {
                    if let Some(card) = current {
                        self.damage[card.index()] += delta;
                    }
                }
                self.record_draw_label(&step.action);
            }
        }
    }

    fn record_draws_in_steps(&mut self, steps: &[Step]) {
        for step in steps {
            self.record_draw_label(&step.action);
        }
    }

    fn record_draw_label(&mut self, label: &str) {
        for card in parse_drawn_cards(label) {
            if card != Card::Brick {
                self.drawn[card.index()] += 1;
            }
        }
    }

    pub fn merge_into(&self, target: &mut LineCardStats) {
        for index in 0..CARD_COUNT {
            target.plays[index] += self.plays[index];
            target.attacks[index] += self.attacks[index];
            target.damage[index] += self.damage[index];
            target.drawn[index] += self.drawn[index];
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CardStat {
    pub card: &'static str,
    pub name: &'static str,
    pub copies: u8,
    /// Samples where ≥1 copy was in the opening hand.
    pub opened: u32,
    /// Total opening-hand copies across samples.
    pub opened_copies: u32,
    /// Mid-line draws across samples (bricks excluded).
    pub drawn: u32,
    /// Samples where the card was opened or drawn mid-line.
    pub seen: u32,
    pub plays: u32,
    pub attacks: u32,
    pub damage: u32,
    pub damage_when_seen_sum: u32,
    pub open_rate: f64,
    pub see_rate: f64,
    /// Plays per sample.
    pub play_rate: f64,
    /// Plays / seen samples.
    pub play_when_seen: f64,
    /// Mean damage on samples where seen.
    pub damage_when_seen: f64,
    pub damage_per_play: f64,
    /// Share of all attributed card damage.
    pub damage_share: f64,
}

#[derive(Default)]
pub struct DeckStatAccumulator {
    samples: u32,
    copies: [u8; CARD_COUNT],
    opened: [u32; CARD_COUNT],
    opened_copies: [u32; CARD_COUNT],
    seen: [u32; CARD_COUNT],
    line: LineCardStats,
    /// Per-sample damage attributed (summed) for damage_when_seen.
    damage_when_seen_sum: [u32; CARD_COUNT],
}

impl DeckStatAccumulator {
    pub fn with_deck(deck: &[Card]) -> Self {
        let mut copies = [0_u8; CARD_COUNT];
        for &card in deck {
            copies[card.index()] = copies[card.index()].saturating_add(1);
        }
        Self {
            copies,
            ..Self::default()
        }
    }

    pub fn add_sample(&mut self, opening: &[Card], stats: &LineCardStats) {
        self.samples += 1;
        let mut opened_this = [false; CARD_COUNT];
        let mut seen_this = [false; CARD_COUNT];

        for &card in opening {
            if card == Card::Brick {
                continue;
            }
            let index = card.index();
            opened_this[index] = true;
            seen_this[index] = true;
            self.opened_copies[index] += 1;
        }
        for index in 0..CARD_COUNT {
            if opened_this[index] {
                self.opened[index] += 1;
            }
            if stats.drawn[index] > 0 {
                seen_this[index] = true;
            }
            if seen_this[index] {
                self.seen[index] += 1;
                self.damage_when_seen_sum[index] += stats.damage[index];
            }
        }
        stats.merge_into(&mut self.line);
    }

    pub fn finish(self) -> Vec<CardStat> {
        let samples = self.samples.max(1) as f64;
        let total_damage: u32 = PLAYABLE_CARDS
            .iter()
            .map(|card| self.line.damage[card.index()])
            .sum();
        let total_damage_f = f64::from(total_damage.max(1));

        let mut rows = PLAYABLE_CARDS
            .iter()
            .filter(|card| self.copies[card.index()] > 0)
            .map(|&card| {
                let index = card.index();
                let plays = self.line.plays[index];
                let seen = self.seen[index];
                let damage = self.line.damage[index];
                CardStat {
                    card: card.id(),
                    name: card.name(),
                    copies: self.copies[index],
                    opened: self.opened[index],
                    opened_copies: self.opened_copies[index],
                    drawn: self.line.drawn[index],
                    seen,
                    plays,
                    attacks: self.line.attacks[index],
                    damage,
                    damage_when_seen_sum: self.damage_when_seen_sum[index],
                    open_rate: f64::from(self.opened[index]) / samples,
                    see_rate: f64::from(seen) / samples,
                    play_rate: f64::from(plays) / samples,
                    play_when_seen: if seen > 0 {
                        f64::from(plays) / f64::from(seen)
                    } else {
                        0.0
                    },
                    damage_when_seen: if seen > 0 {
                        f64::from(self.damage_when_seen_sum[index]) / f64::from(seen)
                    } else {
                        0.0
                    },
                    damage_per_play: if plays > 0 {
                        f64::from(damage) / f64::from(plays)
                    } else {
                        0.0
                    },
                    damage_share: f64::from(damage) / total_damage_f,
                }
            })
            .collect::<Vec<_>>();

        rows.sort_by(|a, b| {
            b.damage
                .cmp(&a.damage)
                .then_with(|| b.plays.cmp(&a.plays))
                .then_with(|| a.name.cmp(b.name))
        });
        rows
    }
}

fn parse_attack_from(label: &str) -> Option<Card> {
    let rest = label.strip_prefix("Attack from ")?;
    ALL_CARDS
        .into_iter()
        .find(|card| card.name() == rest)
}

fn parse_drawn_cards(label: &str) -> Vec<Card> {
    let mut found = Vec::new();
    // "Clumsy On-Enter draw (Clums)"
    if let Some(inner) = label.strip_prefix("Clumsy On-Enter draw (") {
        if let Some(short) = inner.strip_suffix(')') {
            if let Some(card) = card_from_short(short) {
                found.push(card);
            }
        }
    }
    // "On-Attack discard X / draw Y"
    if let Some(idx) = label.find(" / draw ") {
        let short = label[idx + " / draw ".len()..]
            .split_whitespace()
            .next()
            .unwrap_or("");
        if let Some(card) = card_from_short(short) {
            found.push(card);
        }
    }
    // "Corhazi On-Hit draw X / discard ..."
    if let Some(rest) = label.strip_prefix("Corhazi On-Hit draw ") {
        let short = rest.split_whitespace().next().unwrap_or("");
        if let Some(card) = card_from_short(short) {
            found.push(card);
        }
    }
    // "Recollect (draw Short)"
    if let Some(inner) = label.strip_prefix("Recollect (draw ") {
        if let Some(short) = inner.strip_suffix(')') {
            if let Some(card) = card_from_short(short) {
                found.push(card);
            }
        }
    }
    found
}

fn card_from_short(short: &str) -> Option<Card> {
    ALL_CARDS.into_iter().find(|card| card.short() == short)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_recollect_draw() {
        let cards = parse_drawn_cards("Recollect (draw Arthu)");
        assert_eq!(cards, vec![Card::Arthur]);
    }
}
