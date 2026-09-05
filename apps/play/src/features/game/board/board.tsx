"use client";

import { useMemo, useState, type ReactNode } from "react";

import type {
  LineEvent,
  PlaytestActionOption,
  PlaytestStateView,
} from "@ga-fire/contracts";
import {
  ALLY_ROW_TARGET,
  allyTarget,
  buildActionTargetIndex,
  DAGGER_TARGET_ID,
  ENEMY_CHAMPION_ID,
  ENEMY_CHAMPION_LIFE,
  enemyChampionDefeated,
  materialCountFromMask,
  MERCENARY_BLADE_TARGET_ID,
  optionsForHandSlot,
  optionsForTarget,
  RING_TARGET,
  type IndexedActionOption,
  weaponTarget,
} from "@ga-fire/game";
import type { CardId } from "@ga-fire/game";

import { CardTile, ZonePile } from "../ui";
import { cn } from "../ui/cn";
import { EventLog } from "./event-log";
import { Hud, MaterialZone } from "./hud";
import { TargetTile } from "./target-tile";
import {
  banishCards,
  banishCount,
  championBoardCard,
  expandZoneMap,
  zoneCount,
} from "./utils";
import { AllyRowAction } from "./ally-row-action";

/** Uniform width for champion, allies, and gear on the battlefield. */
const BOARD_CARD_W = 112;
/** Layout width when a board card is rested (rotated 90°). */
const BOARD_CARD_RESTED_W = Math.round((BOARD_CARD_W * 7) / 5);

const HAND_CARD_W = 68;
const HAND_GAP = 8;
const HAND_HOVER_SCALE = 2;
/** Extra px between card centers when expanded, so scaled cards don't overlap. */
const HAND_HOVER_SPREAD =
  HAND_CARD_W * HAND_HOVER_SCALE + HAND_GAP - (HAND_CARD_W + HAND_GAP);

export type BoardProps = {
  board: PlaytestStateView;
  events: readonly LineEvent[];
  legalActions: readonly PlaytestActionOption[];
  onSelect: (option: PlaytestActionOption) => void;
  className?: string;
  /**
   * Champion duel: far-side playmat from the opponent's FiZa board + their
   * champion life. When omitted, the solo Spirit of Fire placeholder is used.
   */
  opponent?: {
    board: PlaytestStateView;
    championLife: number;
    maxLife?: number;
  } | null;
  /** Own champion life (duel HUD). Solo uses Spirit damage instead. */
  championLife?: number;
  /** Turn / life banner above the mat (duel). */
  banner?: string | null;
};

function selectFromIndex(
  onSelect: (option: PlaytestActionOption) => void,
): (entry: IndexedActionOption) => void {
  return (entry) => onSelect(entry.option);
}

function MemoryRail({
  side,
  children,
}: {
  side: "player" | "opponent";
  children?: ReactNode;
}) {
  const opponent = side === "opponent";
  return (
    <section
      aria-label={opponent ? "Opponent memory" : "Memory"}
      className={cn(
        "flex min-h-[180px] flex-col px-2",
        opponent ? "justify-start" : "justify-end",
      )}
    >
      <div
        className={cn(
          "relative flex min-h-[160px] gap-3 overflow-x-auto",
          opponent ? "items-start pt-5" : "items-end pb-5",
        )}
      >
        {children ? (
          opponent ? (
            <div className="flex gap-3 [&>*]:rotate-180">{children}</div>
          ) : (
            children
          )
        ) : (
          <div className="h-[158px] w-full" />
        )}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-0",
            opponent ? "top-0" : "bottom-0",
          )}
        >
          {opponent ? (
            <>
              <p className="mb-1 text-center font-mono text-[9px] uppercase tracking-[0.22em] text-white/70">
                Memory
              </p>
              <div className="flex items-end">
                <span className="h-2.5 w-px bg-white/75" />
                <span className="mb-0 h-px flex-1 bg-white/75" />
                <span className="h-2.5 w-px bg-white/75" />
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start">
                <span className="h-2.5 w-px bg-white/75" />
                <span className="mt-0 h-px flex-1 bg-white/75" />
                <span className="h-2.5 w-px bg-white/75" />
              </div>
              <p className="mt-1 text-center font-mono text-[9px] uppercase tracking-[0.22em] text-white/70">
                Memory
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/** Opponent side with Spirit of Fire as a placeholder champion (solo). */
function OpponentHalf({ damage }: { damage: number }) {
  const defeated = enemyChampionDefeated(damage);
  return (
    <div
      aria-label="Opponent playmat"
      className={cn(
        "grid min-h-0 flex-1",
        "grid-cols-[120px_minmax(0,1fr)_120px]",
        "grid-rows-[auto_minmax(0,1fr)]",
        "gap-x-3 gap-y-2",
      )}
    >
      {/* Left stack: GY + Main Deck just under it, then Banished toward center */}
      <div className="col-start-1 row-start-1 row-span-2 flex flex-col items-center gap-3">
        <ZonePile
          kind="graveyard"
          label="Graveyard"
          count={0}
          cards={[]}
          size="sm"
          inert
        />
        <ZonePile
          kind="deck"
          label="Main Deck"
          count={0}
          cards={[]}
          size="sm"
          inert
        />
        <div className="mt-auto flex justify-center pb-0.5">
          <ZonePile
            kind="banish"
            label="Banished"
            count={0}
            cards={[]}
            orientation="landscape"
            size="sm"
            inert
          />
        </div>
      </div>

      <div className="col-start-2 row-start-1">
        <MemoryRail side="opponent" />
      </div>

      {/* Right stack: Float + Material just under it */}
      <div className="col-start-3 row-start-1 row-span-2 flex flex-col items-center gap-3">
        <ZonePile
          kind="float"
          label="Floating Memories"
          count={0}
          cards={[]}
          size="sm"
          inert
        />
        <ZonePile
          kind="deck"
          label="Material Deck"
          count={0}
          cards={[]}
          size="sm"
          inert
        />
      </div>

      <section
        aria-label="Opponent battlefield"
        className="col-start-2 row-start-2 flex min-h-0 flex-col items-start justify-center gap-2 overflow-hidden px-2"
      >
        <div className="relative shrink-0" style={{ width: BOARD_CARD_W }}>
          <div
            className={cn(
              "rotate-180",
              defeated && "opacity-50 grayscale",
            )}
          >
            <CardTile
              id={ENEMY_CHAMPION_ID}
              title={`Spirit of Fire · ${damage} / ${ENEMY_CHAMPION_LIFE} life`}
            />
          </div>
          <span className="pointer-events-none absolute -bottom-1.5 -left-1.5 z-[2] rounded-full border border-white/25 bg-black/70 px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-white shadow-sm">
            {Math.min(damage, ENEMY_CHAMPION_LIFE)}/{ENEMY_CHAMPION_LIFE}
          </span>
          {defeated ? (
            <span className="pointer-events-none absolute inset-x-1 top-1 z-[2] rounded-sm bg-black/75 px-1 py-0.5 text-center font-mono text-[9px] uppercase tracking-wide text-primary">
              Defeated
            </span>
          ) : null}
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/35">
          Opponent
        </span>
      </section>
    </div>
  );
}

/** Far-side playmat for a real duel opponent (watch-only). */
function OpponentSeatHalf({
  board,
  championLife,
  maxLife = ENEMY_CHAMPION_LIFE,
}: {
  board: PlaytestStateView;
  championLife: number;
  maxLife?: number;
}) {
  const defeated = championLife <= 0;
  const champ = championBoardCard(board);
  const gyCards = expandZoneMap(board.gy);
  const banishPileCards = banishCards(board);

  return (
    <div
      aria-label="Opponent playmat"
      className={cn(
        "grid min-h-0 flex-1",
        "grid-cols-[120px_minmax(0,1fr)_120px]",
        "grid-rows-[auto_minmax(0,1fr)]",
        "gap-x-3 gap-y-2",
      )}
    >
      <div className="col-start-1 row-start-1 row-span-2 flex flex-col items-center gap-3">
        <ZonePile
          kind="graveyard"
          label="Graveyard"
          count={zoneCount(board.gy)}
          cards={gyCards}
          size="sm"
          inert
        />
        <ZonePile
          kind="deck"
          label="Main Deck"
          count={board.queueRemaining}
          cards={[]}
          size="sm"
          inert
        />
        <div className="mt-auto flex justify-center pb-0.5">
          <ZonePile
            kind="banish"
            label="Banished"
            count={banishCount(board)}
            cards={banishPileCards}
            orientation="landscape"
            size="sm"
            inert
          />
        </div>
      </div>

      <div className="col-start-2 row-start-1">
        <MemoryRail side="opponent">
          {board.memory.length === 0
            ? null
            : board.memory.map((id, memIndex) => (
                <div
                  key={`opp-memory-${id}-${memIndex}`}
                  className="shrink-0"
                  style={{ width: BOARD_CARD_W }}
                >
                  <CardTile id={id as CardId} title="Memory zone" />
                </div>
              ))}
        </MemoryRail>
      </div>

      <div className="col-start-3 row-start-1 row-span-2 flex flex-col items-center gap-3">
        <ZonePile
          kind="float"
          label="Floating Memories"
          count={board.floatGy}
          cards={[]}
          size="sm"
          inert
        />
        <ZonePile
          kind="deck"
          label="Material Deck"
          count={materialCountFromMask(board.engine.materials)}
          cards={[]}
          size="sm"
          inert
        />
      </div>

      <section
        aria-label="Opponent battlefield"
        className="col-start-2 row-start-2 flex min-h-0 flex-col items-start justify-center gap-2 overflow-hidden px-2"
      >
        <div className="flex max-h-full flex-wrap content-start items-start justify-start gap-2 overflow-y-auto [&>*]:rotate-180">
          {champ ? (
            <div className="relative shrink-0" style={{ width: BOARD_CARD_W }}>
              <div className={cn(defeated && "opacity-50 grayscale")}>
                <CardTile
                  id={champ}
                  title={`Opponent champion · ${championLife} / ${maxLife} life`}
                />
              </div>
              <span className="pointer-events-none absolute -bottom-1.5 -left-1.5 z-[2] rotate-180 rounded-full border border-white/25 bg-black/70 px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-white shadow-sm">
                {championLife}/{maxLife}
              </span>
            </div>
          ) : (
            <div className="relative shrink-0" style={{ width: BOARD_CARD_W }}>
              <div className={cn(defeated && "opacity-50 grayscale")}>
                <CardTile
                  id={ENEMY_CHAMPION_ID}
                  title={`Opponent · ${championLife} / ${maxLife} life`}
                />
              </div>
              <span className="pointer-events-none absolute -bottom-1.5 -left-1.5 z-[2] rotate-180 rounded-full border border-white/25 bg-black/70 px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-white shadow-sm">
                {championLife}/{maxLife}
              </span>
            </div>
          )}
          {board.allies.map((ally, allyIndex) => (
            <div
              key={`opp-ally-${ally.card}-${allyIndex}`}
              className="shrink-0"
              style={{ width: BOARD_CARD_W }}
            >
              <CardTile id={ally.card as CardId} title="Opponent ally" />
            </div>
          ))}
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/35">
          Opponent · {board.hand.length} in hand
        </span>
      </section>
    </div>
  );
}

export function Board({
  board,
  events,
  legalActions,
  onSelect,
  className,
  opponent = null,
  championLife,
  banner = null,
}: BoardProps) {
  const index = useMemo(
    () => buildActionTargetIndex(legalActions),
    [legalActions],
  );
  const onPick = selectFromIndex(onSelect);

  const championCard = championBoardCard(board);
  const weapons = board.weapons;
  const hotCakeCount = board.engine.hotCake;
  const hasDagger = board.dagger;
  const showRing = board.ring;
  const mercenaryOptions = optionsForTarget(
    index,
    weaponTarget(MERCENARY_BLADE_TARGET_ID),
  );
  const showMercenaryBlade =
    mercenaryOptions.length > 0 ||
    weapons.some((w) => w.card === MERCENARY_BLADE_TARGET_ID);
  const equippedWeaponIds = new Set(weapons.map((w) => w.card));

  const gyCards = expandZoneMap(board.gy);
  const banishPileCards = banishCards(board);
  const [handHot, setHandHot] = useState(false);
  const handCenter = (board.hand.length - 1) / 2;

  return (
    <div
      className={cn(
        "relative flex h-[100dvh] flex-col overflow-hidden bg-[#050607]",
        className,
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden p-3 pb-2">
        <div
          className={cn(
            "relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-sm border border-white/25",
            "bg-[#08090a] p-3",
          )}
        >
          {/* Corner textures */}
          <div
            aria-hidden
            className="pointer-events-none absolute top-3 left-3 h-14 w-14 opacity-40 [background-image:repeating-linear-gradient(-45deg,transparent,transparent_5px,rgba(255,255,255,0.14)_5px,rgba(255,255,255,0.14)_6px)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute right-3 bottom-3 h-16 w-16 opacity-35 [background-image:radial-gradient(rgba(255,255,255,0.4)_1px,transparent_1px)] [background-size:7px_7px]"
          />

          {banner ? (
            <p className="mb-2 text-center font-mono text-[11px] uppercase tracking-[0.16em] text-accent">
              {banner}
            </p>
          ) : null}

          {opponent ? (
            <OpponentSeatHalf
              board={opponent.board}
              championLife={opponent.championLife}
              maxLife={opponent.maxLife}
            />
          ) : (
            <OpponentHalf damage={board.damage} />
          )}

          <div
            aria-hidden
            className="my-2 h-px shrink-0 bg-gradient-to-r from-transparent via-white/25 to-transparent"
          />

          {/* Player half — decks stacked just above float / graveyard */}
          <div
            aria-label="Your playmat"
            className={cn(
              "grid min-h-0 flex-1",
              "grid-cols-[120px_minmax(0,1fr)_120px]",
              "grid-rows-[minmax(0,1fr)_auto]",
              "gap-x-3 gap-y-2",
            )}
          >
            {/* Left stack: Material just above Floating Memories */}
            <div className="col-start-1 row-start-1 row-span-2 flex flex-col items-center justify-end gap-3">
              <MaterialZone
                board={board}
                index={index}
                onSelect={onPick}
                playmat
                size="sm"
              />
              <ZonePile
                kind="float"
                label="Floating Memories"
                count={board.floatGy}
                cards={[]}
                size="sm"
              />
            </div>

            <section
              aria-label="Battlefield"
              className="col-start-2 row-start-1 flex min-h-0 flex-col gap-2 overflow-hidden px-2"
            >
              <div className="flex shrink-0 justify-start">
                <AllyRowAction
                  options={optionsForTarget(index, ALLY_ROW_TARGET)}
                  onSelect={onPick}
                />
              </div>

              <div className="flex min-h-0 flex-1 flex-wrap content-center items-center justify-start gap-3 overflow-y-auto">
                {championCard ? (
                  <div
                    className="flex shrink-0 items-center justify-center"
                    style={
                      board.championAwake
                        ? { width: BOARD_CARD_W }
                        : {
                            width: BOARD_CARD_RESTED_W,
                            height: BOARD_CARD_W,
                          }
                    }
                  >
                    <div
                      className={cn(
                        "relative transition-transform duration-200 ease-out",
                        !board.championAwake && "rotate-90",
                      )}
                      style={{ width: BOARD_CARD_W }}
                    >
                      <CardTile
                        id={championCard}
                        title={[
                          `Champion Lv ${board.championLevel}`,
                          !board.championAwake ? "Rested" : null,
                          board.championDamaged ? "Damaged" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      />
                      <span className="pointer-events-none absolute -top-1.5 -right-1.5 z-[2] rounded-full border border-white/25 bg-black/70 px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-white shadow-sm">
                        Lv {board.championLevel}
                      </span>
                    </div>
                  </div>
                ) : null}

                {board.allies.map((ally, allyIndex) => {
                  const status = [
                    !ally.awake ? "Rested" : null,
                    ally.attackBuff > 0 ? `+${ally.attackBuff} ATK` : null,
                    ally.stealth ? "Stealth" : null,
                    ally.immortal ? "Immortal" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ");

                  return (
                    <div
                      key={`ally-${ally.card}-${allyIndex}`}
                      className="flex shrink-0 items-center justify-center"
                      style={
                        ally.awake
                          ? { width: BOARD_CARD_W }
                          : {
                              width: BOARD_CARD_RESTED_W,
                              height: BOARD_CARD_W,
                            }
                      }
                    >
                      <div
                        className={cn(
                          "transition-transform duration-200 ease-out",
                          !ally.awake && "rotate-90",
                        )}
                        style={{ width: BOARD_CARD_W }}
                      >
                        <TargetTile
                          id={ally.card as CardId}
                          title={status || undefined}
                          options={optionsForTarget(
                            index,
                            allyTarget(allyIndex),
                          )}
                          onSelect={onPick}
                        />
                      </div>
                    </div>
                  );
                })}

                {weapons.map((weapon, weaponIndex) => (
                  <div
                    key={`weapon-${weapon.card}-${weaponIndex}`}
                    className="shrink-0"
                    style={{ width: BOARD_CARD_W }}
                  >
                    <TargetTile
                      id={weapon.card as CardId}
                      title={`${weapon.power} power · ${weapon.durability} durability`}
                      options={optionsForTarget(
                        index,
                        weaponTarget(weapon.card),
                      )}
                      onSelect={onPick}
                    />
                  </div>
                ))}

                {hasDagger ? (
                  <div
                    className="flex shrink-0 items-center justify-center"
                    style={
                      board.daggerReady
                        ? { width: BOARD_CARD_W }
                        : {
                            width: BOARD_CARD_RESTED_W,
                            height: BOARD_CARD_W,
                          }
                    }
                  >
                    <div
                      className={cn(
                        "transition-transform duration-200 ease-out",
                        !board.daggerReady && "rotate-90",
                      )}
                      style={{ width: BOARD_CARD_W }}
                    >
                      <TargetTile
                        id={DAGGER_TARGET_ID as CardId}
                        title={
                          board.daggerReady ? "Ready to activate" : "Rested"
                        }
                        options={optionsForTarget(
                          index,
                          weaponTarget(DAGGER_TARGET_ID),
                        )}
                        onSelect={onPick}
                      />
                    </div>
                  </div>
                ) : null}

                {showMercenaryBlade &&
                !equippedWeaponIds.has(MERCENARY_BLADE_TARGET_ID) ? (
                  <div className="shrink-0" style={{ width: BOARD_CARD_W }}>
                    <TargetTile
                      id={MERCENARY_BLADE_TARGET_ID as CardId}
                      title="Mercenary's Blade"
                      options={mercenaryOptions}
                      onSelect={onPick}
                    />
                  </div>
                ) : null}

                {Array.from({ length: hotCakeCount }, (_, cakeIndex) => (
                  <div
                    key={`hot-cake-${cakeIndex}`}
                    className="shrink-0"
                    style={{ width: BOARD_CARD_W }}
                  >
                    <CardTile
                      id="hot_cake"
                      title="Sacrifice with next ally for +3 ATK"
                    />
                  </div>
                ))}

                {showRing ? (
                  <div className="shrink-0" style={{ width: BOARD_CARD_W }}>
                    <TargetTile
                      id={"grand_crusaders_ring" as CardId}
                      title="Grand Crusader's Ring"
                      options={optionsForTarget(index, RING_TARGET)}
                      onSelect={onPick}
                    />
                  </div>
                ) : optionsForTarget(index, RING_TARGET).length > 0 ? (
                  <div className="shrink-0" style={{ width: BOARD_CARD_W }}>
                    <TargetTile
                      id={"grand_crusaders_ring" as CardId}
                      title="Ring actions"
                      options={optionsForTarget(index, RING_TARGET)}
                      onSelect={onPick}
                    />
                  </div>
                ) : null}
              </div>
            </section>

            {/* Right stack: Banished, then Main Deck just above Graveyard */}
            <div className="col-start-3 row-start-1 row-span-2 flex flex-col items-center gap-1.5">
              <div className="flex justify-center pt-0.5">
                <ZonePile
                  kind="banish"
                  label="Banished"
                  count={banishCount(board)}
                  cards={banishPileCards}
                  orientation="landscape"
                  size="sm"
                />
              </div>
              <div className="mt-auto flex flex-col items-center gap-3">
                <ZonePile
                  kind="deck"
                  label="Main Deck"
                  count={board.queueRemaining}
                  cards={[]}
                  size="sm"
                />
                <ZonePile
                  kind="graveyard"
                  label="Graveyard"
                  count={zoneCount(board.gy)}
                  cards={gyCards}
                  size="sm"
                />
              </div>
            </div>

            <div className="col-start-2 row-start-2">
              <MemoryRail side="player">
                {board.memory.length === 0
                  ? null
                  : board.memory.map((id, memIndex) => (
                      <div
                        key={`memory-${id}-${memIndex}`}
                        className="shrink-0"
                        style={{ width: BOARD_CARD_W }}
                      >
                        <CardTile id={id as CardId} title="Memory zone" />
                      </div>
                    ))}
              </MemoryRail>
            </div>
          </div>
        </div>

        <section
          aria-label="Hand"
          className="relative z-30 mt-2 shrink-0 overflow-visible border border-white/15 bg-black/50 px-3 py-2"
          onMouseEnter={() => setHandHot(true)}
          onMouseLeave={() => setHandHot(false)}
        >
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/70">
              Hand
            </h3>
            <span className="font-mono text-[10px] uppercase tracking-wide text-white/45">
              {board.hand.length} cards
            </span>
          </div>
          <div
            className="flex justify-center overflow-visible"
            style={{ gap: HAND_GAP }}
          >
            {board.hand.map((id, slot) => {
              const spreadX = (slot - handCenter) * HAND_HOVER_SPREAD;
              return (
                <div
                  key={`hand-${id}-${slot}`}
                  className={cn(
                    "relative shrink-0 origin-bottom",
                    "transition-transform duration-200 ease-out",
                    handHot && "z-10",
                    "hover:z-20",
                  )}
                  style={{
                    width: HAND_CARD_W,
                    transform: handHot
                      ? `translateX(${spreadX}px) scale(${HAND_HOVER_SCALE})`
                      : "translateX(0) scale(1)",
                  }}
                >
                  <TargetTile
                    id={id as CardId}
                    options={optionsForHandSlot(index, board.hand, slot)}
                    onSelect={onPick}
                  />
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <Hud
        board={board}
        index={index}
        onSelect={onPick}
        championLife={championLife}
        opponentLife={opponent?.championLife}
      />
      <EventLog events={events} />
    </div>
  );
}
