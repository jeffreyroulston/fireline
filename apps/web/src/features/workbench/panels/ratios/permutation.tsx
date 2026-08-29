import { MAX_RATIO_DECK_ATTEMPTS, formatDecklistCount } from "@/lib/engine";
import type { OptimizeProgress } from "@/lib/api/useRun";
import { OptimizeProgressPanel } from "../../ui";
import { progressPercent } from "../../lib/progress-percent";

type PermutationPanelProps = Readonly<{
  legalDecklists: bigint;
  boundMinTotal: number;
  boundMaxTotal: number;
  deckSize: number;
  freeCopies: number;
  deckAttempts: number;
  attemptCeiling: number;
  coveragePercent: number;
  busy?: boolean;
  progress?: OptimizeProgress | null;
  onDeckAttemptsChange: (value: number) => void;
}>;

export function PermutationPanel({
  legalDecklists,
  boundMinTotal,
  boundMaxTotal,
  deckSize,
  freeCopies,
  deckAttempts,
  attemptCeiling,
  coveragePercent,
  busy,
  progress,
  onDeckAttemptsChange,
}: PermutationPanelProps) {
  const livePercent = progressPercent(progress);

  return (
    <div className="mt-7 mb-2 grid gap-3 border border-border bg-surface p-[18px] [&_[role=status]]:mt-0.5 [&_[role=status]_.h-1]:h-1.5 [&_[role=status]_.bg-border]:bg-surface-deep">
      <div className="grid grid-cols-[auto_1fr] items-end gap-x-3.5 gap-y-1">
        <span className="col-span-full font-mono text-[10px] tracking-[0.08em] text-muted uppercase">
          LEGAL LISTS
        </span>
        <strong className="font-display text-[42px] leading-[0.9] text-primary">
          {formatDecklistCount(legalDecklists)}
        </strong>
        <small className="text-[13px] leading-snug text-muted">
          Bounds {boundMinTotal}–{boundMaxTotal} · deck {deckSize} · {freeCopies}{" "}
          free {freeCopies === 1 ? "copy" : "copies"}
        </small>
        <small className="col-span-full text-[13px] leading-snug text-muted">
          {legalDecklists === BigInt(0)
            ? "Deck size is outside the bound totals — open cuts and replacements"
            : freeCopies === 0
              ? "No cut slots open — raise cut budgets and pick replacements"
              : legalDecklists === BigInt(1)
                ? "Only one mix fits — cut more copies or widen the replacement pool"
                : legalDecklists > BigInt(MAX_RATIO_DECK_ATTEMPTS)
                  ? `Showing a unique sample · browser cap ${MAX_RATIO_DECK_ATTEMPTS}`
                  : "Space is small enough to cover fully"}
        </small>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden bg-surface-deep"
        aria-label={`${deckAttempts} of ${formatDecklistCount(legalDecklists)} lists · ${coveragePercent.toFixed(2)}% of full space`}
      >
        <span
          className="block h-full bg-[linear-gradient(90deg,var(--color-primary),var(--color-primary-dark))] transition-[width] duration-150 ease-in-out"
          style={{ width: `${coveragePercent}%` }}
        />
      </div>
      {busy && progress && (
        <OptimizeProgressPanel progress={progress} percent={livePercent} />
      )}
      <label className="grid gap-2">
        <span className="font-mono text-[11px] tracking-[0.06em] text-muted uppercase">
          Decks to try · {deckAttempts}
          {attemptCeiling > 0 ? ` / ${attemptCeiling}` : ""}
          {" · "}
          {coveragePercent < 0.01 && deckAttempts > 0
            ? "<0.01"
            : coveragePercent.toFixed(2)}
          % of legal
        </span>
        <input
          className="h-7 w-full p-0 accent-primary"
          type="range"
          min={1}
          max={Math.max(1, attemptCeiling)}
          value={Math.min(deckAttempts, Math.max(1, attemptCeiling))}
          disabled={attemptCeiling < 1 || Boolean(busy)}
          onChange={(event) => onDeckAttemptsChange(Number(event.target.value))}
        />
      </label>
    </div>
  );
}
