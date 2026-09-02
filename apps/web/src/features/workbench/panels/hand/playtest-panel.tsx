"use client";

import { useEffect, useState } from "react";
import type {
  PlaytestAction,
  PlaytestActionOption,
  PlaytestAllyView,
  PlaytestStateView,
  PlaytestWeaponView,
} from "@ga-fire/contracts";
import type { CardId, LineEvent, MaterialId, SolveResult } from "@/lib/engine";
import { cn, buttonVariants } from "@/lib/utils";
import { SectionHeading, DamageReadout, HandCard, Turn2KillHorizon } from "../../ui";
import { OptimalLine } from "../../ui/optimal-line";
import { LineCompare } from "../../ui/line-compare";
import { BoardZones } from "./zone-hover";
import { GlimpsePicker, GLIMPSE_ZANDER_LABEL, partitionLegalActions } from "./glimpse-picker";
import { DiscardPicker, needsDiscardPicker, type DiscardPrompt } from "./discard-picker";
import { ReservePicker, resolveReserveRequirement, type ReservePrompt } from "./reserve-picker";
import type { LineHorizon, Turn2KillResults } from "../../types";

const phaseLabel: Record<string, string> = {
  main: "Main",
  materialize: "Materialize",
  preRecollect: "Pre-Recollect",
  agility: "Agility",
};

function championBoardCard(
  board: PlaytestStateView,
): MaterialId | null {
  if (board.tristanLeveled) {
    return null;
  }
  if (board.championLevel === 0) {
    return "spirit_of_fire";
  }
  return board.championLevel >= 2 ? "zander_2" : "zander_1";
}

export function PlaytestPanel({
  hand,
  board,
  events,
  legalActions,
  phase,
  busy,
  comparing,
  canUndo,
  optimalResult,
  turn2KillResults,
  lineHorizon,
  onLineHorizonChange,
  reservePrompt,
  selectedReserveIndices,
  discardPrompt,
  onStart,
  onRequestAction,
  onToggleReserveIndex,
  onConfirmReserve,
  onCancelReserve,
  onConfirmDiscard,
  onSkipDiscard,
  onCancelDiscard,
  onApply,
  onUndo,
  onFinishCompare,
  onCancelCompare,
  onReset,
}: {
  hand: CardId[];
  board: PlaytestStateView | null;
  events: LineEvent[];
  legalActions: PlaytestActionOption[];
  phase: "setup" | "playing" | "done" | "compared";
  busy: boolean;
  comparing: boolean;
  canUndo: boolean;
  optimalResult: SolveResult | null;
  turn2KillResults: Turn2KillResults | null;
  lineHorizon: LineHorizon;
  onLineHorizonChange: (horizon: LineHorizon) => void;
  reservePrompt: ReservePrompt | null;
  selectedReserveIndices: number[];
  discardPrompt: DiscardPrompt | null;
  onStart: () => void;
  onRequestAction: (option: PlaytestActionOption) => void;
  onToggleReserveIndex: (handIndex: number) => void;
  onConfirmReserve: () => void;
  onCancelReserve: () => void;
  onConfirmDiscard: (handIndex: number) => void;
  onSkipDiscard: () => void;
  onCancelDiscard: () => void;
  onApply: (action: PlaytestAction) => void;
  onUndo: () => void;
  onFinishCompare: () => void;
  onCancelCompare: () => void;
  onReset: () => void;
}) {
  const playing = phase === "playing" || phase === "done";
  const yourDamage = board?.damage ?? events.at(-1)?.damage ?? 0;
  const { glimpse: glimpseActions, other: otherLegalActions } =
    partitionLegalActions(legalActions);
  const [glimpseOpen, setGlimpseOpen] = useState(false);
  const hasGlimpseChoice = glimpseActions.length > 0;
  const showGlimpse = glimpseOpen && hasGlimpseChoice;
  const weapons = board?.weapons ?? [];
  const hotCakeCount = board?.engine.hotCake ?? 0;
  const hasDagger = board?.dagger === true;
  const championCard = board ? championBoardCard(board) : null;
  const boardPieceCount =
    (board?.allies.length ?? 0) +
    weapons.length +
    hotCakeCount +
    (hasDagger ? 1 : 0) +
    (championCard ? 1 : 0);
  const showBoard = board != null && playing;
  const lineComplete = phase === "done" && board?.terminal === true;
  useEffect(() => {
    if (!hasGlimpseChoice) {
      setGlimpseOpen(false);
    }
  }, [hasGlimpseChoice]);

  return (
    <div className="mt-7 border-t border-border pt-5">
      <SectionHeading title="PLAYTEST" />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonVariants({ intent: "primary" })}
          onClick={phase === "setup" ? onStart : onReset}
          disabled={busy}
        >
          {phase === "setup" ? "Start playtest" : "Start new playtest"}
        </button>
      </div>

      {board && playing && (
        <div className="mt-5 grid gap-4">
          <div className="grid gap-4 border border-border bg-surface px-[18px] py-[18px]">
            <div>
              <SectionHeading className="mb-2" title="HAND" meta={<strong>{board.hand.length}</strong>} />
              <div className="grid grid-cols-7 gap-2">
                {board.hand.map((id: string, index: number) => (
                  <HandCard key={`hand-${id}-${index}`} id={id as CardId} />
                ))}
              </div>
            </div>
            {board.memory.length > 0 ? (
              <div>
                <SectionHeading
                  className="mb-2"
                  title="MEMORY"
                  meta={<strong>{board.memory.length}</strong>}
                />
                <div className="grid grid-cols-7 gap-2">
                  {board.memory.map((id: string, index: number) => (
                    <HandCard key={`mem-${id}-${index}`} id={id as CardId} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          {showBoard ? (
            <div className="grid gap-4 border border-border bg-surface px-[18px] py-[18px]">
              <div>
                <SectionHeading
                  className="mb-2"
                  title={
                    <>
                      BOARD · <strong>Prep {board.prep}</strong>
                    </>
                  }
                  meta={<strong>{boardPieceCount}</strong>}
                />
                <div className="grid grid-cols-7 gap-2">
                  {championCard ? (
                    <div
                      key="champion-board"
                      title={[
                        board.championAwake ? null : "Rested",
                        board.championDamaged ? "Damaged" : null,
                        championCard === "spirit_of_fire" ? "Champion" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || undefined}
                      className="min-w-0"
                    >
                      <HandCard
                        id={championCard as CardId}
                        faded={!board.championAwake}
                      />
                    </div>
                  ) : null}
                  {board.allies.map((ally: PlaytestAllyView, index: number) => {
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
                        key={`ally-${ally.card}-${index}`}
                        title={status || undefined}
                        className="min-w-0"
                      >
                        <HandCard id={ally.card as CardId} faded={!ally.awake} />
                      </div>
                    );
                  })}
                  {weapons.map((weapon: PlaytestWeaponView, index: number) => (
                    <div
                      key={`weapon-${weapon.card}-${index}`}
                      title={`${weapon.power} power · ${weapon.durability} durability`}
                      className="min-w-0"
                    >
                      <HandCard id={weapon.card as CardId} />
                    </div>
                  ))}
                  {hasDagger ? (
                    <div
                      key="poisoned-dagger"
                      title={board.daggerReady ? "Ready to activate" : "Rested"}
                      className="min-w-0"
                    >
                      <HandCard
                        id={"poisoned_dagger" as CardId}
                        faded={!board.daggerReady}
                      />
                    </div>
                  ) : null}
                  {Array.from({ length: hotCakeCount }, (_, index) => (
                    <div
                      key={`hot-cake-${index}`}
                      title="Sacrifice with next ally for +3 ATK"
                      className="min-w-0"
                    >
                      <HandCard id="hot_cake" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
          <BoardZones
            gy={board.gy}
            banished={board.banished ?? {}}
            ringBanished={board.ringBanished ?? false}
            fireGy={board.fireGy}
            queueRemaining={board.queueRemaining}
          />
          {!board.terminal && (
            <div>
              <div className="mb-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={cn(
                    buttonVariants({ intent: "secondary" }),
                    "min-h-[50px]",
                  )}
                  onClick={onUndo}
                  disabled={busy || !canUndo}
                >
                  Undo
                </button>
              </div>
              <SectionHeading
                className="mb-2"
                title="LEGAL ACTIONS"
                meta={<strong>{legalActions.length}</strong>}
              />
              {showGlimpse && board ? (
                <GlimpsePicker
                  peek={board.glimpsePeek}
                  layouts={board.glimpseLayouts}
                  legalActions={legalActions}
                  busy={busy}
                  onApply={(action) => {
                    setGlimpseOpen(false);
                    onApply(action);
                  }}
                  onCancel={() => setGlimpseOpen(false)}
                />
              ) : null}
              {reservePrompt ? (
                <ReservePicker
                  prompt={reservePrompt}
                  selectedIndices={selectedReserveIndices}
                  busy={busy}
                  onToggle={onToggleReserveIndex}
                  onConfirm={onConfirmReserve}
                  onCancel={onCancelReserve}
                />
              ) : null}
              {discardPrompt ? (
                <DiscardPicker
                  prompt={discardPrompt}
                  selectedIndex={null}
                  busy={busy}
                  onSelect={onConfirmDiscard}
                  onSkip={onSkipDiscard}
                  onCancel={onCancelDiscard}
                />
              ) : null}
              <div
                className={cn(
                  "border border-border bg-surface p-2",
                  (showGlimpse || reservePrompt || discardPrompt) && "mt-2",
                  busy && "pointer-events-none opacity-60",
                )}
              >
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {hasGlimpseChoice && !glimpseOpen ? (
                    <li>
                      <button
                        type="button"
                        className={cn(
                          buttonVariants({ intent: "secondary" }),
                          "h-auto min-h-[38px] w-full justify-start whitespace-normal px-3 py-2 text-left text-[13px] normal-case tracking-normal",
                        )}
                        onClick={() => setGlimpseOpen(true)}
                        disabled={busy || reservePrompt != null || discardPrompt != null}
                      >
                        {GLIMPSE_ZANDER_LABEL}
                      </button>
                    </li>
                  ) : null}
                  {otherLegalActions.map((option, index) => {
                    const reserveCount = board
                      ? resolveReserveRequirement(option.action, option, board)
                          .reserveCount
                      : 0;
                    return (
                    <li key={`${option.label}-${index}`}>
                      <button
                        type="button"
                        className={cn(
                          buttonVariants({ intent: "secondary" }),
                          "h-auto min-h-[38px] w-full justify-start whitespace-normal px-3 py-2 text-left text-[13px] normal-case tracking-normal",
                        )}
                        onClick={() => onRequestAction(option)}
                        disabled={
                          busy ||
                          reservePrompt != null ||
                          discardPrompt != null ||
                          glimpseOpen
                        }
                      >
                        {option.label}
                        {reserveCount > 0 ? (
                          <span className="ml-2 font-mono text-[10px] text-muted uppercase">
                            Reserve {reserveCount}
                          </span>
                        ) : null}
                        {needsDiscardPicker(option) ? (
                          <span className="ml-2 font-mono text-[10px] text-muted uppercase">
                            {option.discardOptional ? "Discard?" : "Discard"}
                          </span>
                        ) : null}
                      </button>
                    </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          )}
          <DamageReadout
            value={yourDamage}
            detailClassName="text-[13px] tracking-[0.06em]"
            detail={
              <>
                Turn {board.turn + 1} · {phaseLabel[board.phase] ?? board.phase}
                {board.terminal ? " · Line complete" : ""}
              </>
            }
          />
          {events.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={cn(
                  buttonVariants({ intent: "primary" }),
                  "min-h-[50px]",
                  comparing && "pointer-events-none",
                )}
                onClick={onFinishCompare}
                disabled={busy || comparing}
                aria-busy={comparing}
              >
                <span className="flex items-center gap-2.5">
                  {comparing ? (
                    <span
                      className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/30 border-t-white"
                      aria-hidden
                    />
                  ) : null}
                  {comparing
                    ? "Calculating…"
                    : lineComplete
                      ? "Calculate"
                      : "End and calculate early"}
                </span>
              </button>
            </div>
          ) : null}
        </div>
      )}

      {events.length > 0 && phase !== "compared" && (
        <>
          {board?.terminal && playing ? (
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                className={cn(
                  buttonVariants({ intent: "secondary" }),
                  "min-h-[50px]",
                )}
                onClick={onUndo}
                disabled={busy || !canUndo}
              >
                Undo
              </button>
            </div>
          ) : null}
          <OptimalLine
            label="YOUR LINE"
            events={events}
            resetKey={`playtest-${events.length}-${yourDamage}`}
          />
        </>
      )}

      <div>
        {comparing && phase !== "compared" ? (
          <div className="mt-5 flex min-h-[50px] flex-wrap items-center gap-3">
            <div className="flex items-center gap-2.5 font-mono text-[13px] tracking-[0.06em] text-muted uppercase">
              <span
                className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-muted/30 border-t-muted"
                aria-hidden
              />
              Calculating optimal line…
            </div>
            <button
              type="button"
              className={buttonVariants({ intent: "secondary" })}
              onClick={onCancelCompare}
              disabled={!comparing}
            >
              Cancel
            </button>
          </div>
        ) : null}

        {phase === "compared" && optimalResult && (
          <div className="mt-5 grid gap-4">
            {turn2KillResults ? (
              <Turn2KillHorizon
                results={turn2KillResults}
                lineHorizon={lineHorizon}
                onLineHorizonChange={onLineHorizonChange}
              />
            ) : null}
            <LineCompare
              resetKey={`playtest-compare-${yourDamage}-${optimalResult.maxDamage}-${lineHorizon}`}
              openingHand={hand}
              left={{
                label: "Your line",
                damage: yourDamage,
                events,
              }}
              right={{
                label:
                  lineHorizon === 2 ? "Optimal (2 turns)" : "Optimal (3 turns)",
                damage: optimalResult.maxDamage,
                events: optimalResult.events,
                note: "Oracle solve on the same hand and draw queue.",
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
