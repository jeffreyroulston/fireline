"use client";

import { useEffect, useState } from "react";
import { CARD_LIST, type CardStat, type LineStep, type PassResult, type SimType } from "@/lib/engine";
import type { OptimizeProgress } from "@/lib/api/useRun";
import { PHASE_LABELS, type StepAlignment, type StepDiffInfo } from "./types";

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
          Uses the maindeck from the Deck damage tab so unknown draws can be
          sampled.
        </p>
      )}
    </div>
  );
}

export function ActionBar({
  label,
  busy,
  onRun,
  onCancel,
  progress,
}: {
  label: string;
  busy: boolean;
  onRun: () => void;
  onCancel: () => void;
  progress?: OptimizeProgress | null;
}) {
  const percent =
    progress && progress.totalHands > 0
      ? Math.min(
          100,
          Math.round((progress.handsSimulated / progress.totalHands) * 100),
        )
      : progress && progress.totalDecks > 0
        ? Math.min(
            100,
            Math.round((progress.decksScored / progress.totalDecks) * 100),
          )
        : 0;

  return (
    <div className="action-bar">
      <div className="action-bar-controls">
        <button className="primary-action" onClick={onRun} disabled={busy}>
          {busy ? "Calculating…" : label}
          <span aria-hidden>→</span>
        </button>
        {busy && (
          <button className="text-action" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      {busy && progress && (
        <div
          className="progress-panel"
          aria-label={`${percent}% complete`}
        >
          <div className="progress-meta">
            <span>
              {progress.decksScored.toLocaleString()} /{" "}
              {progress.totalDecks.toLocaleString()} decks
            </span>
            <span>
              {progress.handsSimulated.toLocaleString()} /{" "}
              {progress.totalHands.toLocaleString()} hands
            </span>
            <span>
              {progress.legalDecks.toLocaleString()} legal
            </span>
            <span>best {progress.bestScore.toFixed(2)}</span>
          </div>
          <div className="progress-track">
            <span style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

export function McRangeColumn({
  min,
  max,
  p50,
  scaleMax,
  selected,
  title,
  onClick,
}: {
  min: number;
  max: number;
  p50: number;
  scaleMax: number;
  selected?: boolean;
  title: string;
  onClick: () => void;
}) {
  const whiskerBottom = (min / scaleMax) * 100;
  const whiskerHeight = Math.max(((max - min) / scaleMax) * 100, 1.5);

  return (
    <button
      type="button"
      className={`mc-range-col ${selected ? "is-selected" : ""}`}
      title={title}
      aria-pressed={selected}
      onClick={onClick}
    >
      <span className="mc-range-track">
        <span
          className="mc-whisker"
          style={{ bottom: `${whiskerBottom}%`, height: `${whiskerHeight}%` }}
        />
        <span
          className="mc-fill"
          style={{ height: `${Math.max(8, (p50 / scaleMax) * 100)}%` }}
        />
      </span>
    </button>
  );
}

export function TwoPassCompare({
  brick,
  oracle,
  resetKey,
  compact,
}: {
  brick: PassResult;
  oracle: PassResult;
  resetKey: string;
  compact?: boolean;
}) {
  const diff = twoPassStepDiff(brick.steps, oracle.steps);
  const oracleDiffCount = diff.oracle.filter(
    (entry) => entry.mark === "added",
  ).length;

  return (
    <div className={`pass-stack ${compact ? "compact" : ""}`}>
      {oracleDiffCount > 0 && (
        <p className="pass-diff-note">
          {oracleDiffCount} oracle step{oracleDiffCount === 1 ? "" : "s"} differ
          from fire brick — highlighted below
        </p>
      )}
      <PassLinePanel
        label="Fire brick"
        damage={brick.maxDamage}
        steps={brick.steps}
        resetKey={`${resetKey}-brick`}
        stepDiff={diff.brick}
        note="Unknown draws stay blank (no peek)."
      />
      <PassLinePanel
        label="Oracle"
        damage={oracle.maxDamage}
        steps={oracle.steps}
        resetKey={`${resetKey}-oracle`}
        stepDiff={diff.oracle}
        oracle
        note="One shuffled remaining deck is known."
      />
    </div>
  );
}

export function PassLinePanel({
  label,
  damage,
  steps,
  resetKey,
  stepDiff,
  note,
  oracle,
}: {
  label: string;
  damage: number;
  steps: LineStep[];
  resetKey: string;
  stepDiff?: StepDiffInfo[];
  note?: string;
  oracle?: boolean;
}) {
  const diffCount =
    stepDiff?.filter((entry) => entry.mark !== "same").length ?? 0;

  return (
    <div className={`pass-panel ${oracle ? "is-oracle" : ""}`}>
      <div className="pass-heading">
        <span>{label.toUpperCase()}</span>
        <strong>{damage}</strong>
      </div>
      {note && <p className="pass-note">{note}</p>}
      <div className="combat-tape">
        <div className="tape-heading">
          <span>{label.toUpperCase()} LINE</span>
          <span>
            {steps.length} steps
            {diffCount > 0 && oracle && (
              <em className="tape-diff-count"> · {diffCount} diffs</em>
            )}
          </span>
        </div>
        <CombatTape
          steps={steps}
          resetKey={resetKey}
          stepDiff={oracle ? stepDiff : undefined}
          diffPerspective={oracle ? "oracle" : undefined}
        />
      </div>
    </div>
  );
}

export function CardStatsPanel({
  stats,
  samples,
  mode,
}: {
  stats: CardStat[];
  samples: number;
  mode: SimType;
}) {
  const fmtPct = (value: number) => `${(value * 100).toFixed(0)}%`;
  const fmtNum = (value: number) =>
    Number.isInteger(value) ? String(value) : value.toFixed(1);

  return (
    <details className="card-stats">
      <summary>
        <span>Deck stats</span>
        <small>
          {stats.length} cards · {samples}{" "}
          {mode === "monte_carlo" && samples > 1 ? "rollouts" : "samples"}
        </small>
      </summary>
      <p className="card-stats-note">
        Rates are normalised by how often each card was opened or drawn on the
        optimal line. Play when seen = plays ÷ samples where the card appeared.
      </p>
      <div className="card-stats-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Card</th>
              <th title="Copies in deck / hand">N</th>
              <th title="Opened in starting hand">Open</th>
              <th title="Seen (opened or drawn mid-line)">Seen</th>
              <th title="Times played from hand">Play</th>
              <th title="Ally attacks">Atk</th>
              <th title="Damage attributed on the line">Dmg</th>
              <th title="Plays per sample where seen">Play|seen</th>
              <th title="Mean damage when seen">Dmg|seen</th>
              <th title="Share of attributed damage">Share</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((row) => (
              <tr key={row.card}>
                <td>
                  <b>{row.name}</b>
                </td>
                <td>{row.copies}</td>
                <td>{fmtPct(row.openRate)}</td>
                <td>{fmtPct(row.seeRate)}</td>
                <td>{row.plays}</td>
                <td>{row.attacks}</td>
                <td>{row.damage}</td>
                <td>{fmtNum(row.playWhenSeen)}</td>
                <td>{fmtNum(row.damageWhenSeen)}</td>
                <td>{fmtPct(row.damageShare)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function twoPassStepDiff(
  brick: LineStep[],
  oracle: LineStep[],
): { brick: StepDiffInfo[]; oracle: StepDiffInfo[] } {
  const brickInfo: StepDiffInfo[] = brick.map(() => ({ mark: "same" }));
  const oracleInfo: StepDiffInfo[] = oracle.map(() => ({ mark: "same" }));
  const m = brick.length;
  const n = oracle.length;

  if (m === 0 && n === 0) {
    return { brick: brickInfo, oracle: oracleInfo };
  }

  const dp = Array.from({ length: m + 1 }, () => Array<number>(n + 1).fill(0));

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      if (brick[i - 1].action === oracle[j - 1].action) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const alignment: StepAlignment[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (
      i > 0 &&
      j > 0 &&
      brick[i - 1].action === oracle[j - 1].action
    ) {
      alignment.push({ kind: "match", brick: i - 1, oracle: j - 1 });
      i -= 1;
      j -= 1;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      alignment.push({ kind: "oracle-only", oracle: j - 1 });
      j -= 1;
    } else {
      alignment.push({ kind: "brick-only", brick: i - 1 });
      i -= 1;
    }
  }

  alignment.reverse();

  for (let index = 0; index < alignment.length; index += 1) {
    const entry = alignment[index];

    if (entry.kind === "match") {
      continue;
    }

    if (entry.kind === "oracle-only") {
      const paired = alignment[index + 1];
      if (paired?.kind === "brick-only") {
        oracleInfo[entry.oracle] = {
          mark: "added",
          compareAction: brick[paired.brick].action,
        };
        brickInfo[paired.brick] = { mark: "removed" };
        index += 1;
      } else {
        oracleInfo[entry.oracle] = { mark: "added" };
      }
      continue;
    }

    const paired = alignment[index + 1];
    if (paired?.kind === "oracle-only") {
      oracleInfo[paired.oracle] = {
        mark: "added",
        compareAction: brick[entry.brick].action,
      };
      brickInfo[entry.brick] = { mark: "removed" };
      index += 1;
    } else {
      brickInfo[entry.brick] = { mark: "removed" };
    }
  }

  return { brick: brickInfo, oracle: oracleInfo };
}

const SHORT_TO_NAME = Object.fromEntries(
  CARD_LIST.map((card) => [card.short, card.name]),
) as Record<string, string>;

export function parseZoneCards(label: string, prefix: "MEM" | "HAND"): string[] {
  const match = label.match(new RegExp(`^${prefix}\\d+\\s*(.*)$`));
  const rest = match?.[1]?.trim() ?? "";
  if (!rest) return [];
  return rest
    .split(", ")
    .filter(Boolean)
    .map((short) => SHORT_TO_NAME[short] ?? short);
}

export function CombatTape({
  steps,
  resetKey,
  stepDiff,
  diffPerspective,
}: {
  steps: LineStep[];
  resetKey: unknown;
  stepDiff?: StepDiffInfo[];
  diffPerspective?: "oracle" | "brick";
}) {
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    setExpanded(null);
  }, [resetKey]);

  return (
    <ol>
      {steps.map((step, index) => {
        const open = expanded === index;
        const memoryCards = parseZoneCards(step.memory, "MEM");
        const handCards = parseZoneCards(step.hand, "HAND");
        const damageDelta =
          index > 0 ? step.damage - steps[index - 1].damage : step.damage;
        const diff = stepDiff?.[index];
        const isOracleDiff =
          diffPerspective === "oracle" && diff?.mark === "added";
        const diffClass = isOracleDiff ? "is-diff-added" : undefined;

        return (
          <li
            key={`${step.display}-${index}`}
            className={[open ? "is-expanded" : undefined, diffClass]
              .filter(Boolean)
              .join(" ") || undefined}
          >
            <button
              type="button"
              className="tape-row"
              aria-expanded={open}
              onClick={() =>
                setExpanded((current) => (current === index ? null : index))
              }
            >
              <span>{String(index).padStart(2, "0")}</span>
              <code>{step.display}</code>
            </button>
            {open && (
              <div className="tape-expand">
                {isOracleDiff && diff?.compareAction && (
                  <p className="tape-diff-compare">
                    <span>Fire brick</span>
                    {diff.compareAction}
                  </p>
                )}
                <p className="tape-expand-action">{step.action}</p>
                <dl className="tape-expand-stats">
                  <div>
                    <dt>Turn</dt>
                    <dd>{step.turn}</dd>
                  </div>
                  <div>
                    <dt>Phase</dt>
                    <dd>{PHASE_LABELS[step.phase] ?? step.phase}</dd>
                  </div>
                  <div>
                    <dt>Damage</dt>
                    <dd>
                      {step.damage}
                      {damageDelta > 0 && (
                        <span className="tape-damage-delta">+{damageDelta}</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Allies</dt>
                    <dd>{step.allies}</dd>
                  </div>
                  <div>
                    <dt>Fire GY</dt>
                    <dd>{step.fireGy}</dd>
                  </div>
                </dl>
                <div className="tape-expand-zones">
                  <div>
                    <span>Allies · {step.allyNames?.length ?? 0}</span>
                    {(step.allyNames?.length ?? 0) > 0 && (
                      <ul>
                        {step.allyNames.map((card, cardIndex) => (
                          <li key={`ally-${card}-${cardIndex}`}>{card}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <span>Memory · {memoryCards.length}</span>
                    {memoryCards.length > 0 && (
                      <ul>
                        {memoryCards.map((card, cardIndex) => (
                          <li key={`mem-${card}-${cardIndex}`}>{card}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <span>Hand · {handCards.length}</span>
                    {handCards.length > 0 && (
                      <ul>
                        {handCards.map((card, cardIndex) => (
                          <li key={`hand-${card}-${cardIndex}`}>{card}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
