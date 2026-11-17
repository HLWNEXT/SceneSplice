// Walkthrough: a multi-scene interior film laid out on the same canvas as the WhatIfStreet storyline.
// Each scene is a node of a StoryTree (lib/storyline.ts): its text is the scene's prompt, its position on
// the canvas orders it, and links say which scene leads into which, so a walkthrough can branch into
// alternative routes. Everything the canvas doesn't know about (drawing, references, render, clip) lives in
// a separate map keyed by node id. Consecutive scenes on a route are joined by a first-frame / last-frame
// video, and an "in-between" scene is generated from its neighbours. Pure logic only, so it runs under node --test.

import { childrenOf, pathToRoot, type StoryNode, type StoryTree, NEW_BEAT_TEXT } from "./storyline.ts";

export type ComfyFile = { filename: string; subfolder: string; type: string };

/** An image the user uploaded to ComfyUI; `file` is the input-folder reference. */
export type Upload = { file: ComfyFile; label: string };

/** whitebox: render from a drawing. rendered: use the drawing as the frame. inbetween: generated from its two neighbours. */
export type SceneMode = "whitebox" | "rendered" | "inbetween";

export type SceneData = {
  mode: SceneMode;
  name: string;
  /** The uploaded drawing. Not used by in-between scenes. */
  drawing?: Upload;
  /** Extra images for a white-box render: materials, mood, furniture. */
  references: Upload[];
  /** The generated frame (white-box and in-between scenes). */
  render?: { file: ComfyFile; prompt: string; generatedAt: number };
  /** The clip that arrives at this scene from its parent. */
  video?: ComfyFile;
  /** What the clip was made from, so it can be flagged out of date. */
  videoMeta?: { prompt: string; from: string };
};

/** Scene data by node id. A node with no entry is a blank white-box scene. */
export type SceneMap = Record<string, SceneData>;

export const MAX_REFERENCES = 6;
export const MAX_SCENES = 24;
export const EMPTY_SCENE_TEXT = "Untitled scene — click to describe it.";

export const blankScene = (mode: SceneMode = "whitebox"): SceneData => ({ mode, name: "", references: [] });
export const sceneOf = (map: SceneMap, id: string): SceneData => map[id] ?? blankScene();

/** A fresh walkthrough: one empty scene. */
export function newWalkthrough(): StoryTree {
  return { start: { id: "start", parentId: null, text: "", year: 0, y: 0 } };
}

/** The scene's prompt: its node text, minus the placeholders the canvas puts in new or emptied nodes. */
export function promptOf(node: StoryNode | undefined): string {
  return promptDraft(node).trim();
}

/** Same as promptOf but untrimmed, for the text box: trimming while typing would swallow every space the user types. */
export function promptDraft(node: StoryNode | undefined): string {
  const text = node?.text ?? "";
  const t = text.trim();
  return t === NEW_BEAT_TEXT || t === EMPTY_SCENE_TEXT || t.startsWith("Untitled beat") ? "" : text;
}

/** Name shown for a scene: its own, or "Scene 3" by depth along its route. */
export function sceneLabel(tree: StoryTree, map: SceneMap, id: string): string {
  if (!tree[id]) return "";
  return sceneOf(map, id).name.trim() || `Scene ${pathToRoot(tree, id).length}`;
}

/** The frame a scene contributes to the film, or null while it is not ready. */
export function finalFrame(s: SceneData): ComfyFile | null {
  return s.mode === "rendered" ? (s.drawing?.file ?? null) : (s.render?.file ?? null);
}

const frameOf = (map: SceneMap, id: string | null | undefined) => (id ? finalFrame(sceneOf(map, id)) : null);

export const fileKey = (f: ComfyFile) => `${f.type}/${f.subfolder}/${f.filename}`;

/** The scene an in-between frame leads into: its first child on the canvas. */
export const nextScene = (tree: StoryTree, id: string): StoryNode | undefined => childrenOf(tree, id)[0];

/** Why a scene's image can't be generated yet (or its drawing is missing); null when it is ready. */
export function sceneBlocker(tree: StoryTree, map: SceneMap, id: string): string | null {
  const node = tree[id];
  if (!node) return "Scene not found.";
  const s = sceneOf(map, id);
  if (s.mode === "inbetween") {
    if (!frameOf(map, node.parentId) || !frameOf(map, nextScene(tree, id)?.id)) {
      return "An in-between scene needs a finished scene before it and after it (link one in on each side).";
    }
    return null;
  }
  if (!s.drawing) return s.mode === "whitebox" ? "Upload a white-box view first." : "Upload the rendered view first.";
  if (s.mode === "whitebox" && !promptOf(node)) return "Describe what to render first.";
  return null;
}

/** Can the image be generated for this scene? Rendered scenes never need generating. */
export const canGenerate = (tree: StoryTree, map: SceneMap, id: string) =>
  sceneOf(map, id).mode !== "rendered" && sceneBlocker(tree, map, id) === null;

/** Signature of the two frames a clip joins; changes whenever either frame or the link does. Null when not both ready. */
export function transitionKey(tree: StoryTree, map: SceneMap, id: string): string | null {
  const a = frameOf(map, tree[id]?.parentId);
  const b = frameOf(map, id);
  return a && b ? `${fileKey(a)}>${fileKey(b)}` : null;
}

/** Why the clip into this scene can't be made yet; null when it can. */
export function videoBlocker(tree: StoryTree, map: SceneMap, id: string): string | null {
  const parent = tree[id]?.parentId;
  if (!parent) return "The first scene has no clip: it is where the walk starts.";
  return transitionKey(tree, map, id) ? null : `${sceneLabel(tree, map, parent)} and this scene both need a finished frame first.`;
}

/** A clip exists but its frames have since changed (regenerated, replaced or re-linked). */
export function videoStale(tree: StoryTree, map: SceneMap, id: string): boolean {
  const s = map[id];
  if (!s?.video || !s.videoMeta) return false;
  return s.videoMeta.from !== transitionKey(tree, map, id);
}

/**
 * The route the film follows: from the first scene down to `selectedId`, then on along the first branch to
 * the end. With nothing selected it is the first branch all the way.
 */
export function route(tree: StoryTree, selectedId: string | null): StoryNode[] {
  const root = Object.values(tree).find((n) => n.parentId === null);
  if (!root) return [];
  const head = selectedId && tree[selectedId] ? pathToRoot(tree, selectedId) : [root];
  const out = [...head];
  for (let next = nextScene(tree, out[out.length - 1].id); next; next = nextScene(tree, next.id)) out.push(next);
  return out;
}

/** Clips along a route, in order. Stale clips are included: the film flags them rather than dropping them. */
export function routeClips(map: SceneMap, nodes: StoryNode[]): { id: string; file: ComfyFile }[] {
  return nodes.flatMap((n) => (map[n.id]?.video ? [{ id: n.id, file: map[n.id].video! }] : []));
}

/** Drops scene data for nodes that no longer exist (after a delete). Returns the same map when nothing is dropped. */
export function pruneScenes(tree: StoryTree, map: SceneMap): SceneMap {
  const keep = Object.entries(map).filter(([id]) => tree[id]);
  return keep.length === Object.keys(map).length ? map : Object.fromEntries(keep);
}

/** Switching mode keeps the drawing but drops what only made sense for the old mode. */
export function setMode(s: SceneData, mode: SceneMode): SceneData {
  if (mode === s.mode) return s;
  return { ...s, mode, render: undefined, references: mode === "whitebox" ? s.references : [] };
}

/**
 * The tree as the canvas draws it: each scene with a frame shows it as its keyframe thumbnail, and scenes
 * without one show none. `imageUrl` turns a ComfyUI file into something an <img> can load.
 */
export function displayTree(tree: StoryTree, map: SceneMap, imageUrl: (f: ComfyFile) => string): StoryTree {
  return Object.fromEntries(
    Object.entries(tree).map(([id, n]) => {
      const f = frameOf(map, id);
      const keyframe = f ? { prompt: promptOf(n), image: imageUrl(f), file: f, generatedAt: map[id]?.render?.generatedAt ?? 0 } : undefined;
      return [id, { ...n, keyframe }];
    }),
  );
}

/** "/upload/image" result name ("sub/name.png" or "name.png") -> the input-folder file reference. */
export function uploadedFile(name: string): ComfyFile {
  const slash = name.lastIndexOf("/");
  return { filename: name.slice(slash + 1), subfolder: slash < 0 ? "" : name.slice(0, slash), type: "input" };
}

// --- prompts ---

/** The instruction handed to the image model. Image 1 is always the one being edited. */
export function renderPrompt(p: { style: string; prompt: string; referenceCount: number }): string {
  return [
    "Image 1 is a white-box (massing / clay) view of an interior. Render it as a photorealistic interior photograph.",
    "Keep the room's geometry exactly as drawn: the walls, openings, ceiling, furniture placement, camera position, lens and framing do not change. Only materials, finishes, furniture detail, lighting and atmosphere are added.",
    p.referenceCount > 0
      ? `Images 2 to ${p.referenceCount + 1} are references for materials, colour, mood and furnishing. Borrow their look, not their layout.`
      : null,
    p.style.trim() ? `Overall design intent for the whole walkthrough: ${p.style.trim()}` : null,
    `This scene: ${p.prompt.trim()}`,
  ]
    .filter(Boolean)
    .join(" ");
}

/** The instruction for an in-between frame: image 1 comes before it, image 2 after. */
export function inbetweenPrompt(p: { style: string; prompt: string }): string {
  return [
    "Image 1 is a frame of an interior walkthrough and image 2 is the frame that comes after it, in the same building.",
    "Create the frame that sits between them: a continuous camera move from the first view toward the second, with the same architecture, materials, furniture and lighting, as one photorealistic interior photograph.",
    p.style.trim() ? `Overall design intent: ${p.style.trim()}` : null,
    p.prompt.trim() ? `What this in-between view shows: ${p.prompt.trim()}` : "Pick a natural halfway viewpoint.",
  ]
    .filter(Boolean)
    .join(" ");
}

/** The per-run message for the video-prompt Gemini node (interior flavour). */
export function walkthroughVideoRequest(p: { from: string; to: string; style: string }): string {
  return [
    "Two frames of the same interior are attached, first then last.",
    p.from.trim() ? `First frame: ${p.from.trim()}` : null,
    p.to.trim() ? `Last frame: ${p.to.trim()}` : null,
    "The clip is a continuous camera move through the space from the first frame to the last.",
    p.style.trim() ? `Overall design intent: ${p.style.trim()}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

/** What to animate with when the prompt-writing step is unavailable. */
export function fallbackWalkthroughPrompt(p: { from: string; to: string }): string {
  return [
    "A smooth continuous camera move through the interior, travelling from the first view to the second, no scene cuts.",
    p.to.trim() || p.from.trim(),
    "Soft natural light and gentle ambient motion, quiet room tone.",
  ]
    .filter(Boolean)
    .join(" ");
}
