import type { RunHistoryRow, VersionGroup } from "@/lib/api/client";
import type { PooledDamageResponse } from "@/lib/api/client";
import type { SavedDeck } from "@/lib/decks";
import type { SimType } from "@/lib/engine";
import { cn, buttonVariants } from "@/lib/utils";
import { statLineClass } from "@/lib/utils/stat-classes";
import {
  tableMonoCellClass,
  tableResultCellClass,
  tableWrapClass,
} from "@/lib/utils/typography";
import { SIM_TYPE_LABELS } from "../../types";
import type { PooledSampleBar } from "../pooled-damage-bars";

export const historyModeClass = "grid w-full min-w-0 gap-7";

export const historyControlsClass =
  "grid grid-cols-[minmax(14ch,1.3fr)_minmax(12ch,0.9fr)_minmax(16ch,1.2fr)] items-end gap-x-[18px] gap-y-3.5 max-[900px]:grid-cols-1";

export const historyPanelClass =
  "min-w-0 border border-border bg-surface px-[18px] pt-[18px] pb-3 [&>.section-heading]:mb-3.5";

export const historyEmptyClass =
  "m-0 mb-2 py-2 pb-3 text-sm leading-normal text-muted";

export const historyTableWrapClass = tableWrapClass;

export const historyPanelTableWrapClass = cn(
  historyTableWrapClass,
  "overflow-visible pb-14",
);

export const historyMonoCellClass = tableMonoCellClass;

export const historyResultCellClass = tableResultCellClass;

export const historyActionsCellClass = "w-[1%] whitespace-nowrap text-right";

export const historyDeleteButtonClass = buttonVariants({
  intent: "text",
  danger: true,
});

export const historyAnalysisClass =
  "grid grid-cols-1 items-start gap-[22px] max-[900px]:grid-cols-1";

export const simHintClass = "mt-2 text-xs leading-snug text-muted";

export const errorBannerClass = "m-0 text-sm text-primary-dark";

export const historyPooledHeadingClass =
  "mb-3.5 flex flex-wrap items-baseline justify-between gap-4";

export const historyPooledHeadingMetaClass =
  "flex flex-wrap items-center gap-3";

export const historySecondaryActionClass = buttonVariants({
  intent: "secondary",
  size: "compact",
});

export const historyComparePanelClass =
  "mb-2 border border-[color-mix(in_srgb,var(--color-secondary)_28%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-secondary)_6%,var(--color-surface))] px-4 py-3.5";

export const historyCompareKickerClass =
  "mb-2.5 font-mono text-[9px] font-medium tracking-[0.08em] text-secondary-dark";

export const historyCompareLegendClass =
  "mb-0.5 mt-1 flex flex-wrap gap-x-7 gap-y-4 px-6 font-mono text-[11px] [&_span]:inline-flex [&_span]:min-w-0 [&_span]:items-center [&_span]:gap-2 [&_.is-baseline]:text-primary-dark [&_.is-baseline]:before:h-[3px] [&_.is-baseline]:before:w-[18px] [&_.is-baseline]:before:flex-none [&_.is-baseline]:before:bg-primary-dark [&_.is-baseline]:before:content-[''] [&_.is-compare]:text-secondary-dark [&_.is-compare]:before:h-[3px] [&_.is-compare]:before:w-[18px] [&_.is-compare]:before:flex-none [&_.is-compare]:before:bg-[repeating-linear-gradient(90deg,var(--color-secondary-dark)_0_5px,transparent_5px_8px)] [&_.is-compare]:before:content-['']";

export const historyCompareStatLineClass = cn(
  statLineClass,
  "flex flex-wrap items-end justify-between gap-x-1 gap-y-3 border-b-0 px-6",
  "[&>span]:flex-[0_1_auto] [&>span]:whitespace-nowrap [&>span]:border-l-0 [&>span]:py-0 [&>span]:pl-0",
);

export const historyComparePairClass =
  "grid gap-0.5 font-semibold [&_em]:font-display [&_em]:text-[22px] [&_em]:font-semibold [&_em]:not-italic [&_em]:leading-[1.05] [&_.is-baseline]:text-primary-dark [&_.is-compare]:text-secondary-dark";

export const historyDeltaClass =
  "block font-mono text-[11px] not-italic tracking-[0.02em] text-muted";

export function historyDeltaToneClass(value: number) {
  if (value > 0) return "text-primary-dark";
  if (value < 0) return "text-secondary-dark";
  return "";
}

export const historyRangeFilterClass = "mb-2.5 mt-0.5 grid gap-2";

export const historyRangeFieldsClass =
  "grid max-w-md grid-cols-[minmax(8ch,10rem)_minmax(8ch,10rem)_auto] items-end gap-x-3.5 gap-y-3 max-[620px]:grid-cols-[1fr_1fr_auto] [&_input]:min-w-0 [&_input]:font-mono [&_input]:text-[13px] [&_input]:normal-case [&_input]:tracking-normal [&_input[aria-invalid=true]]:border-primary-dark";

export const historyRangeClearClass = cn(
  buttonVariants({ intent: "text" }),
  "mb-2 justify-self-start uppercase",
);

export const historyRangeHintClass =
  "m-0 font-sans text-[13px] leading-snug tracking-normal text-muted normal-case";

export const historyRangeHintErrorClass = "text-primary-dark";

export const historyPooledChartsClass =
  "history-pooled-charts mt-3 grid grid-cols-2 items-start gap-x-5 overflow-visible max-[900px]:grid-cols-1";

export const historyPooledChartsCompareClass = "grid-cols-1";

export const historyBellPlotClass =
  "w-full min-w-0 overflow-visible [&_.damage-bell-curve]:mt-0 [&_.damage-bell-curve]:h-[var(--pooled-chart-total-height,273px)] [&_.damage-bell-curve]:min-h-[var(--pooled-chart-total-height,273px)] [&_.damage-bell-curve]:w-full [&_.damage-bell-curve]:max-w-none [&_.damage-bell-curve]:pt-0";

export function groupKey(group: VersionGroup): string {
  return `${group.rulesVersion}:${group.samplerVersion}:${group.attributionVersion}`;
}

export function formatVersionShort(run: RunHistoryRow): string {
  if (run.rulesVersion == null) {
    return "—";
  }
  return `r${run.rulesVersion} · s${run.samplerVersion} · a${run.attributionVersion}`;
}

export function formatVersionLabel(group: VersionGroup): string {
  return `r${group.rulesVersion} · s${group.samplerVersion} · a${group.attributionVersion ?? "?"}`;
}

export function formatWhen(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRunTime(elapsedMs: number | null): string {
  if (elapsedMs == null) {
    return "—";
  }
  if (elapsedMs < 1000) {
    return `${Math.round(elapsedMs)}ms`;
  }
  if (elapsedMs < 60_000) {
    return `${(elapsedMs / 1000).toFixed(1)}s`;
  }
  if (elapsedMs < 3_600_000) {
    const minutes = Math.floor(elapsedMs / 60_000);
    const seconds = Math.round((elapsedMs % 60_000) / 1000);
    return `${minutes}m ${seconds}s`;
  }
  const hours = Math.floor(elapsedMs / 3_600_000);
  const minutes = Math.round((elapsedMs % 3_600_000) / 60_000);
  return `${hours}h ${minutes}m`;
}

export function resultLabel(run: RunHistoryRow): string {
  if (run.kind === "optimize") {
    return run.bestScore != null ? run.bestScore.toFixed(2) : "—";
  }
  return run.meanDamage != null ? run.meanDamage.toFixed(1) : "—";
}

export function handsLabel(run: RunHistoryRow): string {
  if (run.samples == null) {
    return "—";
  }
  if (run.simType === "monte_carlo" && run.rollouts != null) {
    return `${run.samples} (${run.rollouts})`;
  }
  return String(run.samples);
}

function expandBuckets(buckets: number[]): number[] {
  const damages: number[] = [];
  for (let damage = 0; damage < buckets.length; damage += 1) {
    const count = buckets[damage] ?? 0;
    for (let n = 0; n < count; n += 1) {
      damages.push(damage);
    }
  }
  return damages;
}

export function sampleBarsFromPooled(
  pooled: PooledDamageResponse | null,
): PooledSampleBar[] {
  if (!pooled) {
    return [];
  }
  if (pooled.runs && pooled.runs.length > 0) {
    return pooled.runs.flatMap((run) => {
      const points =
        run.samplePoints ??
        (run.damages ?? []).map((damage, index) => ({ index, damage }));
      return points.map(({ index, damage }) => ({
        key: `${run.id}-${index}`,
        runId: run.id,
        sampleIndex: index,
        damage,
        label: `Hand ${index + 1}: ${damage} damage`,
      }));
    });
  }
  return expandBuckets(pooled.distribution?.buckets ?? []).map(
    (damage, index) => ({
      key: `pool-${index}`,
      runId: "",
      sampleIndex: index,
      damage,
      label: `Sample ${index + 1}: ${damage} damage`,
    }),
  );
}

export function resolvePoolHash(
  deck: SavedDeck | null | undefined,
  sim: SimType,
  historyRuns: RunHistoryRow[],
): string | undefined {
  if (!deck) {
    return undefined;
  }
  const fromRun = historyRuns.find(
    (run) =>
      run.kind === "evaluate" &&
      (run.status === "complete" || run.status === "partial") &&
      run.simType === sim &&
      (run.deckId === deck.id || run.deckHash === deck.deckHash) &&
      !!run.deckHash,
  )?.deckHash;
  return fromRun ?? deck.deckHash;
}

export function poolLegendLabel(
  deckName: string,
  sim: SimType,
  group: VersionGroup | null,
  showSim: boolean,
  showVersion: boolean,
): string {
  const parts = [deckName];
  if (showSim) {
    parts.push(SIM_TYPE_LABELS[sim] ?? sim);
  }
  if (showVersion && group) {
    parts.push(`r${group.rulesVersion} · s${group.samplerVersion}`);
  }
  return parts.join(" · ");
}
