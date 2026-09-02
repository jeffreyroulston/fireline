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
  cpuCount: number;
  maxThreads: number | null;
  glimpseEnabled: boolean;
  maxHandDurationSecs: number | null;
  maxCardDraw: number | null;
  seed: number;
  evaluateBusy: boolean;
  evaluateRun: UseShellSolverResult["evaluateRun"];
  decksLoading: boolean;
  onSwitchDeck: (deckId: string) => void;
  onSamplesChange: (samples: number) => void;
  onGoFirstChange: (goFirst: boolean) => void;
  onTurnsChange: (turns: number) => void;
  onSimTypeChange: (simType: SimType) => void;
  onRolloutsChange: (rollouts: number) => void;
  onMaxThreadsChange: (value: number | null) => void;
  onGlimpseEnabledChange: (value: boolean) => void;
  onMaxHandDurationSecsChange: (value: number | null) => void;
  onMaxCardDrawChange: (value: number | null) => void;
  onSeedChange: (value: number) => void;
  onEvaluate: () => void;
  onCancel: () => void;
  onSave?: () => void;
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
  cpuCount,
  maxThreads,
  glimpseEnabled,
  maxHandDurationSecs,
  maxCardDraw,
  seed,
  evaluateBusy,
  evaluateRun,
  decksLoading,
  onSwitchDeck,
  onSamplesChange,
  onGoFirstChange,
  onTurnsChange,
  onSimTypeChange,
  onRolloutsChange,
  onMaxThreadsChange,
  onGlimpseEnabledChange,
  onMaxHandDurationSecsChange,
  onMaxCardDrawChange,
  onSeedChange,
  onEvaluate,
  onCancel,
  onSave,
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
        cpuCount={cpuCount}
        maxThreads={maxThreads}
        glimpseEnabled={glimpseEnabled}
        maxHandDurationSecs={maxHandDurationSecs}
        maxCardDraw={maxCardDraw}
        seed={seed}
        busy={evaluateBusy}
        onSwitchDeck={onSwitchDeck}
        onSamplesChange={onSamplesChange}
        onGoFirstChange={onGoFirstChange}
        onTurnsChange={onTurnsChange}
        onSimTypeChange={onSimTypeChange}
        onRolloutsChange={onRolloutsChange}
        onMaxThreadsChange={onMaxThreadsChange}
        onGlimpseEnabledChange={onGlimpseEnabledChange}
        onMaxHandDurationSecsChange={onMaxHandDurationSecsChange}
        onMaxCardDrawChange={onMaxCardDrawChange}
        onSeedChange={onSeedChange}
        onEvaluate={onEvaluate}
        onCancel={onCancel}
        onSave={onSave}
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
