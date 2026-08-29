"use client";

import type { SimType } from "@/lib/engine";
import type { SavedDeck } from "@/lib/decks";
import { isUnsuccessfulTerminalStatus } from "@/lib/runs/types";
import { DeckEditor, DeckResults } from "../panels/deck-damage";
import type { SampleHand } from "../types";
import type { UseShellSolverResult } from "../hooks/use-shell-solver";

type DeckTabProps = Readonly<{
  decks: SavedDeck[];
  activeDeck: SavedDeck | null;
  recognizedDeckCount: number;
  samples: number;
  goFirst: boolean;
  turns: number;
  simType: SimType;
  rollouts: number;
  evaluateBusy: boolean;
  evaluateRun: UseShellSolverResult["evaluateRun"];
  decksLoading: boolean;
  onSwitchDeck: (deckId: string) => void;
  onSamplesChange: (samples: number) => void;
  onGoFirstChange: (goFirst: boolean) => void;
  onTurnsChange: (turns: number) => void;
  onSimTypeChange: (simType: SimType) => void;
  onRolloutsChange: (rollouts: number) => void;
  onEvaluate: () => void;
  onCancel: () => void;
  onSendToHandSolver: (sample: SampleHand) => void;
}>;

export function DeckTab({
  decks,
  activeDeck,
  recognizedDeckCount,
  samples,
  goFirst,
  turns,
  simType,
  rollouts,
  evaluateBusy,
  evaluateRun,
  decksLoading,
  onSwitchDeck,
  onSamplesChange,
  onGoFirstChange,
  onTurnsChange,
  onSimTypeChange,
  onRolloutsChange,
  onEvaluate,
  onCancel,
  onSendToHandSolver,
}: DeckTabProps) {
  const evaluateFailed =
    Boolean(evaluateRun) &&
    isUnsuccessfulTerminalStatus(evaluateRun?.status ?? "");

  return (
    <>
      <DeckEditor
        decks={decks}
        activeDeck={activeDeck}
        recognizedDeckCount={recognizedDeckCount}
        samples={samples}
        goFirst={goFirst}
        turns={turns}
        simType={simType}
        rollouts={rollouts}
        busy={evaluateBusy}
        onSwitchDeck={onSwitchDeck}
        onSamplesChange={onSamplesChange}
        onGoFirstChange={onGoFirstChange}
        onTurnsChange={onTurnsChange}
        onSimTypeChange={onSimTypeChange}
        onRolloutsChange={onRolloutsChange}
        onEvaluate={onEvaluate}
        onCancel={onCancel}
        progress={evaluateRun?.progress ?? null}
        decksLoading={decksLoading}
      />
      <DeckResults
        result={evaluateFailed ? null : (evaluateRun?.deckResult ?? null)}
        busy={evaluateBusy}
        failed={evaluateFailed}
        errorMessage={evaluateRun?.error ?? null}
        onSendToHandSolver={onSendToHandSolver}
      />
    </>
  );
}
