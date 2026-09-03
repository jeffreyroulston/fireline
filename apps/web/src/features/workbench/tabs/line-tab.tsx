"use client";

import { useEffect, useMemo } from "react";
import {
  MIN_VALID_DECK_SIZE,
  parseDecklist,
  type CardId,
  type DeckCounts,
  type SimType,
  type SolveResult,
} from "@/lib/engine";
import type { SavedDeck } from "@/lib/decks";
import { HandBuilder, ResultRail } from "../panels/hand";
import { PlaytestPanel } from "../panels/hand/playtest-panel";
import { usePlaytest } from "../hooks/use-playtest";
import { deckCountsCoveringHand } from "../utils";
import type { SolverMode, LineHorizon, Turn2KillResults } from "../types";
import type { ImportedLine } from "../lib/import-line-tape";

type LineTabProps = Readonly<{
  hand: CardId[];
  drawn: CardId[];
  orderedDeck: CardId[];
  deckText: string;
  activeMaterialCounts: DeckCounts;
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
  cpuCount: number;
  maxThreads: number | null;
  glimpseEnabled: boolean;
  maxHandDurationSecs: number | null;
  maxCardDraw: number | null;
  exhaustiveReservation: boolean;
  busy: boolean;
  error: string;
  lineResult: SolveResult | null;
  lineHand: CardId[];
  turn2KillResults: Turn2KillResults | null;
  lineHorizon: LineHorizon;
  decksLoading: boolean;
  onHandChange: (hand: CardId[]) => void;
  onSolverModeChange: (mode: SolverMode) => void;
  onSelectedCardChange: (card: CardId) => void;
  onSwitchDeck: (deckId: string) => void;
  onDrawRandomHand: () => void;
  onShuffleDeck: () => void;
  onGoFirstChange: (goFirst: boolean) => void;
  onTurnsChange: (turns: number) => void;
  onTurn2KillEnabledChange: (enabled: boolean) => void;
  onTurn2KillThresholdChange: (threshold: number) => void;
  onLineHorizonChange: (horizon: LineHorizon) => void;
  onSimTypeChange: (simType: SimType) => void;
  onRolloutsChange: (rollouts: number) => void;
  onMaxThreadsChange: (value: number | null) => void;
  onGlimpseEnabledChange: (value: boolean) => void;
  onMaxHandDurationSecsChange: (value: number | null) => void;
  onMaxCardDrawChange: (value: number | null) => void;
  onExhaustiveReservationChange: (value: boolean) => void;
  onSeedChange: (value: number | null) => void;
  onSolve: () => void;
  onCancel: () => void;
  onError: (message: string) => void;
  onImportLine: (line: ImportedLine) => void;
}>;

export function LineTab({
  hand,
  drawn,
  orderedDeck,
  deckText,
  activeMaterialCounts,
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
  error,
  lineResult,
  lineHand,
  turn2KillResults,
  lineHorizon,
  decksLoading,
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
  onLineHorizonChange,
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
  onError,
  onImportLine,
}: LineTabProps) {
  const deckCounts = useMemo(() => {
    const cards = parseDecklist(deckText);
    if (cards.length < MIN_VALID_DECK_SIZE) {
      return undefined;
    }
    return deckCountsCoveringHand(cards, hand);
  }, [deckText, hand]);

  const playtest = usePlaytest({
    hand,
    drawn,
    orderedDeck,
    goFirst,
    turns,
    turn2KillEnabled,
    turn2KillThreshold,
    seed,
    maxThreads,
    glimpseEnabled,
    maxHandDurationSecs,
    maxCardDraw,
    exhaustiveReservation,
    materials: activeMaterialCounts,
    deck: deckCounts,
  });
  const resetPlaytest = playtest.reset;

  useEffect(() => {
    if (solverMode !== "playtest") {
      resetPlaytest();
    }
  }, [solverMode, resetPlaytest]);

  useEffect(() => {
    if (playtest.error) {
      onError(playtest.error);
    }
  }, [onError, playtest.error]);

  const displayError = playtest.error || error;
  const isPlaytest = solverMode === "playtest";

  return (
    <>
      {displayError && (
        <p className="mb-4 text-sm text-destructive" role="alert">
          {displayError}
        </p>
      )}
      <HandBuilder
        hand={hand}
        solverMode={solverMode}
        selectedCard={selectedCard}
        decks={decks}
        activeDeck={activeDeck}
        recognizedDeckCount={recognizedDeckCount}
        shuffled={shuffled}
        seed={seed}
        goFirst={goFirst}
        turns={turns}
        turn2KillEnabled={turn2KillEnabled}
        turn2KillThreshold={turn2KillThreshold}
        simType={simType}
        rollouts={rollouts}
        cpuCount={cpuCount}
        maxThreads={maxThreads}
        glimpseEnabled={glimpseEnabled}
        maxHandDurationSecs={maxHandDurationSecs}
        maxCardDraw={maxCardDraw}
        exhaustiveReservation={exhaustiveReservation}
        busy={busy || playtest.busy}
        onHandChange={onHandChange}
        onSolverModeChange={onSolverModeChange}
        onSelectedCardChange={onSelectedCardChange}
        onSwitchDeck={onSwitchDeck}
        onDrawRandomHand={() => {
          playtest.reset();
          onDrawRandomHand();
        }}
        onShuffleDeck={() => {
          playtest.reset();
          onShuffleDeck();
        }}
        onGoFirstChange={onGoFirstChange}
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
        onSolve={onSolve}
        onCancel={onCancel}
        onImportLine={onImportLine}
        decksLoading={decksLoading}
        playtestPanel={
          isPlaytest ? (
            <PlaytestPanel
              hand={hand}
              board={playtest.board}
              events={playtest.events}
              legalActions={playtest.legalActions}
              phase={playtest.phase}
              busy={playtest.busy}
              comparing={playtest.comparing}
              canUndo={playtest.canUndo}
              optimalResult={playtest.optimalResult}
              turn2KillResults={playtest.turn2KillResults}
              lineHorizon={playtest.lineHorizon}
              onLineHorizonChange={playtest.setLineHorizon}
              reservePrompt={playtest.reservePrompt}
              selectedReserveIndices={playtest.selectedReserveIndices}
              discardPrompt={playtest.discardPrompt}
              onStart={playtest.start}
              onRequestAction={playtest.requestAction}
              onToggleReserveIndex={playtest.toggleReserveIndex}
              onConfirmReserve={playtest.confirmReserve}
              onCancelReserve={playtest.cancelReserve}
              onConfirmDiscard={playtest.confirmDiscard}
              onSkipDiscard={playtest.skipDiscard}
              onCancelDiscard={playtest.cancelDiscard}
              onApply={playtest.applyAction}
              onUndo={playtest.undo}
              onFinishCompare={playtest.finishAndCompare}
              onCancelCompare={playtest.cancelCompare}
              onReset={playtest.reset}
            />
          ) : undefined
        }
      />
      {!isPlaytest && (
        <ResultRail
          result={lineResult}
          busy={busy}
          hand={lineHand}
          turn2KillResults={turn2KillResults}
          lineHorizon={lineHorizon}
          onLineHorizonChange={onLineHorizonChange}
        />
      )}
    </>
  );
}
