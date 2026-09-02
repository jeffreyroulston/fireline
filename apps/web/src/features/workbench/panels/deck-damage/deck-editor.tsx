"use client";

import type { SimType } from "@/lib/engine";
import type { SavedDeck } from "@/lib/decks";
import type { OptimizeProgress } from "@/lib/runs/types";
import {
  ActionBar,
  DeckPicker,
  RunSettings,
  SectionHeading,
} from "../../ui";

const toolbarClass =
  "mt-[18px] flex items-end gap-3 max-[620px]:flex-col max-[620px]:items-stretch";

export function DeckEditor({
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
  busy,
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
  progress,
  decksLoading = false,
}: {
  decks: SavedDeck[];
  activeDeck: SavedDeck | null;
  recognizedDeckCount: number;
  samples: number;
  goFirst: boolean;
  turns: number;
  simType: SimType;
  rollouts: number;
  cpuCount?: number;
  maxThreads: number | null;
  glimpseEnabled: boolean;
  maxHandDurationSecs: number | null;
  maxCardDraw: number | null;
  seed: number;
  busy: boolean;
  onSwitchDeck: (deckId: string) => void;
  onSamplesChange: (value: number) => void;
  onGoFirstChange: (value: boolean) => void;
  onTurnsChange: (value: number) => void;
  onSimTypeChange: (value: SimType) => void;
  onRolloutsChange: (value: number) => void;
  onMaxThreadsChange: (value: number | null) => void;
  onGlimpseEnabledChange: (value: boolean) => void;
  onMaxHandDurationSecsChange: (value: number | null) => void;
  onMaxCardDrawChange: (value: number | null) => void;
  onSeedChange: (value: number) => void;
  onEvaluate: () => void;
  onCancel: () => void;
  onSave?: () => void;
  progress?: OptimizeProgress | null;
  decksLoading?: boolean;
}) {
  return (
    <div className="flex flex-col gap-9">
      <div className="min-w-0">
        <SectionHeading
          title="DECK DAMAGE"
          meta={<strong>{recognizedDeckCount} recognized</strong>}
        />
        <div className={toolbarClass}>
          <DeckPicker
            label="Saved deck"
            decks={decks}
            value={activeDeck?.id ?? ""}
            onChange={onSwitchDeck}
            loading={decksLoading}
          />
        </div>
        <div className="mt-[18px] flex items-end gap-3 max-[620px]:flex-col max-[620px]:items-stretch">
          <label>
            Opening hands
            <input
              type="number"
              min={1}
              max={50}
              value={samples}
              onChange={(event) => onSamplesChange(Number(event.target.value))}
            />
          </label>
        </div>
        <RunSettings
          goFirst={goFirst}
          turns={turns}
          simType={simType}
          rollouts={rollouts}
          seed={seed}
          cpuCount={cpuCount}
          maxThreads={maxThreads}
          glimpseEnabled={glimpseEnabled}
          maxHandDurationSecs={maxHandDurationSecs}
          maxCardDraw={maxCardDraw}
          onFirstChange={onGoFirstChange}
          onTurnsChange={onTurnsChange}
          onSimTypeChange={onSimTypeChange}
          onRolloutsChange={onRolloutsChange}
          onMaxThreadsChange={onMaxThreadsChange}
          onGlimpseEnabledChange={onGlimpseEnabledChange}
          onMaxHandDurationSecsChange={onMaxHandDurationSecsChange}
          onMaxCardDrawChange={onMaxCardDrawChange}
          onSeedChange={onSeedChange}
        />
        <ActionBar
          label="Sample deck damage"
          busy={busy}
          onRun={onEvaluate}
          onCancel={onCancel}
          onSave={onSave}
          progress={progress}
          monteCarloRollouts={simType === "monte_carlo" ? rollouts : undefined}
        />
      </div>
    </div>
  );
}
