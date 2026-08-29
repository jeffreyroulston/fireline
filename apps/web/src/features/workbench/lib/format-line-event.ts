import type { LineEvent, TapePhase } from "@ga-fire/contracts";

export type CatalogEntry = { id: string; name: string; short: string };

const PLAY_NO_ACTIVATE = new Set([
  "fiery_interference",
  "mark_the_target",
  "planted_explosive",
  "intensified_pyre",
  "vermilion_decree",
  "demolition",
  "surging_bolt",
  "ignited_stab",
  "rending_flames",
  "heated_vengeance",
  "vicious_slice",
  "uncanny_realization",
  "incapacitate",
  "undeniable_truth",
  "ignite_fate",
  "increasing_danger",
  "reduce_to_ash",
  "smoke_out",
  "spark_alight",
]);

function weaponName(id: string | null | undefined): string {
  switch (id) {
    case "impact_hammer":
      return "Impact Hammer";
    case "mercenary_blade":
      return "Mercenary's Blade";
    case "varuckan_soulknife":
      return "Varuckan Soulknife";
    case "assassins_ripper":
      return "Assassin's Ripper";
    default:
      return "No Weapon";
  }
}

const PHASE_SHORT: Record<TapePhase, string> = {
  main: "Main",
  materialize: "Mate",
  recollect: "Reco",
  agility: "Agil",
  end: "End",
  enemyMain: "EMai",
  enemyEnd: "EEnd",
  wake: "Wake",
};

function padRight(value: string, width: number): string {
  return value.length >= width ? value : value + " ".repeat(width - value.length);
}

function padLeft(value: string, width: number): string {
  return value.length >= width ? value : " ".repeat(width - value.length) + value;
}

function zoneLabel(
  ids: string[] | null | undefined,
  prefix: string,
  catalog: CatalogEntry[],
): string {
  if (!ids) {
    return "";
  }
  if (ids.length === 0) {
    return `${prefix}0`;
  }
  const shorts = ids.map((id) => catalogLookup(catalog, id).short);
  return `${prefix}${ids.length} ${shorts.join(", ")}`;
}

function catalogLookup(catalog: CatalogEntry[], id: string | null | undefined) {
  if (!id) return { name: "", short: "" };
  const entry = catalog.find((card) => card.id === id);
  return {
    name: entry?.name ?? id,
    short: entry?.short ?? id,
  };
}

/** Mirror crates/engine/src/line_event.rs `format_line_event`. */
export function formatLineEvent(
  event: LineEvent,
  catalog: CatalogEntry[],
): string {
  const name = (id: string | null | undefined) =>
    catalogLookup(catalog, id).name;
  const short = (id: string | null | undefined) =>
    catalogLookup(catalog, id).short;

  switch (event.kind) {
    case "start":
      if (event.drawn) {
        return `Start of Game (draw ${short(event.drawn)})`;
      }
      return "Start of Game";
    case "materializeHammer":
      return "Materialize Impact Hammer";
    case "materializeDagger":
      return "Materialize Poisoned Dagger";
    case "materializeSoulknife":
      return "Materialize Varuckan Soulknife (banish 3 Fire)";
    case "floatForRipper":
      return event.fromMemory
        ? "Mem Cost for Assassin's Ripper (from Mem)"
        : "Mem Cost for Assassin's Ripper (Float from GY)";
    case "materializeRipper":
      return "Materialize Assassin's Ripper";
    case "materializeRing":
      return "Materialize Grand Crusader's Ring";
    case "materializeBlade":
      return "Materialize Mercenary's Blade (prep)";
    case "floatForZander":
      if (event.fromMemory) {
        return "Mem Cost for Zander Lvl 1 (from Mem)";
      }
      return "Mem Cost for Zander Lvl 1 (Float from GY)";
    case "levelZander":
      return "Zander Lvl 1 Glimpse/Prep";
    case "floatForZander2":
      return event.fromMemory
        ? "Mem Cost for Zander Lvl 2 (from Mem ×2)"
        : "Mem Cost for Zander Lvl 2";
    case "levelZander2":
      return "Zander, Deft Executor (+2 prep)";
    case "zanderGyReturn":
      return `Zander return ${short(event.drawn)} from GY (−1 prep)`;
    case "floatForTristan":
      if (event.fromMemory) {
        return "Mem Cost for Tristan Lvl 1 (from Mem)";
      }
      return "Mem Cost for Tristan Lvl 1 (Float from GY)";
    case "levelTristan":
      return "Tristan Lvl 1 Glimpse/Prep";
    case "tristanRecollect": {
      const parts: string[] = [];
      if (event.card) parts.push(name(event.card));
      if (event.drawn) parts.push(name(event.drawn));
      if (event.discarded) parts.push(name(event.discarded));
      if (parts.length === 0) return "Tristan Recollect (Agility 3)";
      return `Tristan Recollect (Agility 3): ${parts.join(", ")}`;
    }
    case "glimpse": {
      const parts: string[] = [];
      if (event.card) parts.push(name(event.card));
      if (event.drawn) parts.push(name(event.drawn));
      if (parts.length === 0) return "Glimpse";
      return `Glimpse ${parts.length} (${parts.join(", ")})`;
    }
    case "materializeResolves":
      return "Materialization Resolves";
    case "play": {
      const cardName = name(event.card);
      let s = event.fast
        ? `Fast Activate ${cardName}`
        : PLAY_NO_ACTIVATE.has(event.card ?? "")
          ? cardName
          : `Activate ${cardName}`;

      if (event.card === "increasing_danger") {
        s =
          event.drawn && event.memoryDraw
            ? `Increasing Danger (draw ${short(event.drawn)}, memory ${short(event.memoryDraw)})`
            : "Increasing Danger";
      }
      if (event.card === "undeniable_truth" && event.drawn) {
        s = `Undeniable Truth (draw ${short(event.drawn)}, +1 prep)`;
      }
      if (event.prepared === true) {
        if (event.card === "ignited_stab") {
          s = "Ignited Stab (prepared)";
        } else if (event.card === "planted_explosive") {
          s = "Planted Explosive (prepared)";
        } else {
          s = `${s} (prepared)`;
        }
      } else if (event.prepared === false && event.card === "ignited_stab") {
        s = "Ignited Stab (no prep)";
      }
      if (event.doubled) s = "Rending Flames (Doubled)";
      if (event.heated) s = "Heated Vengeance (+3)";
      if (event.human) s = "Vicious Slice (Human)";
      if (event.gyThreshold) s = "Intensified Pyre (GY 8+)";

      if (event.imbue === true) {
        if (event.drawn) {
          s = `Vermilion Decree (Imbue, draw ${short(event.drawn)})`;
        } else if (event.card === "surging_bolt") {
          s = "Surging Bolt (Imbue)";
        } else {
          s = `${s} (Imbue)`;
        }
      }
      if (event.commandAlly) {
        s = `${s} (Command ${name(event.commandAlly)})`;
      }
      if (event.weapon) {
        if (event.card === "blazing_throw") {
          s = `Activate Blazing Throw (${weaponName(event.weapon)})`;
        } else {
          s = `${s} with ${weaponName(event.weapon)}`;
        }
      }
      if (event.kindle != null && event.kindle > 0) {
        s = `${s} (Kindle ${event.kindle})`;
      }
      if (event.bonuses) {
        const parts: string[] = [];
        if ((event.bonuses.allyAttack ?? 0) > 0) {
          parts.push(`attack +${event.bonuses.allyAttack}`);
        }
        if ((event.bonuses.unique ?? 0) > 0) {
          parts.push(`unique +${event.bonuses.unique}`);
        }
        if ((event.bonuses.arthur ?? 0) > 0) {
          parts.push(`Arthur +${event.bonuses.arthur}`);
        }
        if ((event.bonuses.hotCake ?? 0) > 0) {
          parts.push(`Hot Cake +${event.bonuses.hotCake}`);
        }
        if (parts.length > 0) {
          s = `${s} (${parts.join(", ")})`;
        }
      }
      return s;
    }
    case "activateDagger":
      return "Activate Poisoned Dagger";
    case "activateRipper":
      return "Activate Assassin's Ripper (+2 power, REST)";
    case "banishCrusaderRing":
      return event.drawn
        ? `Banish Grand Crusader's Ring (draw ${short(event.drawn)})`
        : "Banish Grand Crusader's Ring (draw)";
    case "sadiBounce":
      return "Sadi bounce for Prep";
    case "arsonistStealth":
      return "Corhazi Arsonist gains stealth (−1 prep)";
    case "onDeath":
      return event.drawn
        ? `${name(event.card)} On Death draw (${short(event.drawn)})`
        : `${name(event.card)} On Death`;
    case "uniqueDies":
      return `Unique: ${name(event.card)} dies`;
    case "sacrifice":
      return event.card
        ? `Sacrifice ${name(event.card)}`
        : "Peppered Chef sacrifice";
    case "onEnterDamage":
      return event.card === "rococo"
        ? "Rococo On-Enter damage"
        : `${name(event.card)} On-Enter damage`;
    case "onEnterDraw":
      return `Clumsy On-Enter draw (${short(event.drawn)})`;
    case "onEnterLevel":
      return `Flagrant Guide On-Enter level (self ${event.kindle ?? 6})`;
    case "immortalize":
      return "Immortalize the King";
    case "hotCakeSacrifice":
      return "Hot Cake sacrifice (+3 next attack)";
    case "chefBuff":
      return "Peppered Chef +2 POWER";
    case "allyAttack": {
      let s = `Attack from ${name(event.card)}`;
      if (event.bonuses) {
        const parts: string[] = [];
        if ((event.bonuses.arthur ?? 0) > 0) {
          parts.push(`Arthur +${event.bonuses.arthur}`);
        }
        if ((event.bonuses.hotCake ?? 0) > 0) {
          parts.push(`Hot Cake +${event.bonuses.hotCake}`);
        }
        if (parts.length > 0) {
          s = `${s} (${parts.join(", ")})`;
        }
      }
      return s;
    }
    case "weaponAttack":
      return `Attack with ${weaponName(event.weapon)}`;
    case "wieldForAttack":
      return `USE IN BELOW ATTACK (${weaponName(event.weapon)})`;
    case "cutthroatSelf":
      return "Cutthroat On-Attack self 1";
    case "onAttackDraw":
      return `On-Attack discard ${short(event.discarded)} / draw ${short(event.drawn)}`;
    case "corhaziOnHit":
      return `Corhazi On-Hit draw ${short(event.drawn)} / discard ${short(event.discarded)}`;
    case "hammerSelf":
      return "Impact Hammer self 3";
    case "passOpportunity":
      return "Main: Pass Opportunity";
    case "endAgility":
      return "End of Agility Phase";
    case "endMain":
      return "End of End Phase";
    case "enemyMain":
      return "Enemy Main Phase";
    case "wake":
      return event.phase === "wake"
        ? "End of Enemy End Phase"
        : "Wake Up Phase";
    case "recollect":
      return `Recollect (draw ${short(event.drawn)})`;
    default:
      return `${event.kind} ${event.card ?? ""}`.trim();
  }
}

/** Compact one-line tape, matching crates/engine `format_line_event_row`. */
export function formatLineEventRow(
  event: LineEvent,
  catalog: CatalogEntry[],
): string {
  const phase = PHASE_SHORT[event.phase] ?? event.phase;
  const action = formatLineEvent(event, catalog);
  const allies = event.allies?.length ?? 0;
  const memory = zoneLabel(event.memory, "MEM", catalog);
  const hand = zoneLabel(event.hand, "HAND", catalog);
  return [
    `${event.turn} ${padRight(phase, 4)}`,
    padLeft(String(event.damage), 3),
    `allies=${allies}`,
    `FireGY ${event.fireGy}`,
    padRight(action, 42),
    padRight(memory, 34),
    hand,
  ].join(" | ");
}
