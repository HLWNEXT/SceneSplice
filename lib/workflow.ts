// Node IDs in workflows/decay.api.json that the UI writes to. If you re-export the
// workflow from ComfyUI, update these IDs (enable Settings > Dev mode > "Save (API format)").
export const NODE = {
  inputImage: "4",
  depthImage: "40",
  controlNetApply: "43",
  fluxPrompt: "7",
  fluxSampler: "11",
  ltxPrompt: "22",
  ltxSampler: "28",
  outputVideo: "31",
} as const;

/** Status text and overall-progress range (0-100) for each node, used to drive the progress bar. */
export const NODE_PROGRESS: Record<string, { label: string; from: number; to: number }> = {
  "1": { label: "Loading FLUX Kontext...", from: 0, to: 3 },
  "2": { label: "Loading text encoders...", from: 0, to: 3 },
  "5": { label: "Preparing as-built image...", from: 3, to: 5 },
  "7": { label: "Encoding decay prompt...", from: 3, to: 5 },
  "11": { label: "Running FLUX pass...", from: 5, to: 45 },
  "12": { label: "Decoding ruined keyframe...", from: 45, to: 48 },
  "20": { label: "Loading LTX-Video...", from: 48, to: 52 },
  "24": { label: "Initializing LTX motion...", from: 52, to: 55 },
  "28": { label: "Generating LTX motion...", from: 55, to: 90 },
  "29": { label: "Decoding video frames...", from: 90, to: 96 },
  "31": { label: "Encoding MP4...", from: 96, to: 99 },
};

type Workflow = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

/** Added to the FLUX prompt in map mode, where the input is a white-box render rather than a photo. */
export const MAP_PROMPT_PREFIX =
  "Transform this white massing model of an urban block into a photorealistic photograph of the real buildings, keeping the exact geometry, camera angle and layout. Then age it: ";

const CONTROLNET_NODES = ["40", "41", "42", "43"];

export type WorkflowParams = {
  /** "upload": user-supplied render, no depth guide. "map": white-box render + depth ControlNet. */
  mode?: "upload" | "map";
  imageName: string;
  /** Required in map mode. */
  depthName?: string;
  decayPrompt: string;
  atmospherePrompt: string;
  seed: number;
};

/** Returns a copy of the template with the UI's values injected. */
export function buildWorkflow(template: Workflow, p: WorkflowParams): Workflow {
  const wf = structuredClone(template);
  const set = (id: string, key: string, value: unknown) => {
    if (!wf[id]) throw new Error(`Workflow is missing node ${id}`);
    wf[id].inputs[key] = value;
  };
  set(NODE.inputImage, "image", p.imageName);
  if (p.mode === "map") {
    if (!p.depthName) throw new Error("Map mode needs a depth image.");
    set(NODE.depthImage, "image", p.depthName);
    set(NODE.fluxSampler, "positive", [NODE.controlNetApply, 0]);
    set(NODE.fluxSampler, "negative", [NODE.controlNetApply, 1]);
  } else {
    for (const id of CONTROLNET_NODES) delete wf[id];
  }
  set(NODE.fluxPrompt, "text", (p.mode === "map" ? MAP_PROMPT_PREFIX : "") + p.decayPrompt);
  set(NODE.fluxSampler, "seed", p.seed);
  set(NODE.ltxPrompt, "text", p.atmospherePrompt);
  set(NODE.ltxSampler, "noise_seed", p.seed);
  return wf;
}
