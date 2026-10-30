export type Atmosphere = {
  id: string;
  label: string;
  /** Disaster motion description injected into the video (LTX) prompt. */
  prompt: string;
};

export const ATMOSPHERES: readonly Atmosphere[] = [
  { id: "rain", label: "Heavy Rain", prompt: "heavy rain pouring through the openings, streaming water, wet reflective surfaces" },
  { id: "dust", label: "Dust Storm", prompt: "dust storm blowing through the space, swirling sand and debris" },
  { id: "fire", label: "Fire & Ash", prompt: "embers and ash drifting through the air, distant fire glow, smoke" },
  { id: "fog", label: "Overcast Fog", prompt: "thick overcast fog drifting slowly, soft diffuse light" },
];
