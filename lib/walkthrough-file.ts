// Export / import of a walkthrough as a JSON file. The file holds the scenes (structure, timeline position,
// prompts, modes) and references to the drawing, render and clip files on the ComfyUI server, not copies of
// them, so it stays small. Pure logic only, so it runs under node --test.

import type { StoryNode, StoryTree } from "./storyline.ts";
import { MAX_FILM_SECONDS, MAX_REFERENCES, MAX_SCENES, type ClipMode, type ComfyFile, type SceneData, type SceneMap, type SceneMode, type Upload } from "./walkthrough.ts";

export const WALKTHROUGH_FILE_APP = "whatifstreet-walkthrough";
export const WALKTHROUGH_FILE_VERSION = 1;

export type WalkthroughFileData = {
  /** The design intent text. */
  style: string;
  tree: StoryTree;
  scenes: SceneMap;
  film: ComfyFile | null;
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function comfyFile(v: unknown, what: string): ComfyFile {
  if (!isObj(v) || !isStr(v.filename) || !isStr(v.subfolder) || !isStr(v.type) || !v.filename) throw new Error(`${what} has an invalid file reference.`);
  return { filename: v.filename, subfolder: v.subfolder, type: v.type };
}

function upload(v: unknown, what: string): Upload {
  if (!isObj(v)) throw new Error(`${what} is malformed.`);
  return { file: comfyFile(v.file, what), label: isStr(v.label) ? v.label : v.file && isObj(v.file) && isStr(v.file.filename) ? v.file.filename : "" };
}

/** Serialises a walkthrough. Only the structure fields of each node are kept: everything else lives in `scenes`. */
export function exportWalkthroughFile(data: WalkthroughFileData, now = new Date()): string {
  const nodes = Object.values(data.tree).map((n) => ({ id: n.id, parentId: n.parentId, text: n.text, year: n.year, y: n.y }));
  return JSON.stringify(
    { app: WALKTHROUGH_FILE_APP, version: WALKTHROUGH_FILE_VERSION, exportedAt: now.toISOString(), style: data.style, nodes, scenes: data.scenes, film: data.film },
    null,
    2,
  );
}

const MODES: readonly SceneMode[] = ["whitebox", "rendered", "inbetween"];
const CLIP_MODES: readonly ClipMode[] = ["flf2v", "single"];

function scene(id: string, v: unknown): SceneData {
  if (!isObj(v) || !MODES.includes(v.mode as SceneMode)) throw new Error(`Scene "${id}" has an invalid type.`);
  const s: SceneData = {
    mode: v.mode as SceneMode,
    name: isStr(v.name) ? v.name : "",
    imagePrompt: isStr(v.imagePrompt) ? v.imagePrompt : "",
    references: Array.isArray(v.references) ? v.references.slice(0, MAX_REFERENCES).map((r) => upload(r, `A reference of scene "${id}"`)) : [],
  };
  if (v.drawing) s.drawing = upload(v.drawing, `Scene "${id}"'s drawing`);
  if (isObj(v.render) && v.render.file) {
    s.render = { file: comfyFile(v.render.file, `Scene "${id}"'s render`), prompt: isStr(v.render.prompt) ? v.render.prompt : "", generatedAt: isNum(v.render.generatedAt) ? v.render.generatedAt : 0 };
  }
  if (v.video) s.video = comfyFile(v.video, `Scene "${id}"'s video`);
  if (isObj(v.videoMeta) && isStr(v.videoMeta.prompt) && isStr(v.videoMeta.from)) {
    s.videoMeta = { prompt: v.videoMeta.prompt, from: v.videoMeta.from };
    if (CLIP_MODES.includes(v.videoMeta.mode as ClipMode)) s.videoMeta.mode = v.videoMeta.mode as ClipMode;
    if (isNum(v.videoMeta.gap)) s.videoMeta.gap = v.videoMeta.gap;
  }
  return s;
}

/** Reads and validates a walkthrough file; throws an Error with a user-readable message when it isn't one. */
export function parseWalkthroughFile(text: string): WalkthroughFileData {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  if (!isObj(raw) || raw.app !== WALKTHROUGH_FILE_APP) throw new Error("That isn't a walkthrough file.");
  if (raw.version !== WALKTHROUGH_FILE_VERSION) throw new Error(`Unsupported walkthrough file version (${String(raw.version)}).`);
  if (!Array.isArray(raw.nodes) || raw.nodes.length === 0) throw new Error("The walkthrough file has no scenes.");
  if (raw.nodes.length > MAX_SCENES) throw new Error(`The walkthrough file has ${raw.nodes.length} scenes; the most allowed is ${MAX_SCENES}.`);

  const tree: StoryTree = {};
  for (const r of raw.nodes) {
    if (!isObj(r) || !isStr(r.id) || !r.id || !isStr(r.text) || !isNum(r.year) || !isNum(r.y)) throw new Error("A scene in the file is malformed.");
    if (tree[r.id]) throw new Error(`Duplicate scene id "${r.id}".`);
    if (r.parentId !== null && !isStr(r.parentId)) throw new Error(`Scene "${r.id}" has an invalid parent.`);
    if (r.year > MAX_FILM_SECONDS) throw new Error(`Scene "${r.id}" sits past the ${MAX_FILM_SECONDS / 60}-minute limit.`);
    const node: StoryNode = { id: r.id, parentId: r.parentId, text: r.text, year: Math.max(0, r.year), y: r.y };
    tree[r.id] = node;
  }

  if (Object.values(tree).filter((n) => n.parentId === null).length !== 1) throw new Error("The walkthrough must have exactly one first scene.");
  for (const n of Object.values(tree)) {
    const seen = new Set<string>();
    for (let cur: StoryNode | undefined = n; cur; cur = cur.parentId ? tree[cur.parentId] : undefined) {
      if (seen.has(cur.id)) throw new Error("The walkthrough has a loop in it.");
      seen.add(cur.id);
      if (cur.parentId && !tree[cur.parentId]) throw new Error(`Scene "${cur.id}" points at a missing parent.`);
    }
  }

  const scenes: SceneMap = {};
  if (raw.scenes !== undefined && !isObj(raw.scenes)) throw new Error("The scene data in the file is malformed.");
  for (const [id, v] of Object.entries(raw.scenes ?? {})) {
    if (tree[id]) scenes[id] = scene(id, v); // data for scenes that aren't in the tree is dropped
  }
  return { style: isStr(raw.style) ? raw.style : "", tree, scenes, film: raw.film ? comfyFile(raw.film, "The final film") : null };
}
