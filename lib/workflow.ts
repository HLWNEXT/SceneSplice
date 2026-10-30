// Node IDs in workflows/decay.api.json that the UI writes to. If you re-export the
// workflow from ComfyUI, update these IDs (enable Settings > Dev mode > "Save (API format)").
export const NODE = {
  inputImage: "395",
  fluxPrompt: "407:6",
  fluxSampler: "407:31",
  ltxPrompt: "398_376",
  ltxSamplerBase: "398_339",
  ltxSamplerRefine: "398_338",
  outputVideo: "75",
} as const;

/** Status text and overall-progress range (0-100) for each node, used to drive the progress bar. */
export const NODE_PROGRESS: Record<string, { label: string; from: number; to: number }> = {
  "407:37": { label: "Loading FLUX Kontext...", from: 0, to: 3 },
  "407:38": { label: "Loading text encoders...", from: 0, to: 3 },
  "407:42": { label: "Preparing as-built image...", from: 3, to: 5 },
  "407:6": { label: "Encoding decay prompt...", from: 3, to: 5 },
  "407:31": { label: "Running FLUX pass...", from: 5, to: 38 },
  "407:8": { label: "Decoding ruined keyframe...", from: 38, to: 42 },
  "398_384": { label: "Loading LTX-2.5...", from: 42, to: 46 },
  "398_344": { label: "Generating base motion...", from: 46, to: 68 },
  "398_348": { label: "Upscaling latent...", from: 68, to: 72 },
  "398_368": { label: "Refining motion...", from: 72, to: 90 },
  "398_374": { label: "Decoding video frames...", from: 90, to: 95 },
  "398_358": { label: "Decoding audio...", from: 95, to: 97 },
  "398_370": { label: "Encoding MP4...", from: 97, to: 99 },
};

type Workflow = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

/** Added to the FLUX prompt in map mode, where the input is a white-box render rather than a photo. */
export const MAP_PROMPT_PREFIX =
  "Transform this white massing model of an urban block into a photorealistic photograph of the real buildings, keeping the exact geometry, camera angle and layout. Then age it: ";

export type WorkflowParams = {
  /** "upload": user-supplied render. "map": white-box render, prompted as a massing model to realize. */
  mode?: "upload" | "map";
  imageName: string;
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
  set(NODE.fluxPrompt, "text", (p.mode === "map" ? MAP_PROMPT_PREFIX : "") + p.decayPrompt);
  set(NODE.fluxSampler, "seed", p.seed);
  set(NODE.ltxPrompt, "value", p.atmospherePrompt);
  set(NODE.ltxSamplerBase, "noise_seed", p.seed);
  set(NODE.ltxSamplerRefine, "noise_seed", p.seed);
  return wf;
}
