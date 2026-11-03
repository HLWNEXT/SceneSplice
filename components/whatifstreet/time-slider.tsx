"use client";

import { MAX_LOG, TIME_STAGES, formatOffset, nearestStage, posToYears, snapPos, yearsToPos } from "../../lib/timetravel";

type Props = {
  years: number;
  disabled?: boolean;
  onChange: (years: number) => void;
};

const pct = (pos: number) => ((pos + MAX_LOG) / (2 * MAX_LOG)) * 100;

export function TimeSlider({ years, disabled, onChange }: Props) {
  const pos = yearsToPos(years);
  const stage = nearestStage(years);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="plaque-label text-xs text-dim">Time offset</div>
          <div className="font-display text-4xl font-semibold tabular-nums tracking-tight text-ink">{formatOffset(years)}</div>
        </div>
        <div className="max-w-[50%] text-right font-serif text-xs leading-snug text-dim">
          <span className="text-accent">{stage.label}</span> · {stage.summary}
        </div>
      </div>

      <div className="relative px-[7px]">
        <div className="relative h-7">
          <div className="absolute inset-x-0 top-1/2 h-px bg-line" />
          <div
            className="absolute top-1/2 h-px bg-accent"
            style={{ left: `${Math.min(50, pct(pos))}%`, width: `${Math.abs(pct(pos) - 50)}%` }}
          />
          <div className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-dim" style={{ left: "50%" }} />
          {TIME_STAGES.map((s) => (
            <div
              key={s.offsetYears}
              className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-dim"
              style={{ left: `${pct(yearsToPos(s.offsetYears))}%` }}
            />
          ))}
        </div>
        <input
          type="range"
          className="chrono absolute inset-x-0 top-0"
          aria-label="Years in the past or future"
          aria-valuetext={formatOffset(years)}
          min={-MAX_LOG}
          max={MAX_LOG}
          step={0.01}
          value={pos}
          disabled={disabled}
          onChange={(e) => onChange(posToYears(snapPos(Number(e.target.value))))}
        />
      </div>

      <div className="relative h-8 font-mono text-[10px] text-dim">
        {TIME_STAGES.map((s) => (
          <button
            key={s.offsetYears}
            type="button"
            disabled={disabled}
            onClick={() => onChange(s.offsetYears)}
            style={{ left: `${pct(yearsToPos(s.offsetYears))}%` }}
            className={`absolute top-0 -translate-x-1/2 whitespace-pre-line text-center leading-[1.3] hover:text-ink ${
              s.offsetYears === years ? "text-accent" : ""
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
