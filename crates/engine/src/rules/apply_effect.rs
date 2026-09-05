//! Apply composed [`Effect`] sequences against [`State`].

use crate::cards::{Card, CondContext, EffectPlan};
use crate::line_event::{EventFields, EventKind, EventTape, TapePhase};
use crate::model::State;

/// Resolve `on_play` effects for an action into board mutations + tape field bits.
pub(crate) struct ActionEffectResult {
    pub gy_threshold: bool,
    pub drawn: Option<Card>,
    pub memory_draw: Option<Card>,
    pub discarded: Option<Card>,
}

pub(crate) fn apply_action_on_play(
    state: &mut State,
    card: Card,
    prepared: bool,
    imbued: bool,
) -> ActionEffectResult {
    let ctx = CondContext {
        prepared,
        imbued,
        gy_total: state.gy_total,
        influence: state.influence(),
        is_assassin: state.is_assassin(),
        champion_damaged: state.champion_damaged,
        fire_gy: state.fire_gy,
    };
    let plan = EffectPlan::resolve(card.on_play(), ctx);
    apply_effect_plan_mutators(state, &plan);

    let (drawn, memory_draw, discarded) = realize_draws(state, &plan);

    ActionEffectResult {
        gy_threshold: plan.gy_threshold,
        drawn,
        memory_draw,
        discarded,
    }
}

/// Resolve non-interactive ally `on_enter` effects. Returns whether any effect ran.
pub(crate) fn apply_ally_on_enter(
    state: &mut State,
    card: Card,
    phase: TapePhase,
    tape: &mut EventTape,
) -> bool {
    let effects = card.on_enter();
    if effects.is_empty() {
        return false;
    }
    let ctx = CondContext {
        prepared: false,
        imbued: false,
        gy_total: state.gy_total,
        influence: state.influence(),
        is_assassin: state.is_assassin(),
        champion_damaged: state.champion_damaged,
        fire_gy: state.fire_gy,
    };
    let plan = EffectPlan::resolve(effects, ctx);
    let damage_before = state.damage;
    apply_effect_plan_mutators(state, &plan);
    let (drawn, _memory_draw, _discarded) = realize_draws(state, &plan);

    if let Some(drawn) = drawn {
        tape.push(
            *state,
            phase,
            EventKind::OnEnterDraw,
            EventFields::default().with_drawn(drawn),
        );
    }
    if state.damage > damage_before {
        tape.push(
            *state,
            phase,
            EventKind::OnEnterDamage,
            EventFields::card(card),
        );
    }
    true
}

fn apply_effect_plan_mutators(state: &mut State, plan: &EffectPlan) {
    if plan.set_champion_damaged {
        state.champion_damaged = true;
    }
    if plan.add_prep > 0 {
        state.prep = state.prep.saturating_add(plan.add_prep);
    }
    if plan.gain_agility > 0 {
        state.agility = state.agility.saturating_add(plan.gain_agility);
    }

    if plan.damage_hits <= 1 {
        if plan.damage > 0 {
            state.add_damage(plan.damage);
        }
    } else {
        let each = plan.damage / plan.damage_hits;
        let rem = plan.damage % plan.damage_hits;
        let mut hit = 0;
        while hit < plan.damage_hits {
            let amount = each + if hit == 0 { rem } else { 0 };
            state.add_damage(amount);
            hit += 1;
        }
    }
}

fn realize_draws(
    state: &mut State,
    plan: &EffectPlan,
) -> (Option<Card>, Option<Card>, Option<Card>) {
    let mut drawn = None;
    let mut memory_draw = None;
    let mut hand_draws = 0u8;
    while hand_draws < plan.draw_hand {
        let card = state.draw_unknown();
        if drawn.is_none() {
            drawn = Some(card);
        } else if memory_draw.is_none() && plan.draw_memory == 0 {
            // Creative Shock reports the second hand draw on the memory_draw tape field.
            memory_draw = Some(card);
        }
        hand_draws += 1;
    }
    let mut mem = 0u8;
    while mem < plan.draw_memory {
        memory_draw.replace(state.draw_to_memory());
        mem += 1;
    }
    let discarded = if plan.discard_for_effect {
        state.discard_for_effect()
    } else {
        None
    };
    (drawn, memory_draw, discarded)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cards::{Cond, Effect};

    #[test]
    fn intensified_pyre_plan_respects_gy_threshold() {
        let effects = [Effect::DamageIf {
            cond: Cond::GyAtLeast(8),
            then_n: 6,
            else_n: 2,
        }];
        let low = EffectPlan::resolve(
            &effects,
            CondContext {
                gy_total: 7,
                ..CondContext::default()
            },
        );
        assert_eq!(low.damage, 2);
        assert!(!low.gy_threshold);

        let high = EffectPlan::resolve(
            &effects,
            CondContext {
                gy_total: 8,
                ..CondContext::default()
            },
        );
        assert_eq!(high.damage, 6);
        assert!(high.gy_threshold);
    }
}
