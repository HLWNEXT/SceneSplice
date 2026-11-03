// The LLM layer in front of video generation: Gemini looks at the keyframe(s) and the story moment(s)
// and writes the prompt LTX animates from, adding a little motion and one small event.
// Workflow: workflows/videoprompt.text.api.json. Pure logic only, so it runs under node --test.

import { timeHint } from "./timetravel.ts";

export const NODE_VPROMPT = {
  last: "10",
  first: "11",
  batch: "12",
  gemini: "1",
  output: "2",
} as const;

export const VPROMPT_NODE_PROGRESS: Record<string, { label: string; from: number; to: number }> = {
  "1": { label: "Writing the video prompt...", from: 0, to: 95 },
  "2": { label: "Reading the video prompt...", from: 95, to: 100 },
};

type Workflow = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

export type VideoPromptWorkflowParams = {
  /** The selected keyframe (the video's last frame). */
  lastImage: string;
  /** The previous keyframe (the video's first frame), or null when the video is a single-image one. */
  firstImage: string | null;
  prompt: string;
  seed: number;
  /** Clip length the prompt should fit; the template says three seconds. */
  seconds?: number;
};

/** Returns a copy of the template with Gemini looking at one image, or at first-then-last when both exist. */
export function buildVideoPromptWorkflow(template: Workflow, p: VideoPromptWorkflowParams): Workflow {
  const wf = structuredClone(template);
  wf[NODE_VPROMPT.last].inputs.image = p.lastImage;
  if (p.firstImage) {
    wf[NODE_VPROMPT.first].inputs.image = p.firstImage;
  } else {
    delete wf[NODE_VPROMPT.first];
    delete wf[NODE_VPROMPT.batch];
    wf[NODE_VPROMPT.gemini].inputs.images = [NODE_VPROMPT.last, 0];
  }
  wf[NODE_VPROMPT.gemini].inputs.prompt = p.prompt;
  wf[NODE_VPROMPT.gemini].inputs.seed = p.seed;
  if (p.seconds && p.seconds !== 3) {
    const sys = wf[NODE_VPROMPT.gemini].inputs.system_prompt;
    if (typeof sys === "string") wf[NODE_VPROMPT.gemini].inputs.system_prompt = sys.replace("about three seconds", `about ${p.seconds} seconds`);
  }
  return wf;
}

export type VideoPromptRequest = {
  mode: "flf2v" | "single";
  /** Story text of the selected beat (the last frame). */
  beat: string;
  /** Story text of the previous keyframe's beat (the first frame); null in single mode. */
  previousBeat: string | null;
  /** Years from today for the first / last frame. */
  fromOffset: number | null;
  toOffset: number;
  climatePrompt: string | null;
};

/** The per-run user message for the video-prompt Gemini node. */
export function videoPromptRequest(r: VideoPromptRequest): string {
  const frames =
    r.mode === "flf2v" && r.previousBeat !== null && r.fromOffset !== null
      ? [
          `Two frames of the same street are attached, first then last.`,
          `First frame, ${timeHint(r.fromOffset)}: ${r.previousBeat}`,
          `Last frame, ${timeHint(r.toOffset)}: ${r.beat}`,
          `The clip travels from the first frame to the last.`,
        ]
      : [`One frame of a street is attached, ${timeHint(r.toOffset)}: ${r.beat}`, `The clip starts on this frame.`];
  return [...frames, r.climatePrompt ? `Prevailing weather and light: ${r.climatePrompt}.` : null]
    .filter(Boolean)
    .join(" ");
}

/** What to animate with when the LLM layer is unavailable: the story beat plus gentle ambient motion. */
export function fallbackVideoPrompt(r: VideoPromptRequest): string {
  return [
    r.beat,
    r.climatePrompt ?? "dramatic motion, people and vehicles moving urgently, debris and light shifting",
    "dynamic cinematic camera push-in, dramatic light and a striking moment, no scene cuts",
  ].join(" ");
}

/** Strips the wrappers models like to add (code fences, quotes, a "Prompt:" label) and rejects empty replies. */
export function cleanVideoPrompt(raw: string): string {
  let s = raw
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/```/g, "")
    .replace(/^\s*(video\s+)?prompt\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  s = s.replace(/^["“”']+|["“”']+$/g, "").trim();
  if (s.length < 20) throw new Error("The model didn't return a usable video prompt.");
  return s.slice(0, 1500);
}
