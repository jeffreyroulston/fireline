"use client";

import type { SimType } from "@/lib/engine";
import { InfoPopover } from "@/components/info-popover";
import { cn } from "@/lib/utils/cn";
import { settingsRowClass } from "@/lib/utils/ui-classes";
import { SectionHeading } from "./section-heading";

const advancedDetailsClass = cn(
  "w-full overflow-hidden rounded-[2px] border border-border bg-[rgba(251,253,252,0.85)]",
  "[&>summary]:flex [&>summary]:h-[42px] [&>summary]:cursor-pointer [&>summary]:list-none",
  "[&>summary]:items-center [&>summary]:justify-between [&>summary]:gap-3",
  "[&>summary]:px-[11px]",
  "[&[open]>summary]:border-b [&[open]>summary]:border-border",
  "[&>summary::-webkit-details-marker]:hidden",
  "[&>summary_span]:font-mono [&>summary_span]:text-[10px] [&>summary_span]:tracking-[0.05em] [&>summary_span]:text-foreground [&>summary_span]:uppercase",
  "[&>summary::after]:font-mono [&>summary::after]:text-[16px] [&>summary::after]:leading-none [&>summary::after]:text-foreground [&>summary::after]:content-['▾']",
  "[&[open]>summary::after]:content-['▴']",
);

const advancedBodyClass = "grid gap-3.5 p-3.5";

export function RunSettings({
  goFirst,
  turns,
  simType,
  rollouts,
  seed,
  orderedPile,
  cpuCount,
  maxThreads,
  glimpseEnabled,
  maxHandDurationSecs,
  maxCardDraw,
  onFirstChange,
  onTurnsChange,
  onSimTypeChange,
  onRolloutsChange,
  onMaxThreadsChange,
  onGlimpseEnabledChange,
  onMaxHandDurationSecsChange,
  onMaxCardDrawChange,
}: {
  goFirst: boolean;
  turns: number;
  simType: SimType;
  rollouts: number;
  seed?: number;
  orderedPile?: boolean;
  cpuCount?: number;
  maxThreads: number | null;
  glimpseEnabled: boolean;
  maxHandDurationSecs: number | null;
  maxCardDraw: number | null;
  onFirstChange: (value: boolean) => void;
  onTurnsChange: (value: number) => void;
  onSimTypeChange: (value: SimType) => void;
  onRolloutsChange: (value: number) => void;
  onMaxThreadsChange: (value: number | null) => void;
  onGlimpseEnabledChange: (value: boolean) => void;
  onMaxHandDurationSecsChange: (value: number | null) => void;
  onMaxCardDrawChange: (value: number | null) => void;
}) {
  const threadMax = Math.max(1, cpuCount ?? 1);
  const threadDisplay = maxThreads ?? threadMax;
  const glimpseLocked = simType === "fire_brick";

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
            onChange={(event) => onTurnsChange(Number(event.target.value))}
          >
            <option value={2}>2 turns</option>
            <option value={3}>3 turns</option>
          </select>
        </label>
      </div>
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
      <div className={cn(settingsRowClass, "mt-3.5")}>
        <div className="grid flex-1 gap-[7px] font-mono text-[10px] tracking-[0.05em] text-muted uppercase">
          <span>Advanced</span>
          <details className={advancedDetailsClass}>
            <summary>
              <span>Options</span>
            </summary>
            <div className={advancedBodyClass}>
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
                <label>
                  <InfoPopover label="Max card draw">
                    Only the first N known library draws stay real. After that,
                    every further draw is an unplayable Fire Brick.
                  </InfoPopover>
                  <input
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
            </div>
          </details>
        </div>
      </div>
      {seed != null && (
        <p className="mt-3 font-mono text-[11px] tracking-[0.06em] text-muted [&_strong]:font-medium [&_strong]:text-foreground">
          Seed <strong>{seed}</strong>
        </p>
      )}
      {simType !== "fire_brick" && (
        <p className="mt-2 text-xs leading-[1.4] text-muted">
          {orderedPile
            ? "Two-pass and Oracle draw the remaining shuffled pile in order. Monte Carlo still reshuffles that leftover for each rollout."
            : "Uses the maindeck from the Decks tab so unknown draws can be sampled."}
        </p>
      )}
    </div>
  );
}
