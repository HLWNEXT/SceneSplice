// Curated weather/climate list for WhatIfStreet. Separate from lib/atmosphere.ts, which is
// disaster-flavored motion text for the decay mode's video prompt — this is optional, everyday
// climate context handed to Gemini, not injected into a video motion prompt directly.

export type ClimateCondition = {
  id: string;
  label: string;
  prompt: string;
};

export const CLIMATE_CONDITIONS: readonly ClimateCondition[] = [
  { id: "clear", label: "Clear Sky", prompt: "a clear sky and bright natural daylight" },
  { id: "rain", label: "Rain", prompt: "steady rain, wet pavement, reflections in puddles" },
  { id: "snow", label: "Snow", prompt: "snow covering the ground and rooftops, cold overcast light" },
  { id: "heatwave", label: "Heatwave Haze", prompt: "a shimmering heatwave haze and harsh midday sun" },
  { id: "flood", label: "Flooded Street", prompt: "floodwater standing in the street, reaching curb height" },
  { id: "golden-hour", label: "Golden Hour", prompt: "warm low golden-hour light and long shadows" },
];

/** Either a curated preset's prompt text, free text the user typed in, or no preference at all. */
export type ClimateSelection = { id: string } | { custom: string } | null;

export function climatePrompt(selection: ClimateSelection): string | null {
  if (!selection) return null;
  if ("custom" in selection) return selection.custom.trim() || null;
  return CLIMATE_CONDITIONS.find((c) => c.id === selection.id)?.prompt ?? null;
}
