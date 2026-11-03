// Chrono-Slider model: the slider works in log10(years) so each decade gets equal travel.

export type DecayStage = {
  years: number;
  label: string;
  summary: string;
  prompt: string;
};

export const DECAY_STAGES: readonly DecayStage[] = [
  {
    years: 10,
    label: "10 YR",
    summary: "Mild wear, scuffed floors",
    prompt: "mild wear and tear, scuffed floors, faded paint, light dust on surfaces",
  },
  {
    years: 100,
    label: "100 YR",
    summary: "Broken windows, creeping vegetation, water damage",
    prompt:
      "broken windows, creeping vegetation, water damage stains, peeling plaster, rusted fixtures, debris on the floor",
  },
  {
    years: 1_000,
    label: "1,000 YR",
    summary: "Structural collapse, heavy overgrowth",
    prompt:
      "partial structural collapse, caved-in ceiling, exposed rebar, heavy overgrowth of ivy and moss, trees growing through the floor",
  },
  {
    years: 10_000,
    label: "10,000 YR",
    summary: "Complete ecological reclamation, ancient ruin",
    prompt:
      "ancient ruin, complete ecological reclamation, crumbled walls swallowed by forest, weathered stone, no trace of the original finishes",
  },
];

export const MIN_LOG = 1; // 10 years
export const MAX_LOG = 4; // 10,000 years
const SNAP_RADIUS = 0.07; // in log10 units

export const yearsToLog = (years: number) => Math.log10(years);
export const logToYears = (log: number) => Math.round(10 ** log);

/** Snap to the nearest stage when the slider is within SNAP_RADIUS of it. */
export function snapLog(log: number): number {
  for (const stage of DECAY_STAGES) {
    const target = yearsToLog(stage.years);
    if (Math.abs(log - target) <= SNAP_RADIUS) return target;
  }
  return log;
}

export function formatYears(years: number): string {
  return years.toLocaleString("en-US");
}

export function nearestStage(years: number): DecayStage {
  const log = yearsToLog(years);
  return DECAY_STAGES.reduce((best, s) =>
    Math.abs(yearsToLog(s.years) - log) < Math.abs(yearsToLog(best.years) - log) ? s : best,
  );
}

/**
 * Translate the slider value into the text injected into the FLUX positive prompt node.
 * Between stages we blend the two neighbouring descriptions, weighting by proximity
 * using ComfyUI's `(text:weight)` syntax.
 */
export function yearsToPrompt(years: number): string {
  const log = Math.min(MAX_LOG, Math.max(MIN_LOG, yearsToLog(years)));
  const upperIdx = DECAY_STAGES.findIndex((s) => yearsToLog(s.years) >= log);
  const upper = DECAY_STAGES[upperIdx];
  if (upperIdx <= 0 || yearsToLog(upper.years) === log) return upper.prompt;

  const lower = DECAY_STAGES[upperIdx - 1];
  const t = (log - yearsToLog(lower.years)) / (yearsToLog(upper.years) - yearsToLog(lower.years));
  const w = (x: number) => (0.6 + 0.8 * x).toFixed(2);
  return `(${lower.prompt}:${w(1 - t)}), (${upper.prompt}:${w(t)}), abandoned architecture after ${formatYears(years)} years of decay`;
}
