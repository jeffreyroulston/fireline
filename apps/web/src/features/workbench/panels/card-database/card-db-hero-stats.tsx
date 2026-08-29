"use client";

import type { CardDatabaseCard } from "@/lib/api/client";
import { formatKindLabel } from "./formatters";
import {
  cardDbHeroBadgeClass,
  cardDbHeroBadgeLabelClass,
  cardDbHeroCombatClass,
  cardDbHeroCombatDdClass,
  cardDbHeroCombatDtClass,
  cardDbHeroCombatItemClass,
  cardDbHeroStatRowClass,
  cardDbHeroStatsClass,
  cardDbHeroTraitClass,
  cardDbHeroTraitsClass,
} from "./shared";

export function cardTraitLines(card: CardDatabaseCard): string[] {
  const traits: string[] = [];
  if (card.unique) traits.push("Unique");
  if (card.stealth) traits.push("Stealth");
  if (card.floatingMemory) traits.push("Floating Memory");
  if (card.assassinPowerBonus) {
    traits.push(`Assassin +${card.assassinPowerBonus} power`);
  }
  if (card.assassinStealth) traits.push("Assassin Stealth");
  if (card.automaton) traits.push("Automaton");
  if (card.fast) traits.push("Fast");
  if (card.kindle) traits.push(`Kindle ${card.kindle}`);
  if (card.prepare) traits.push(`Prepare ${card.prepare}`);
  return traits;
}

export interface CardDbHeroStatsProps {
  readonly card: CardDatabaseCard;
}

export function CardDbHeroStats({ card }: CardDbHeroStatsProps) {
  const traits = cardTraitLines(card);
  const isFire = card.element === "fire";

  return (
    <div className={cardDbHeroStatsClass}>
      <div className={cardDbHeroStatRowClass}>
        <span className={cardDbHeroBadgeClass()}>
          <span className={cardDbHeroBadgeLabelClass()}>Cost</span>
          {card.cost}
        </span>
        <span className={cardDbHeroBadgeClass()}>
          <span className={cardDbHeroBadgeLabelClass()}>Kind</span>
          {formatKindLabel(card.kind)}
        </span>
        <span className={cardDbHeroBadgeClass(isFire)}>
          <span className={cardDbHeroBadgeLabelClass(isFire)}>Element</span>
          {card.element}
        </span>
      </div>
      {card.power != null && card.life != null ? (
        <dl className={cardDbHeroCombatClass}>
          <div className={cardDbHeroCombatItemClass}>
            <dt className={cardDbHeroCombatDtClass}>Power</dt>
            <dd className={cardDbHeroCombatDdClass}>{card.power}</dd>
          </div>
          <div className={cardDbHeroCombatItemClass}>
            <dt className={cardDbHeroCombatDtClass}>Life</dt>
            <dd className={cardDbHeroCombatDdClass}>{card.life}</dd>
          </div>
        </dl>
      ) : null}
      {traits.length > 0 ? (
        <ul className={cardDbHeroTraitsClass}>
          {traits.map((trait) => (
            <li key={trait} className={cardDbHeroTraitClass}>
              {trait}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
