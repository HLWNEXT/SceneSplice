// Curated "butterfly action" list: counterfactual decisions the user can apply to the street's
// past or future. Each is phrased as a global-scale event so Gemini has a concrete cause to
// reason the scene's effect from, regardless of which direction in time it's paired with.

export type ButterflyAction = {
  id: string;
  label: string;
  prompt: string;
};

export const BUTTERFLY_ACTIONS: readonly ButterflyAction[] = [
  {
    id: "solar",
    label: "Solar goes global",
    prompt: "solar power became the dominant source of energy worldwide",
  },
  {
    id: "sea-level",
    label: "Seas rise 2 meters",
    prompt: "global sea levels rose two meters, reshaping every coastal and low-lying street",
  },
  {
    id: "car-free",
    label: "Cities go car-free",
    prompt: "private cars were phased out of city centers in favor of transit, cycling, and walking",
  },
  {
    id: "vertical-farming",
    label: "Vertical farms everywhere",
    prompt: "vertical farming became the primary source of food, with growing towers built into every city block",
  },
  {
    id: "ai-labor",
    label: "Automation replaces labor",
    prompt: "automation and AI replaced most manual labor, emptying or repurposing commercial storefronts",
  },
  {
    id: "mass-migration",
    label: "Climate migration surges",
    prompt: "climate-driven migration dramatically reshaped this city's population and housing density",
  },
  {
    id: "nuclear",
    label: "Nuclear power scales up",
    prompt: "nuclear power scaled up to replace fossil fuels as the main grid energy source",
  },
  {
    id: "reforestation",
    label: "Global reforestation",
    prompt: "a worldwide reforestation effort reclaimed unused urban land and lined every street with new forest",
  },
];

/** Either a curated preset's prompt text, or free text the user typed in. */
export type ButterflySelection = { id: string } | { custom: string };

export function butterflyPrompt(selection: ButterflySelection | null): string | null {
  if (!selection) return null;
  if ("custom" in selection) return selection.custom.trim() || null;
  return BUTTERFLY_ACTIONS.find((a) => a.id === selection.id)?.prompt ?? null;
}
