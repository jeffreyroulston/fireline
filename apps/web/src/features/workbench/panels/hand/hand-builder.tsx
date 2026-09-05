"use client";

import { type ReactNode, useState } from "react";
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
import type { ImportedLine } from "../../lib/import-line-tape";
import { OPENING_HAND_SIZE } from "../../utils";
import { CardStrip } from "./card-strip";
import { LineImporter } from "./line-importer";
import { SOLVER_MODES } from "./shared";

const toolbarClass =
  "mt-[18px] flex items-end gap-3 max-[620px]:flex-col max-[620px]:items-stretch";

const toolbarActionsClass =
  "flex flex-wrap items-center gap-x-2.5 gap-y-1 max-[620px]:w-full";

export function HandBuilder({
  hand,
  solverMode,
  selectedCard,
  decks,
  activeDeck,
  recognizedDeckCount,
  shuffled,
  seed,
  goFirst,
  turns,
  turn2KillEnabled,
  turn2KillThreshold,
  simType,
  rollouts,
  cpuCount,
  maxThreads,
  glimpseEnabled,
  maxHandDurationSecs,
  maxCardDraw,
  exhaustiveReservation,
  busy,
  onHandChange,
  onSolverModeChange,
  onSelectedCardChange,
  onSwitchDeck,
  onDrawRandomHand,
  onShuffleDeck,
  onGoFirstChange,
  onTurnsChange,
  onTurn2KillEnabledChange,
  onTurn2KillThresholdChange,
  onSimTypeChange,
  onRolloutsChange,
  onMaxThreadsChange,
  onGlimpseEnabledChange,
  onMaxHandDurationSecsChange,
  onMaxCardDrawChange,
  onExhaustiveReservationChange,
  onSeedChange,
  onSolve,
  onCancel,
  onImportLine,
  decksLoading = false,
  playtestPanel,
}: {
  hand: CardId[];
  solverMode: SolverMode;
  selectedCard: CardId;
  decks: SavedDeck[];
  activeDeck: SavedDeck | null;
  recognizedDeckCount: number;
  shuffled: boolean;
  seed: number;
  goFirst: boolean;
  turns: number;
  turn2KillEnabled: boolean;
  turn2KillThreshold: number;
  simType: SimType;
  rollouts: number;
  cpuCount?: number;
  maxThreads: number | null;
  glimpseEnabled: boolean;
  maxHandDurationSecs: number | null;
  maxCardDraw: number | null;
  exhaustiveReservation: boolean;
  busy: boolean;
  onHandChange: (hand: CardId[]) => void;
  onSolverModeChange: (mode: SolverMode) => void;
  onSelectedCardChange: (id: CardId) => void;
  onSwitchDeck: (deckId: string) => void;
  onDrawRandomHand: () => void;
  onShuffleDeck: () => void;
  onGoFirstChange: (value: boolean) => void;
  onTurnsChange: (value: number) => void;
  onTurn2KillEnabledChange: (value: boolean) => void;
  onTurn2KillThresholdChange: (value: number) => void;
  onSimTypeChange: (value: SimType) => void;
  onRolloutsChange: (value: number) => void;
  onMaxThreadsChange: (value: number | null) => void;
  onGlimpseEnabledChange: (value: boolean) => void;
  onMaxHandDurationSecsChange: (value: number | null) => void;
  onMaxCardDrawChange: (value: number | null) => void;
  onExhaustiveReservationChange: (value: boolean) => void;
  onSeedChange: (value: number | null) => void;
  onSolve: () => void;
  onCancel: () => void;
  onImportLine: (line: ImportedLine) => void;
  decksLoading?: boolean;
  playtestPanel?: ReactNode;
}) {
  const isPileMode = solverMode === "deck" || solverMode === "playtest";
  const isPlaytestMode = solverMode === "playtest";
  const [importOpen, setImportOpen] = useState(false);
  const canDrawHand =
    decks.length > 0 && recognizedDeckCount >= OPENING_HAND_SIZE;
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
                  ? "Shuffle with a new seed and keep the opening hand"
                  : `Need a saved deck with at least ${OPENING_HAND_SIZE} recognized cards`
              }
            >
              Shuffle deck
            </button>
            <button
              className={cn(
                buttonVariants({ intent: "secondary" }),
                "whitespace-nowrap max-[620px]:w-full",
              )}
              type="button"
              aria-expanded={importOpen}
              onClick={() => setImportOpen((current) => !current)}
            >
              Import line
            </button>
          </div>
        </div>

        {importOpen && (
          <div className="mt-[18px]">
            <LineImporter
              open={importOpen}
              onOpenChange={setImportOpen}
              onImport={onImportLine}
            />
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
        </div>
        <RunSettings
          goFirst={goFirst}
          turns={turns}
          turn2KillEnabled={turn2KillEnabled}
          turn2KillThreshold={turn2KillThreshold}
          simType={simType}
          rollouts={rollouts}
          seed={seed}
          orderedPile={isPileMode && shuffled}
          playtestMode={isPlaytestMode}
          cpuCount={cpuCount}
          maxThreads={maxThreads}
          glimpseEnabled={glimpseEnabled}
          maxHandDurationSecs={maxHandDurationSecs}
          maxCardDraw={maxCardDraw}
          exhaustiveReservation={exhaustiveReservation}
          onFirstChange={onGoFirstChange}
          onTurnsChange={onTurnsChange}
          onTurn2KillEnabledChange={onTurn2KillEnabledChange}
          onTurn2KillThresholdChange={onTurn2KillThresholdChange}
          onSimTypeChange={onSimTypeChange}
          onRolloutsChange={onRolloutsChange}
          onMaxThreadsChange={onMaxThreadsChange}
          onGlimpseEnabledChange={onGlimpseEnabledChange}
          onMaxHandDurationSecsChange={onMaxHandDurationSecsChange}
          onMaxCardDrawChange={onMaxCardDrawChange}
          onExhaustiveReservationChange={onExhaustiveReservationChange}
          onSeedChange={onSeedChange}
        />
        {!isPlaytestMode && (
          <ActionBar
            label="Calculate maximum damage"
            busy={busy}
            onRun={onSolve}
            onCancel={onCancel}
          />
        )}
        {playtestPanel}
      </div>
    </div>
  );
}
