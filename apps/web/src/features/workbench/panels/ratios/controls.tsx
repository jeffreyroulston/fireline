import type { RatioEvalMode, RatioStrategy } from "../../types";

const SPRT_STRATEGIES = new Set<RatioStrategy>([
  "randomSample",
  "hillClimb",
  "genetic",
]);

type RatioControlsProps = Readonly<{
  ratioSamples: number;
  metric: "mean" | "p50";
  evalMode: RatioEvalMode;
  strategy: RatioStrategy;
  onRatioSamplesChange: (value: number) => void;
  onMetricChange: (value: "mean" | "p50") => void;
  onEvalModeChange: (value: RatioEvalMode) => void;
}>;

export function RatioControls({
  ratioSamples,
  metric,
  evalMode,
  strategy,
  onRatioSamplesChange,
  onMetricChange,
  onEvalModeChange,
}: RatioControlsProps) {
  const sprtAvailable = SPRT_STRATEGIES.has(strategy);

  return (
    <div className="mt-[18px] flex flex-wrap items-end gap-3 max-[620px]:grid max-[620px]:grid-cols-1">
      <label>
        Hands / list
        <input
          type="number"
          min={1}
          max={200}
          value={ratioSamples}
          onChange={(event) => onRatioSamplesChange(Number(event.target.value))}
        />
      </label>
      <label>
        Optimize
        <select
          value={metric}
          onChange={(event) =>
            onMetricChange(event.target.value as "mean" | "p50")
          }
        >
          <option value="mean">Mean damage</option>
          <option value="p50">Median damage</option>
        </select>
      </label>
      {sprtAvailable ? (
        <label>
          Scoring
          <select
            value={evalMode}
            onChange={(event) =>
              onEvalModeChange(event.target.value as RatioEvalMode)
            }
          >
            <option value="full">Full run</option>
            <option value="sprt">SPRT screen</option>
          </select>
        </label>
      ) : null}
    </div>
  );
}
