"use client";

import type { SimType } from "@/lib/engine";
import { SectionHeading } from "./section-heading";

export function RunSettings({
  goFirst,
  turns,
  simType,
  rollouts,
  seed,
  orderedPile,
  onFirstChange,
  onTurnsChange,
  onSimTypeChange,
  onRolloutsChange,
}: {
  goFirst: boolean;
  turns: number;
  simType: SimType;
  rollouts: number;
  seed?: number;
  orderedPile?: boolean;
  onFirstChange: (value: boolean) => void;
  onTurnsChange: (value: number) => void;
  onSimTypeChange: (value: SimType) => void;
  onRolloutsChange: (value: number) => void;
}) {
  return (
    <div className="settings-stack">
      <SectionHeading title="CALCULATION SETTINGS" />
      <div className="settings-row">
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
      <div className="settings-row">
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
      {seed != null && (
        <p className="seed-readout">
          Seed <strong>{seed}</strong>
        </p>
      )}
      {simType !== "fire_brick" && (
        <p className="sim-hint">
          {orderedPile
            ? "Two-pass and Oracle draw the remaining shuffled pile in order. Monte Carlo still reshuffles that leftover for each rollout."
            : "Uses the maindeck from the Decks tab so unknown draws can be sampled."}
        </p>
      )}
    </div>
  );
}
