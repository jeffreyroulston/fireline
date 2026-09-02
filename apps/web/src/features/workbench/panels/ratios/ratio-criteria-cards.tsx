"use client";

import { cardImageUrl } from "@/lib/card-images";
import { CARDS, type CardId } from "@/lib/engine";
import { cn } from "@/lib/utils";
import {
  cardTileAccentClassFor,
  cardTileClass,
  cardTileLabelClass,
  cardTileMetaClass,
  cardTileTitleClass,
} from "@/lib/utils/card-classes";
import { SectionHeading } from "../../ui";
import { ratioCriteriaPanelClass } from "./shared";

const ratioCriteriaGroupsClass = "flex flex-wrap items-start gap-4";

const ratioCriteriaGroupClass =
  "grid w-fit max-w-full gap-3 border border-border bg-surface p-3.5";

const ratioCriteriaGridClass = "flex flex-wrap gap-4";

const ratioCriteriaCardClass = "grid w-[148px] shrink-0 gap-2";

const ratioCriteriaSectionLabelClass =
  "m-0 font-display text-[18px] leading-none tracking-[0.06em] text-foreground uppercase";

const ratioCriteriaThumbClass =
  "aspect-[5/7] w-full border border-border object-cover";

type CriteriaTone = "cut" | "add";

type CriteriaCardEntry = Readonly<{
  id: CardId;
  inList: number;
}>;

type CriteriaRangeGroupData = Readonly<{
  copyRange: string;
  min: number;
  max: number;
  cards: CriteriaCardEntry[];
}>;

function formatCopyRange(min: number, max: number): string {
  if (min === max) {
    return `${min} ${min === 1 ? "copy" : "copies"}`;
  }
  return `${min}–${max} copies`;
}

function cutCopyRange(
  inList: number,
  cutUpTo: number,
): Pick<CriteriaRangeGroupData, "min" | "max" | "copyRange"> {
  const min = Math.max(0, inList - cutUpTo);
  const max = inList;
  return {
    min,
    max,
    copyRange: formatCopyRange(min, max),
  };
}

function addCopyRange(inList: number, max: number): Pick<CriteriaRangeGroupData, "min" | "max" | "copyRange"> {
  return {
    min: inList,
    max,
    copyRange: formatCopyRange(inList, max),
  };
}

function groupByCopyRange<T extends { id: CardId; inList: number }>(
  rows: ReadonlyArray<T>,
  rangeFor: (row: T) => Pick<CriteriaRangeGroupData, "min" | "max" | "copyRange">,
): CriteriaRangeGroupData[] {
  const groups = new Map<string, CriteriaRangeGroupData>();

  for (const row of rows) {
    const { min, max, copyRange } = rangeFor(row);
    const existing = groups.get(copyRange);
    if (existing) {
      existing.cards.push({ id: row.id, inList: row.inList });
      continue;
    }
    groups.set(copyRange, {
      min,
      max,
      copyRange,
      cards: [{ id: row.id, inList: row.inList }],
    });
  }

  return [...groups.values()].sort(
    (a, b) => a.min - b.min || a.max - b.max || a.copyRange.localeCompare(b.copyRange),
  );
}

function RatioCriteriaCard({
  id,
  inList,
}: Readonly<{
  id: CardId;
  inList: number;
}>) {
  const card = CARDS[id];
  const src = cardImageUrl(id);
  const isFire = card.element === "fire";

  return (
    <article className={ratioCriteriaCardClass}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          className={ratioCriteriaThumbClass}
        />
      ) : (
        <div
          className={cn(
            cardTileClass(isFire),
            ratioCriteriaThumbClass,
            "pointer-events-none flex min-h-0 flex-col",
          )}
        >
          <span className={cardTileAccentClassFor(isFire)} aria-hidden />
          <span
            className={cn(cardTileLabelClass, isFire && "text-primary-dark")}
          >
            {card.element}
          </span>
          <b className={cardTileTitleClass}>{card.name}</b>
          <small className={cardTileMetaClass}>
            {card.cost} · {card.kind}
          </small>
        </div>
      )}
      <div className="grid min-w-0 gap-1">
        <b className="text-[13px] leading-snug font-semibold text-balance">
          {card.name}
        </b>
        <p className="m-0 font-mono text-[11px] leading-snug font-medium tracking-[0.02em] text-muted">
          {inList > 0 ? `${inList}× in base` : "Not in base"}
        </p>
      </div>
    </article>
  );
}

function CriteriaRangeGroup({
  copyRange,
  tone,
  cards,
}: Readonly<{
  copyRange: string;
  tone: CriteriaTone;
  cards: readonly CriteriaCardEntry[];
}>) {
  return (
    <div className={ratioCriteriaGroupClass}>
      <p
        className={cn(
          "m-0 font-display text-[20px] leading-none tracking-[0.04em]",
          tone === "cut" ? "text-secondary-dark" : "text-primary-dark",
        )}
      >
        {copyRange}
      </p>
      <div className={ratioCriteriaGridClass}>
        {cards.map((card) => (
          <RatioCriteriaCard
            key={card.id}
            id={card.id}
            inList={card.inList}
          />
        ))}
      </div>
    </div>
  );
}

type RatioCriteriaCardsProps = Readonly<{
  cutRows: ReadonlyArray<{
    id: CardId;
    inList: number;
    cutUpTo: number;
  }>;
  addRows: ReadonlyArray<{
    id: CardId;
    inList: number;
    max: number;
  }>;
}>;

export function RatioCriteriaCards({ cutRows, addRows }: RatioCriteriaCardsProps) {
  const cutGroups = groupByCopyRange(cutRows, (row) =>
    cutCopyRange(row.inList, row.cutUpTo),
  );
  const addGroups = groupByCopyRange(addRows, (row) =>
    addCopyRange(row.inList, row.max),
  );

  return (
    <div className={ratioCriteriaPanelClass}>
      <SectionHeading
        title="TEST CRITERIA"
        className="[&_strong]:font-display [&_strong]:text-[22px] [&_strong]:leading-none [&_strong]:tracking-[0.04em] [&_strong]:text-primary"
        meta={
          <strong>
            {cutRows.length} cut · {addRows.length} add
          </strong>
        }
      />
      <div className="grid gap-6">
        <section className="grid min-w-0 gap-4">
          <p className={ratioCriteriaSectionLabelClass}>Could be lowered</p>
          {cutRows.length === 0 ? (
            <p className="m-0 text-[13px] text-muted">No cut cards.</p>
          ) : (
            <div className={ratioCriteriaGroupsClass}>
              {cutGroups.map((group) => (
                <CriteriaRangeGroup
                  key={`cut-${group.copyRange}`}
                  copyRange={group.copyRange}
                  tone="cut"
                  cards={group.cards}
                />
              ))}
            </div>
          )}
        </section>
        <section className="grid min-w-0 gap-4 border-t border-border pt-6">
          <p className={ratioCriteriaSectionLabelClass}>Could be added</p>
          {addRows.length === 0 ? (
            <p className="m-0 text-[13px] text-muted">No replacement cards.</p>
          ) : (
            <div className={ratioCriteriaGroupsClass}>
              {addGroups.map((group) => (
                <CriteriaRangeGroup
                  key={`add-${group.copyRange}`}
                  copyRange={group.copyRange}
                  tone="add"
                  cards={group.cards}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
