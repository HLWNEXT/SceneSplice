"use client";

import {
  DECAY_STAGES,
  MAX_LOG,
  MIN_LOG,
  formatYears,
  logToYears,
  nearestStage,
  snapLog,
  yearsToLog,
} from "../lib/decay";

type Props = {
  years: number;
  disabled?: boolean;
  onChange: (years: number) => void;
};

const pct = (log: number) => ((log - MIN_LOG) / (MAX_LOG - MIN_LOG)) * 100;

export function ChronoSlider({ years, disabled, onChange }: Props) {
  const log = yearsToLog(years);
  const stage = nearestStage(years);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-dim">Elapsed time</div>
          <div className="text-4xl font-bold tabular-nums">
            {formatYears(years)} <span className="text-lg text-dim">YR</span>
          </div>
        </div>
        <div className="max-w-[55%] text-right text-xs text-dim">
          <span className="text-accent">{stage.label}</span> · {stage.summary}
        </div>
      </div>

      <div className="relative px-[7px]">
        <div className="relative h-7">
          <div className="absolute inset-x-0 top-1/2 h-px bg-line" />
          <div className="absolute left-0 top-1/2 h-px bg-accent" style={{ width: `${pct(log)}%` }} />
          {DECAY_STAGES.map((s) => (
            <div
              key={s.years}
              className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-dim"
              style={{ left: `${pct(yearsToLog(s.years))}%` }}
            />
          ))}
        </div>
        <input
          type="range"
          className="chrono absolute inset-x-0 top-0"
          aria-label="Years of decay"
          aria-valuetext={`${formatYears(years)} years`}
          min={MIN_LOG}
          max={MAX_LOG}
          step={0.01}
          value={log}
          disabled={disabled}
          onChange={(e) => onChange(logToYears(snapLog(Number(e.target.value))))}
        />
      </div>

      <div className="relative h-4 text-[10px] uppercase text-dim">
        {DECAY_STAGES.map((s) => (
          <button
            key={s.years}
            type="button"
            disabled={disabled}
            onClick={() => onChange(s.years)}
            style={{ left: `${pct(yearsToLog(s.years))}%` }}
            className={`absolute -translate-x-1/2 whitespace-nowrap hover:text-white ${
              s.years === years ? "text-accent" : ""
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
