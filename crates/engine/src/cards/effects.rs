//! Composable effect primitives (SabberStone/Fireplace-style tasks).

/// Condition evaluated against apply context / board state.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Cond {
    Prepared,
    Imbued,
    GyAtLeast(u8),
    InfluenceAtMost(u8),
    IsAssassin,
    ChampionDamaged,
    FireGyAtLeast(u8),
}

/// Mechanical effect applied by the rules layer.
///
/// Prefer adding a primitive here when a second card needs the same verb.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Effect {
    /// Deal N scored damage once.
    Damage(u8),
    /// Deal `then_n` if `cond`, else `else_n`.
    DamageIf {
        cond: Cond,
        then_n: u8,
        else_n: u8,
    },
    /// Deal `amount` damage `times` times (e.g. Flurry for per-hit dagger).
    DamageRepeated { amount: u8, times: u8 },
    /// Draw one unknown card to hand.
    Draw,
    /// Draw one unknown card to hand when `cond` holds.
    DrawIf { cond: Cond },
    /// Draw one unknown card into memory.
    DrawToMemory,
    /// Solver discard-for-effect (Creative Shock).
    DiscardForEffect,
    /// Add N prep counters.
    AddPrep(u8),
    /// Add N prep when `cond` holds.
    AddPrepIf { cond: Cond, n: u8 },
    /// Mark our champion as damaged (enables Heated Vengeance, etc.).
    SetChampionDamaged,
    /// Gain N agility.
    GainAgility(u8),
}

/// Board facts needed to evaluate [`Cond`] without borrowing full `State` in the cards crate.
#[derive(Clone, Copy, Debug, Default)]
pub struct CondContext {
    pub prepared: bool,
    pub imbued: bool,
    pub gy_total: u8,
    pub influence: u8,
    pub is_assassin: bool,
    pub champion_damaged: bool,
    pub fire_gy: u8,
}

impl CondContext {
    pub const fn eval(self, cond: Cond) -> bool {
        match cond {
            Cond::Prepared => self.prepared,
            Cond::Imbued => self.imbued,
            Cond::GyAtLeast(n) => self.gy_total >= n,
            Cond::InfluenceAtMost(n) => self.influence <= n,
            Cond::IsAssassin => self.is_assassin,
            Cond::ChampionDamaged => self.champion_damaged,
            Cond::FireGyAtLeast(n) => self.fire_gy >= n,
        }
    }
}

/// Result of resolving a sequence of effects (before mutating draws that need `State`).
#[derive(Clone, Copy, Debug, Default)]
pub struct EffectPlan {
    pub damage: u8,
    pub damage_hits: u8,
    pub draw_hand: u8,
    pub draw_memory: u8,
    pub discard_for_effect: bool,
    pub add_prep: u8,
    pub set_champion_damaged: bool,
    pub gain_agility: u8,
    pub gy_threshold: bool,
}

impl EffectPlan {
    pub const fn resolve(effects: &[Effect], ctx: CondContext) -> Self {
        let mut plan = Self {
            damage: 0,
            damage_hits: 0,
            draw_hand: 0,
            draw_memory: 0,
            discard_for_effect: false,
            add_prep: 0,
            set_champion_damaged: false,
            gain_agility: 0,
            gy_threshold: false,
        };
        let mut index = 0;
        while index < effects.len() {
            match effects[index] {
                Effect::Damage(n) => {
                    plan.damage = plan.damage.saturating_add(n);
                    plan.damage_hits = plan.damage_hits.saturating_add(1);
                }
                Effect::DamageIf {
                    cond,
                    then_n,
                    else_n,
                } => {
                    let n = if ctx.eval(cond) { then_n } else { else_n };
                    if n > 0 {
                        plan.damage = plan.damage.saturating_add(n);
                        plan.damage_hits = plan.damage_hits.saturating_add(1);
                        if matches!(cond, Cond::GyAtLeast(_)) && ctx.eval(cond) {
                            plan.gy_threshold = true;
                        }
                    }
                }
                Effect::DamageRepeated { amount, times } => {
                    let mut hit = 0;
                    while hit < times {
                        plan.damage = plan.damage.saturating_add(amount);
                        plan.damage_hits = plan.damage_hits.saturating_add(1);
                        hit += 1;
                    }
                }
                Effect::Draw => plan.draw_hand = plan.draw_hand.saturating_add(1),
                Effect::DrawIf { cond } => {
                    if ctx.eval(cond) {
                        plan.draw_hand = plan.draw_hand.saturating_add(1);
                    }
                }
                Effect::DrawToMemory => plan.draw_memory = plan.draw_memory.saturating_add(1),
                Effect::DiscardForEffect => plan.discard_for_effect = true,
                Effect::AddPrep(n) => plan.add_prep = plan.add_prep.saturating_add(n),
                Effect::AddPrepIf { cond, n } => {
                    if ctx.eval(cond) {
                        plan.add_prep = plan.add_prep.saturating_add(n);
                    }
                }
                Effect::SetChampionDamaged => plan.set_champion_damaged = true,
                Effect::GainAgility(n) => plan.gain_agility = plan.gain_agility.saturating_add(n),
            }
            index += 1;
        }
        plan
    }
}
