// Export / import of a storyline as a JSON file. The file holds the starting points, every beat, and
// references (not copies) to the keyframe and video files on the ComfyUI server, so it stays small.
// Pure: URLs for the images are derived on import through the `toUrl` callback.

import type { ButterflySelection } from "./butterfly.ts";
import type { ClimateSelection } from "./climate.ts";
import type { ComfyFile, StoryNode, StoryTree } from "./storyline.ts";

export const STORY_FILE_APP = "whatifstreet-storyline";
export const STORY_FILE_VERSION = 1;

export type StoryInputs = {
  location: string | null;
  /** Slider value: years ahead (+) or ago (-). */
  years: number;
  butterfly: ButterflySelection | null;
  climate: ClimateSelection;
  climateSet: boolean;
};

export type StoryFileData = { inputs: StoryInputs; tree: StoryTree; film: ComfyFile | null };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function comfyFile(v: unknown, what: string): ComfyFile {
  if (!isObj(v) || !isStr(v.filename) || !isStr(v.subfolder) || !isStr(v.type) || !v.filename) throw new Error(`${what} has an invalid file reference.`);
  return { filename: v.filename, subfolder: v.subfolder, type: v.type };
}

export function exportStoryFile(data: StoryFileData, now = new Date()): string {
  const nodes = Object.values(data.tree).map((n) => {
    const { keyframe, ...rest } = n;
    // `image` is a URL for this session's server; it is rebuilt from `file` on import.
    return keyframe?.file ? { ...rest, keyframe: { prompt: keyframe.prompt, file: keyframe.file, generatedAt: keyframe.generatedAt } } : rest;
  });
  return JSON.stringify(
    { app: STORY_FILE_APP, version: STORY_FILE_VERSION, exportedAt: now.toISOString(), inputs: data.inputs, nodes, film: data.film },
    null,
    2,
  );
}

function selection(v: unknown): { id: string } | { custom: string } | null {
  if (!isObj(v)) return null;
  if (isStr(v.custom)) return { custom: v.custom };
  if (isStr(v.id)) return { id: v.id };
  return null;
}

/** Reads and validates a storyline file; throws an Error with a user-readable message when it isn't one. */
export function parseStoryFile(text: string, toUrl: (f: ComfyFile) => string): StoryFileData {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  if (!isObj(raw) || raw.app !== STORY_FILE_APP) throw new Error("That isn't a WhatIfStreet storyline file.");
  if (raw.version !== STORY_FILE_VERSION) throw new Error(`Unsupported storyline file version (${String(raw.version)}).`);
  if (!Array.isArray(raw.nodes) || raw.nodes.length === 0) throw new Error("The storyline file has no beats.");
  if (raw.nodes.length > 200) throw new Error("The storyline file has too many beats.");

  const tree: StoryTree = {};
  for (const r of raw.nodes) {
    if (!isObj(r) || !isStr(r.id) || !r.id || !isStr(r.text) || !isNum(r.year) || !isNum(r.y)) throw new Error("A beat in the file is malformed.");
    if (tree[r.id]) throw new Error(`Duplicate beat id "${r.id}".`);
    if (r.parentId !== null && !isStr(r.parentId)) throw new Error(`Beat "${r.id}" has an invalid parent.`);
    const node: StoryNode = { id: r.id, parentId: r.parentId, text: r.text, year: Math.max(0, r.year), y: r.y };
    if (r.origin === true) node.origin = true;
    if (isObj(r.keyframe) && r.keyframe.file) {
      const file = comfyFile(r.keyframe.file, `Beat "${r.id}"'s keyframe`);
      node.keyframe = {
        prompt: isStr(r.keyframe.prompt) ? r.keyframe.prompt : "",
        image: toUrl(file),
        file,
        generatedAt: isNum(r.keyframe.generatedAt) ? r.keyframe.generatedAt : 0,
      };
    }
    if (r.video) node.video = comfyFile(r.video, `Beat "${r.id}"'s video`);
    if (isObj(r.videoMeta) && isStr(r.videoMeta.prompt) && (r.videoMeta.mode === "flf2v" || r.videoMeta.mode === "single")) {
      node.videoMeta = { prompt: r.videoMeta.prompt, mode: r.videoMeta.mode };
    }
    tree[r.id] = node;
  }

  if (Object.values(tree).filter((n) => n.parentId === null).length !== 1) throw new Error("The storyline must have exactly one starting beat.");
  for (const n of Object.values(tree)) {
    const seen = new Set<string>();
    for (let cur: StoryNode | undefined = n; cur; cur = cur.parentId ? tree[cur.parentId] : undefined) {
      if (seen.has(cur.id)) throw new Error("The storyline has a loop in it.");
      seen.add(cur.id);
      if (cur.parentId && !tree[cur.parentId]) throw new Error(`Beat "${cur.id}" points at a missing parent.`);
    }
  }

  const i = isObj(raw.inputs) ? raw.inputs : {};
  const inputs: StoryInputs = {
    location: isStr(i.location) ? i.location : null,
    years: isNum(i.years) ? Math.max(-200, Math.min(200, i.years)) : 0,
    butterfly: selection(i.butterfly),
    climate: selection(i.climate),
    climateSet: i.climateSet === true,
  };
  return { inputs, tree, film: raw.film ? comfyFile(raw.film, "The final film") : null };
}
