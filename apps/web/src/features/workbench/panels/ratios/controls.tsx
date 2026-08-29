type RatioControlsProps = Readonly<{
  ratioSamples: number;
  metric: "mean" | "p50";
  onRatioSamplesChange: (value: number) => void;
  onMetricChange: (value: "mean" | "p50") => void;
}>;

export function RatioControls({
  ratioSamples,
  metric,
  onRatioSamplesChange,
  onMetricChange,
}: RatioControlsProps) {
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
    </div>
  );
}
