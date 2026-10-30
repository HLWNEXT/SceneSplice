// Node IDs in workflows/decay.api.json that the UI writes to. If you re-export the
// workflow from ComfyUI, update these IDs (enable Settings > Dev mode > "Save (API format)").
export const NODE = {
  inputImage: "4",
  fluxPrompt: "7",
  fluxSampler: "11",
  ltxPrompt: "22",
  ltxSampler: "28",
  outputVideo: "31",
} as const;

type Workflow = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

export type WorkflowParams = {
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
  set(NODE.fluxPrompt, "text", p.decayPrompt);
  set(NODE.fluxSampler, "seed", p.seed);
  set(NODE.ltxPrompt, "text", p.atmospherePrompt);
  set(NODE.ltxSampler, "noise_seed", p.seed);
  return wf;
}
