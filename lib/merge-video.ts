// Joins the beats' clips into one film. workflows/utility-merge-video-*.json is the reference: a subgraph that
// concatenates two clips (images batched, audio concatenated, re-wrapped as a video). ComfyUI's /prompt takes
// a flat graph, so this builds the same chain for any number of clips instead of the subgraph's fixed 2 or 4.

import type { StoryTree } from "./storyline.ts";

type Workflow = Record<string, { class_type: string; inputs: Record<string, unknown>; _meta?: { title: string } }>;
type ClipFile = { filename: string; subfolder: string; type: string };

export const NODE_MERGE = { output: "900" } as const;
export const MERGE_NODE_PROGRESS = { [NODE_MERGE.output]: { label: "Joining clips into one film...", from: 0, to: 100 } };

/** Beats that have a video, earliest first (ties keep tree order). */
export function mergeOrder(tree: StoryTree): { id: string; file: ClipFile }[] {
  return Object.values(tree)
    .map((n, i) => ({ n, i }))
    .filter(({ n }) => !!n.video)
    .sort((a, b) => a.n.year - b.n.year || a.i - b.i)
    .map(({ n }) => ({ id: n.id, file: n.video! }));
}

/** Changes whenever the set or order of clips changes, so a finished film can be flagged out of date. */
export const mergeSignature = (clips: { file: ClipFile }[]) =>
  clips.map((c) => `${c.file.subfolder}/${c.file.filename}`).join("|");

/** `files` are LoadVideo names, e.g. "video/clip.mp4 [output]". Needs at least two. */
export function buildMergeWorkflow(files: string[], prefix = "whatifstreet/film"): Workflow {
  if (files.length < 2) throw new Error("Need at least two videos to combine.");
  const wf: Workflow = {};
  files.forEach((file, i) => {
    wf[`${100 + i}`] = { class_type: "LoadVideo", inputs: { file }, _meta: { title: `Clip ${i + 1}` } };
  });
  let current = "100";
  for (let i = 1; i < files.length; i++) {
    const a = `${200 + i * 10}`;
    const b = `${201 + i * 10}`;
    const batch = `${202 + i * 10}`;
    const audio = `${203 + i * 10}`;
    const video = `${204 + i * 10}`;
    wf[a] = { class_type: "GetVideoComponents", inputs: { video: [current, 0] } };
    wf[b] = { class_type: "GetVideoComponents", inputs: { video: [`${100 + i}`, 0] } };
    wf[batch] = { class_type: "BatchImagesNode", inputs: { "images.image0": [a, 0], "images.image1": [b, 0] } };
    wf[audio] = { class_type: "AudioConcat", inputs: { audio1: [a, 1], audio2: [b, 1], direction: "after" } };
    wf[video] = { class_type: "CreateVideo", inputs: { images: [batch, 0], audio: [audio, 0], fps: [a, 2] } };
    current = video;
  }
  wf[NODE_MERGE.output] = {
    class_type: "SaveVideo",
    inputs: { video: [current, 0], filename_prefix: prefix, format: "auto", "format.codec": "auto", codec: "auto" },
    _meta: { title: "OUTPUT: combined film" },
  };
  return wf;
}
