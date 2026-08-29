"use client";

import {
  CARD_LIST,
  isPlayableDeckCard,
  type CardId,
  type SimType,
} from "@/lib/engine";
import type { SavedDeck } from "@/lib/decks";
import { cn, pillTabListClass, pillTabVariants } from "@/lib/utils";
import { buttonVariants } from "@/lib/utils/variants";
import {
  ActionBar,
  DeckPicker,
  RunSettings,
  SearchableSelect,
  SectionHeading,
} from "../../ui";
import type { SolverMode } from "../../types";
import { OPENING_HAND_SIZE } from "../../utils";
import { CardStrip } from "./card-strip";
import { SOLVER_MODES } from "./shared";

const toolbarClass =
  "mt-[18px] flex items-end gap-3 max-[620px]:flex-col max-[620px]:items-stretch";

const toolbarActionsClass =
  "flex flex-wrap items-center gap-x-2.5 gap-y-1 max-[620px]:w-full";

export function HandBuilder({
  hand,
  drawn,
  solverMode,
  selectedCard,
  decks,
  activeDeck,
  recognizedDeckCount,
  remainingCount,
  shuffled,
  seed,
  goFirst,
  turns,
  simType,
  rollouts,
  busy,
  onHandChange,
  onDrawnChange,
  onSolverModeChange,
  onSelectedCardChange,
  onSwitchDeck,
  onDrawRandomHand,
  onDrawCard,
  onShuffleDeck,
  onGoFirstChange,
  onTurnsChange,
  onSimTypeChange,
  onRolloutsChange,
  onSolve,
  onCancel,
  decksLoading = false,
}: {
  hand: CardId[];
  drawn: CardId[];
  solverMode: SolverMode;
  selectedCard: CardId;
  decks: SavedDeck[];
  activeDeck: SavedDeck | null;
  recognizedDeckCount: number;
  remainingCount: number;
  shuffled: boolean;
  seed: number;
  goFirst: boolean;
  turns: number;
  simType: SimType;
  rollouts: number;
  busy: boolean;
  onHandChange: (hand: CardId[]) => void;
  onDrawnChange: (drawn: CardId[]) => void;
  onSolverModeChange: (mode: SolverMode) => void;
  onSelectedCardChange: (id: CardId) => void;
  onSwitchDeck: (deckId: string) => void;
  onDrawRandomHand: () => void;
  onDrawCard: () => void;
  onShuffleDeck: () => void;
  onGoFirstChange: (value: boolean) => void;
  onTurnsChange: (value: number) => void;
  onSimTypeChange: (value: SimType) => void;
  onRolloutsChange: (value: number) => void;
  onSolve: () => void;
  onCancel: () => void;
  decksLoading?: boolean;
}) {
  const isDeckMode = solverMode === "deck";
  const canDrawHand =
    decks.length > 0 && recognizedDeckCount >= OPENING_HAND_SIZE;
  const canDrawCard = remainingCount > 0;
  const playableCards = CARD_LIST.filter(isPlayableDeckCard).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return (
    <div className="flex flex-col gap-9">
      <div className="min-w-0">
        <div
          className={cn(pillTabListClass, "mb-[22px]")}
          role="tablist"
          aria-label="Hand solver mode"
        >
          {SOLVER_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              role="tab"
              aria-selected={solverMode === mode.id}
              className={pillTabVariants({ active: solverMode === mode.id })}
              onClick={() => onSolverModeChange(mode.id)}
            >
              {mode.label}
            </button>
          ))}
        </div>

        <SectionHeading
          title="OPENING HAND"
          meta={<strong>{hand.length} cards</strong>}
        />
        <CardStrip
          ids={hand}
          ariaLabel="Selected opening hand"
          empty="Draw from a saved deck or add cards below."
          onRemove={(index) =>
            onHandChange(hand.filter((_, itemIndex) => itemIndex !== index))
          }
        />

        <div className={toolbarClass}>
          <DeckPicker
            label="Draw from deck"
            decks={decks}
            value={activeDeck?.id ?? ""}
            onChange={onSwitchDeck}
            loading={decksLoading}
          />
          <div className={toolbarActionsClass}>
            <button
              className={cn(
                buttonVariants({ intent: "secondary" }),
                "whitespace-nowrap max-[620px]:w-full",
              )}
              type="button"
              onClick={onDrawRandomHand}
              disabled={!canDrawHand}
              title={
                canDrawHand
                  ? `Shuffle with a new seed and draw ${OPENING_HAND_SIZE}`
                  : `Need a saved deck with at least ${OPENING_HAND_SIZE} recognized cards`
              }
            >
              Draw random hand
            </button>
            <button
              className={cn(
                buttonVariants({ intent: "secondary" }),
                "whitespace-nowrap max-[620px]:w-full",
              )}
              type="button"
              onClick={onShuffleDeck}
              disabled={!canDrawHand}
              title={
                canDrawHand
                  ? "Shuffle with a new seed and deal a new opening hand"
                  : `Need a saved deck with at least ${OPENING_HAND_SIZE} recognized cards`
              }
            >
              Shuffle deck
            </button>
          </div>
        </div>

        {isDeckMode && (
          <div className="mt-7 border-t border-border pt-5">
            <SectionHeading
              title="DRAWN"
              meta={
                <strong>
                  {drawn.length} drawn · {remainingCount} left
                </strong>
              }
            />
            <CardStrip
              ids={drawn}
              ariaLabel="Cards drawn after the opening hand"
              empty="Draw the next card from the remaining pile."
              onRemove={(index) => onDrawnChange(drawn.slice(0, index))}
            />
            <div className={cn(toolbarClass, "mt-3")}>
              <button
                className={cn(
                  buttonVariants({ intent: "secondary" }),
                  "whitespace-nowrap max-[620px]:w-full",
                )}
                type="button"
                onClick={onDrawCard}
                disabled={!canDrawCard}
                title={
                  canDrawCard
                    ? "Draw the next card from the remaining pile"
                    : "No cards left in the deck"
                }
              >
                Draw card
              </button>
            </div>
          </div>
        )}

        <div className="mt-[18px] flex items-end gap-3 max-[620px]:flex-col max-[620px]:items-stretch">
          <SearchableSelect
            label="Add card"
            options={playableCards.map((card) => ({
              value: card.id,
              label: card.name,
              keywords: `${card.short ?? ""} ${card.id}`,
            }))}
            value={selectedCard}
            onChange={(id) => onSelectedCardChange(id as CardId)}
            placeholder="Search cards…"
          />
          <button
            className={cn(
              buttonVariants({ intent: "secondary" }),
              "max-[620px]:w-full",
            )}
            type="button"
            onClick={() =>
              onHandChange(hand.length < 8 ? [...hand, selectedCard] : hand)
            }
          >
            Add to hand
          </button>
          {isDeckMode && (
            <button
              className={cn(
                buttonVariants({ intent: "secondary" }),
                "max-[620px]:w-full",
              )}
              type="button"
              onClick={() => onDrawnChange([...drawn, selectedCard])}
              disabled={!shuffled}
              title={
                shuffled
                  ? "Take the first remaining copy of this card from the pile"
                  : "Shuffle the deck before adding to drawn"
              }
            >
              Add to drawn
            </button>
          )}
        </div>
        <RunSettings
          goFirst={goFirst}
          turns={turns}
          simType={simType}
          rollouts={rollouts}
          seed={shuffled ? seed : undefined}
          orderedPile={isDeckMode && shuffled}
          onFirstChange={onGoFirstChange}
          onTurnsChange={onTurnsChange}
          onSimTypeChange={onSimTypeChange}
          onRolloutsChange={onRolloutsChange}
        />
        <ActionBar
          label="Calculate maximum damage"
          busy={busy}
          onRun={onSolve}
          onCancel={onCancel}
        />
      </div>
    </div>
  );
}
