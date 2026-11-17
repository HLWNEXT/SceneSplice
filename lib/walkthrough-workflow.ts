// Workflow injectors for the Walkthrough tab. Image generation reuses workflows/api_nano_banana_pro.json (it
// already takes a batch of reference images); this just feeds it any number of them. Video prompts use
// workflows/walkthrough.videoprompt.text.api.json, which has the same node ids as the street one
// (see lib/video-prompt.ts) with an interior-film system prompt.

import { NODE_API_IMAGE } from "./whatifstreet-workflow.ts";

type Workflow = Record<string, { class_type: string; inputs: Record<string, unknown>; _meta?: { title: string } }>;

/** The most images Nano Banana Pro accepts in one request. */
export const MAX_IMAGE_INPUTS = 14;

export type WalkthroughImageParams = {
  /** LoadImage names. The first is the image being edited; the rest are references. */
  imageNames: string[];
  prompt: string;
  seed: number;
};

const BATCH = "36";

/** Nano Banana Pro with several input images: image 1 is the one to render, the rest are references. */
export function buildWalkthroughImageWorkflow(template: Workflow, p: WalkthroughImageParams): Workflow {
  if (p.imageNames.length < 1) throw new Error("Need at least one input image.");
  if (p.imageNames.length > MAX_IMAGE_INPUTS) throw new Error(`At most ${MAX_IMAGE_INPUTS} images can be sent at once.`);
  const wf = structuredClone(template);
  const nano = wf[NODE_API_IMAGE.nanoBanana];
  const batch = wf[BATCH];
  if (!nano || !batch || !wf[NODE_API_IMAGE.inputImage]) throw new Error("API image workflow is missing a node");

  batch.inputs = {};
  p.imageNames.forEach((name, i) => {
    // Image 1 reuses the template's own LoadImage; the others get new nodes with ids that can't clash.
    const id = i === 0 ? NODE_API_IMAGE.inputImage : `ref${i}`;
    wf[id] = { class_type: "LoadImage", inputs: { image: name }, _meta: { title: i === 0 ? "INPUT: image to render" : `INPUT: reference ${i}` } };
    batch.inputs[`images.image${i}`] = [id, 0];
  });
  nano.inputs.prompt = p.prompt;
  nano.inputs.seed = p.seed % 2 ** 31;
  return wf;
}
