"use client";

import type { SimType } from "@/lib/engine";
import { InfoPopover } from "@/components/info-popover";
import { cn } from "@/lib/utils/cn";
import { settingsRowClass } from "@/lib/utils/ui-classes";
import { SectionHeading } from "./section-heading";

const advancedDetailsClass = cn(
  "disclosure-chevron w-full overflow-hidden rounded-[2px] border border-border bg-[rgba(251,253,252,0.85)]",
  "[&>summary]:flex [&>summary]:h-[42px] [&>summary]:cursor-pointer [&>summary]:list-none",
  "[&>summary]:items-center [&>summary]:justify-between [&>summary]:gap-3",
  "[&>summary]:px-[11px]",
  "[&[open]>summary]:border-b [&[open]>summary]:border-border",
  "[&>summary::-webkit-details-marker]:hidden",
  "[&>summary_span]:font-mono [&>summary_span]:text-[10px] [&>summary_span]:tracking-[0.05em] [&>summary_span]:text-foreground [&>summary_span]:uppercase",
);

const advancedBodyClass = "grid gap-3.5 p-3.5";

export function RunSettings({
  goFirst,
  turns,
  turn2KillEnabled = false,
  turn2KillThreshold = 19,
  simType,
  rollouts,
  seed,
  orderedPile,
  cpuCount,
  maxThreads,
  glimpseEnabled,
  maxHandDurationSecs,
  maxCardDraw,
  exhaustiveReservation = false,
  playtestMode = false,
  onFirstChange,
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
}: {
  goFirst: boolean;
  turns: number;
  turn2KillEnabled?: boolean;
  turn2KillThreshold?: number;
  simType: SimType;
  rollouts: number;
  seed?: number | null;
  orderedPile?: boolean;
  cpuCount?: number;
  maxThreads: number | null;
  glimpseEnabled: boolean;
  maxHandDurationSecs: number | null;
  maxCardDraw: number | null;
  exhaustiveReservation?: boolean;
  playtestMode?: boolean;
  onFirstChange: (value: boolean) => void;
  onTurnsChange: (value: number) => void;
  onTurn2KillEnabledChange?: (value: boolean) => void;
  onTurn2KillThresholdChange?: (value: number) => void;
  onSimTypeChange: (value: SimType) => void;
  onRolloutsChange: (value: number) => void;
  onMaxThreadsChange: (value: number | null) => void;
  onGlimpseEnabledChange: (value: boolean) => void;
  onMaxHandDurationSecsChange: (value: number | null) => void;
  onMaxCardDrawChange: (value: number | null) => void;
  onExhaustiveReservationChange?: (value: boolean) => void;
  onSeedChange?: (value: number | null) => void;
}) {
  const showTurn2Kill = Boolean(onTurn2KillEnabledChange);
  const threadMax = Math.max(1, cpuCount ?? 1);
  const threadDisplay = maxThreads ?? threadMax;
  const glimpseLocked = !playtestMode && simType === "fire_brick";
  const exhaustiveLocked =
    !playtestMode &&
    (simType === "fire_brick" || simType === "monte_carlo");

  return (
    <div className="mt-7 grid gap-0 border-t border-border pt-5">
      <SectionHeading className="mb-0" title="CALCULATION SETTINGS" />
      <div className={cn(settingsRowClass, "mt-3.5")}>
        <label>
          Turn order
          <select
            value={goFirst ? "first" : "second"}
            onChange={(event) => onFirstChange(event.target.value === "first")}
          >
            <option value="first">Going first</option>
            <option value="second">Going second</option>
          </select>
        </label>
        <label>
          Turn horizon
          <select
            value={turns}
            disabled={showTurn2Kill && turn2KillEnabled}
            onChange={(event) => onTurnsChange(Number(event.target.value))}
          >
            <option value={2}>2 turns</option>
            <option value={3}>3 turns</option>
          </select>
        </label>
      </div>
      {!playtestMode && (
      <div className={cn(settingsRowClass, "mt-3.5")}>
        <label>
          Simulation type
          <select
            value={simType}
            onChange={(event) =>
              onSimTypeChange(event.target.value as SimType)
            }
          >
            <option value="fire_brick">Fire brick (default)</option>
            <option value="monte_carlo">Monte Carlo — Sample</option>
            <option value="two_pass">Two-pass</option>
            <option value="oracle_only">Oracle only</option>
          </select>
        </label>
        {simType === "monte_carlo" && (
          <label>
            Rollouts
            <input
              type="number"
              min={1}
              max={48}
              value={rollouts}
              onChange={(event) =>
                onRolloutsChange(Number(event.target.value))
              }
            />
          </label>
        )}
      </div>
      )}
      <div className={cn(settingsRowClass, "mt-3.5")}>
        <div className="grid flex-1 gap-[7px] font-mono text-[10px] tracking-[0.05em] text-muted uppercase">
          <span>Advanced</span>
          <details className={advancedDetailsClass}>
            <summary>
              <span>Options</span>
            </summary>
            <div className={advancedBodyClass}>
              {onSeedChange != null ? (
                <label>
                  Seed
                  <input
                    type="number"
                    min={0}
                    max={4_294_967_295}
                    placeholder="Random"
                    value={seed ?? ""}
                    onChange={(event) => {
                      const raw = event.target.value.trim();
                      if (!raw) {
                        onSeedChange(null);
                        return;
                      }
                      const next = Number(raw);
                      if (Number.isFinite(next) && next >= 0) {
                        onSeedChange(next);
                      }
                    }}
                  />
                </label>
              ) : null}
              {showTurn2Kill ? (
                <div className={settingsRowClass}>
                  <label>
                    2 turn kill
                    <span className="flex h-[42px] w-full items-center gap-2.5 rounded-[2px] border border-border bg-[rgba(251,253,252,0.85)] px-[11px]">
                      <input
                        type="checkbox"
                        checked={turn2KillEnabled}
                        onChange={(event) =>
                          onTurn2KillEnabledChange?.(event.target.checked)
                        }
                      />
                      <span className="font-mono text-[10px] tracking-[0.05em] text-foreground uppercase">
                        {turn2KillEnabled ? "Runs 2- and 3-turn sims" : "Off"}
                      </span>
                    </span>
                  </label>
                  <label className={cn(!turn2KillEnabled && "opacity-55")}>
                    Kill threshold
                    <input
                      type="number"
                      min={1}
                      disabled={!turn2KillEnabled}
                      value={turn2KillThreshold}
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        if (Number.isFinite(next) && next > 0) {
                          onTurn2KillThresholdChange?.(next);
                        }
                      }}
                    />
                  </label>
                </div>
              ) : null}
              <div className={cn(settingsRowClass)}>
                <label>
                  Processing power (Max {threadMax})
                  <input
                    type="number"
                    min={1}
                    max={threadMax}
                    value={threadDisplay}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      if (!Number.isFinite(next) || next <= 0) {
                        onMaxThreadsChange(null);
                        return;
                      }
                      onMaxThreadsChange(
                        Math.min(Math.max(1, next), threadMax),
                      );
                    }}
                  />
                </label>
                <label>
                  Max hand duration (sec)
                  <input
                    type="number"
                    min={0}
                    placeholder="No limit"
                    value={maxHandDurationSecs ?? ""}
                    onChange={(event) => {
                      const raw = event.target.value.trim();
                      if (!raw) {
                        onMaxHandDurationSecsChange(null);
                        return;
                      }
                      const next = Number(raw);
                      onMaxHandDurationSecsChange(
                        Number.isFinite(next) && next > 0 ? next : null,
                      );
                    }}
                  />
                </label>
              </div>
              <div className={cn(settingsRowClass)}>
                <label className={cn(glimpseLocked && "opacity-55")}>
                  Enable Glimpse
                  <span
                    className={cn(
                      "flex h-[42px] w-full items-center gap-2.5 border border-border rounded-[2px] bg-[rgba(251,253,252,0.85)] px-[11px]",
                      glimpseLocked && "pointer-events-none",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={glimpseLocked ? false : glimpseEnabled}
                      disabled={glimpseLocked}
                      onChange={(event) =>
                        onGlimpseEnabledChange(event.target.checked)
                      }
                    />
                    <span className="font-mono text-[10px] tracking-[0.05em] text-foreground uppercase">
                      {glimpseLocked ? "Off for Fire brick" : "Enabled"}
                    </span>
                  </span>
                </label>
                <label htmlFor="run-max-card-draw">
                  <span className="inline-flex items-center gap-[5px] leading-none">
                    Max card draw
                    <InfoPopover hideLabel label="Max card draw">
                      Only the first N known library draws stay real. After
                      that, every further draw is an unplayable Fire Brick.
                    </InfoPopover>
                  </span>
                  <input
                    id="run-max-card-draw"
                    type="number"
                    min={0}
                    max={64}
                    placeholder="No limit"
                    value={maxCardDraw ?? ""}
                    onChange={(event) => {
                      const raw = event.target.value.trim();
                      if (!raw) {
                        onMaxCardDrawChange(null);
                        return;
                      }
                      const next = Number(raw);
                      onMaxCardDrawChange(
                        Number.isFinite(next) && next > 0
                          ? Math.min(next, 64)
                          : null,
                      );
                    }}
                  />
                </label>
              </div>
              {onExhaustiveReservationChange ? (
                <div className={cn(settingsRowClass)}>
                  <label className={cn(exhaustiveLocked && "opacity-55")}>
                    Exhaustive reservation search
                    <span
                      className={cn(
                        "flex h-[42px] w-full items-center gap-2.5 border border-border rounded-[2px] bg-[rgba(251,253,252,0.85)] px-[11px]",
                        exhaustiveLocked && "pointer-events-none",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={
                          exhaustiveLocked ? false : exhaustiveReservation
                        }
                        disabled={exhaustiveLocked}
                        onChange={(event) =>
                          onExhaustiveReservationChange(event.target.checked)
                        }
                      />
                      <span className="font-mono text-[10px] tracking-[0.05em] text-foreground uppercase">
                        {exhaustiveLocked
                          ? "Oracle / two-pass only"
                          : exhaustiveReservation
                            ? "Enabled"
                            : "Off"}
                      </span>
                    </span>
                  </label>
                </div>
              ) : null}
            </div>
          </details>
        </div>
      </div>
      {playtestMode ? (
        <p className="mt-2 text-xs leading-[1.4] text-muted">
          Playtest compare uses an oracle solve on the same hand and draw queue.
        </p>
      ) : null}
      {simType !== "fire_brick" && !playtestMode && (
        <p className="mt-2 text-xs leading-[1.4] text-muted">
          {orderedPile
            ? "Two-pass and Oracle draw the remaining shuffled pile in order. Monte Carlo still reshuffles that leftover for each rollout."
            : "Uses the maindeck from the Decks tab so unknown draws can be sampled."}
        </p>
      )}
    </div>
  );
}
