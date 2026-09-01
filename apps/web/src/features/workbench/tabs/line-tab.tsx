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
import type { SolverMode } from "../types";

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
  simType: SimType;
  rollouts: number;
  cpuCount: number;
  maxThreads: number | null;
  glimpseEnabled: boolean;
  maxHandDurationSecs: number | null;
  maxCardDraw: number | null;
  busy: boolean;
  error: string;
  lineResult: SolveResult | null;
  lineHand: CardId[];
  decksLoading: boolean;
  onHandChange: (hand: CardId[]) => void;
  onSolverModeChange: (mode: SolverMode) => void;
  onSelectedCardChange: (card: CardId) => void;
  onSwitchDeck: (deckId: string) => void;
  onDrawRandomHand: () => void;
  onShuffleDeck: () => void;
  onGoFirstChange: (goFirst: boolean) => void;
  onTurnsChange: (turns: number) => void;
  onSimTypeChange: (simType: SimType) => void;
  onRolloutsChange: (rollouts: number) => void;
  onMaxThreadsChange: (value: number | null) => void;
  onGlimpseEnabledChange: (value: boolean) => void;
  onMaxHandDurationSecsChange: (value: number | null) => void;
  onMaxCardDrawChange: (value: number | null) => void;
  onSolve: () => void;
  onCancel: () => void;
  onError: (message: string) => void;
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
  simType,
  rollouts,
  cpuCount,
  maxThreads,
  glimpseEnabled,
  maxHandDurationSecs,
  maxCardDraw,
  busy,
  error,
  lineResult,
  lineHand,
  decksLoading,
  onHandChange,
  onSolverModeChange,
  onSelectedCardChange,
  onSwitchDeck,
  onDrawRandomHand,
  onShuffleDeck,
  onGoFirstChange,
  onTurnsChange,
  onSimTypeChange,
  onRolloutsChange,
  onMaxThreadsChange,
  onGlimpseEnabledChange,
  onMaxHandDurationSecsChange,
  onMaxCardDrawChange,
  onSolve,
  onCancel,
  onError,
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
        simType={simType}
        rollouts={rollouts}
        cpuCount={cpuCount}
        maxThreads={maxThreads}
        glimpseEnabled={glimpseEnabled}
        maxHandDurationSecs={maxHandDurationSecs}
        maxCardDraw={maxCardDraw}
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
        onSimTypeChange={onSimTypeChange}
        onRolloutsChange={onRolloutsChange}
        onMaxThreadsChange={onMaxThreadsChange}
        onGlimpseEnabledChange={onGlimpseEnabledChange}
        onMaxHandDurationSecsChange={onMaxHandDurationSecsChange}
        onMaxCardDrawChange={onMaxCardDrawChange}
        onSolve={onSolve}
        onCancel={onCancel}
        decksLoading={decksLoading}
        playtestPanel={
          isPlaytest ? (
            <PlaytestPanel
              board={playtest.board}
              events={playtest.events}
              legalActions={playtest.legalActions}
              phase={playtest.phase}
              busy={playtest.busy}
              comparing={playtest.comparing}
              canUndo={playtest.canUndo}
              optimalResult={playtest.optimalResult}
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
              onReset={playtest.reset}
            />
          ) : undefined
        }
      />
      {!isPlaytest && (
        <ResultRail result={lineResult} busy={busy} hand={lineHand} />
      )}
    </>
  );
}
