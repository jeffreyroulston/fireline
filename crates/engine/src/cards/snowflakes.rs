//! Card-specific hooks that are not expressible as catalog keywords / effects.
//!
//! Prefer adding a [`crate::cards::Effect`] or [`crate::cards::Keyword`] when a
//! second card needs the same behavior. Keep FiZa / engine policy here.

/// Documented snowflake sites in [`crate::rules::apply`] (and related):
///
/// - **Arthur** — immortal ally + unique ready gating for other allies
/// - **BlazingThrow** — dedicated `Action` / weapon targeting (not `PlayAction`)
/// - **PackageCourier** — optional discard → draw on enter
/// - **FlagrantGuide** — level-material choice on enter
/// - **PepperedChef** — sacrifice-tied agility / attack buffs
/// - **HotCake** — item counter + sacrifice buff on ally play
/// - **HastyMessenger / RedHare** — on-attack discard → draw
/// - **CaptivatingCutthroat / CorhaziCourier** — assassin-class attack side effects
/// - **IgnitedStab / RendingFlames / HeatedVengeance / ViciousSlice** — attack math specials
/// - **RedHare** power gate in [`crate::model::State::ally_power`]
///
/// Action damage and simple ETBs (Clumsy Apprentice, Rococo, burn actions) live in
/// [`crate::cards::catalog`] `on_play` / `on_enter` effect lists.
pub mod sites {}
