// Time-travel slider model: a bidirectional version of the decay slider's log10(years) idea.
// Position `pos` runs from -MAX_LOG to +MAX_LOG. Near the center it ramps linearly from 0 so
// "Today" (0 years) is an exact, reachable point rather than an asymptote; beyond +-10 years
// it switches to a log scale, same spirit as lib/decay.ts, so each decade out gets equal travel.

export type TimeStage = {
  offsetYears: number; // negative = past, 0 = today, positive = future
  label: string;
  summary: string;
};

// Tick labels are two lines ("200 YR" / "AGO") so they stay narrow enough not to overlap their
// neighbors along the track; components render the "\n" as a line break.
export const TIME_STAGES: readonly TimeStage[] = [
  { offsetYears: -200, label: "200 YR\nAGO", summary: "A different era, told secondhand" },
  { offsetYears: -50, label: "50 YR\nAGO", summary: "Beyond living memory for most" },
  { offsetYears: -10, label: "10 YR\nAGO", summary: "Recognizable, a little dated" },
  { offsetYears: 0, label: "TODAY", summary: "The present day" },
  { offsetYears: 10, label: "10 YR\nAHEAD", summary: "A near, plausible future" },
  { offsetYears: 50, label: "50 YR\nAHEAD", summary: "A generation of change" },
  { offsetYears: 200, label: "200 YR\nAHEAD", summary: "Speculative, still grounded here" },
];

const LINEAR_EDGE_YEARS = 10; // below this magnitude, position scales linearly instead of logarithmically
export const MIN_LOG = Math.log10(LINEAR_EDGE_YEARS); // 1
export const MAX_LOG = Math.log10(200);
const SNAP_RADIUS = 0.07; // in position units, same units as MIN_LOG/MAX_LOG

/** Years (signed, can be fractional mid-drag) -> slider position. Inverse of posToYears. */
export function yearsToPos(years: number): number {
  if (years === 0) return 0;
  const mag = Math.abs(years);
  const pos = mag <= LINEAR_EDGE_YEARS ? (mag / LINEAR_EDGE_YEARS) * MIN_LOG : Math.log10(mag);
  return Math.sign(years) * pos;
}

/** Slider position -> whole years (signed). Inverse of yearsToPos. */
export function posToYears(pos: number): number {
  if (pos === 0) return 0;
  const mag = Math.abs(pos);
  const years = mag <= MIN_LOG ? (mag / MIN_LOG) * LINEAR_EDGE_YEARS : 10 ** mag;
  return Math.sign(pos) * Math.round(years);
}

/** Snap to the nearest stage when the slider is within SNAP_RADIUS of it. */
export function snapPos(pos: number): number {
  for (const stage of TIME_STAGES) {
    const target = yearsToPos(stage.offsetYears);
    if (Math.abs(pos - target) <= SNAP_RADIUS) return target;
  }
  return pos;
}

export function nearestStage(years: number): TimeStage {
  const pos = yearsToPos(years);
  return TIME_STAGES.reduce((best, s) =>
    Math.abs(yearsToPos(s.offsetYears) - pos) < Math.abs(yearsToPos(best.offsetYears) - pos) ? s : best,
  );
}

export function formatOffset(years: number): string {
  if (years === 0) return "TODAY";
  const abs = Math.abs(years).toLocaleString("en-US");
  return years < 0 ? `${abs} YR AGO` : `${abs} YR AHEAD`;
}

/** Natural-language fragment handed to Gemini as the time context, e.g. "150 years in the past". */
export function timeHint(years: number): string {
  if (years === 0) return "today, the present day, unchanged in time";
  const abs = Math.abs(years).toLocaleString("en-US");
  return years < 0 ? `${abs} years in the past` : `${abs} years in the future`;
}
