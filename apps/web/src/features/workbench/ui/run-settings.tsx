"use client";

import type { SimType } from "@/lib/engine";

export function RunSettings({
  goFirst,
  turns,
  simType,
  rollouts,
  onFirstChange,
  onTurnsChange,
  onSimTypeChange,
  onRolloutsChange,
}: {
  goFirst: boolean;
  turns: number;
  simType: SimType;
  rollouts: number;
  onFirstChange: (value: boolean) => void;
  onTurnsChange: (value: number) => void;
  onSimTypeChange: (value: SimType) => void;
  onRolloutsChange: (value: number) => void;
}) {
  return (
    <div className="settings-stack">
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
      {simType !== "fire_brick" && (
        <p className="sim-hint">
          Uses the maindeck from the Decks tab so unknown draws can be
          sampled.
        </p>
      )}
    </div>
  );
}
