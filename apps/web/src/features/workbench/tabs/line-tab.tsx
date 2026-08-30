"use client";

import type { CardId, SimType, SolveResult } from "@/lib/engine";
import type { SavedDeck } from "@/lib/decks";
import { HandBuilder, ResultRail } from "../panels/hand";
import type { SolverMode } from "../types";

type LineTabProps = Readonly<{
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
  lineResult: SolveResult | null;
  lineHand: CardId[];
  decksLoading: boolean;
  onHandChange: (hand: CardId[]) => void;
  onDrawnChange: (drawn: CardId[]) => void;
  onSolverModeChange: (mode: SolverMode) => void;
  onSelectedCardChange: (card: CardId) => void;
  onSwitchDeck: (deckId: string) => void;
  onDrawRandomHand: () => void;
  onDrawCard: () => void;
  onShuffleDeck: () => void;
  onGoFirstChange: (goFirst: boolean) => void;
  onTurnsChange: (turns: number) => void;
  onSimTypeChange: (simType: SimType) => void;
  onRolloutsChange: (rollouts: number) => void;
  onSolve: () => void;
  onCancel: () => void;
}>;

export function LineTab({
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
  lineResult,
  lineHand,
  decksLoading,
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
}: LineTabProps) {
  return (
    <>
      <HandBuilder
        hand={hand}
        drawn={drawn}
        solverMode={solverMode}
        selectedCard={selectedCard}
        decks={decks}
        activeDeck={activeDeck}
        recognizedDeckCount={recognizedDeckCount}
        remainingCount={remainingCount}
        shuffled={shuffled}
        seed={seed}
        goFirst={goFirst}
        turns={turns}
        simType={simType}
        rollouts={rollouts}
        busy={busy}
        onHandChange={onHandChange}
        onDrawnChange={onDrawnChange}
        onSolverModeChange={onSolverModeChange}
        onSelectedCardChange={onSelectedCardChange}
        onSwitchDeck={onSwitchDeck}
        onDrawRandomHand={onDrawRandomHand}
        onDrawCard={onDrawCard}
        onShuffleDeck={onShuffleDeck}
        onGoFirstChange={onGoFirstChange}
        onTurnsChange={onTurnsChange}
        onSimTypeChange={onSimTypeChange}
        onRolloutsChange={onRolloutsChange}
        onSolve={onSolve}
        onCancel={onCancel}
        decksLoading={decksLoading}
      />
      <ResultRail result={lineResult} busy={busy} hand={lineHand} />
    </>
  );
}
