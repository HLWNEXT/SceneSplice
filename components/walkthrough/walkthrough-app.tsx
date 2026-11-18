"use client";

import { Download, LoaderCircle, Upload as UploadIcon, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ComfyError,
  cancelPrompt,
  checkServer,
  outputFileName,
  queueApiVideoStage,
  queueFlf2vStage,
  queueMergeStage,
  queueVideoStage,
  queueWalkthroughImageStage,
  queueWalkthroughPromptStage,
  trackApiImageStage,
  trackApiVideoStage,
  trackFlf2vStage,
  trackMergeStage,
  trackVideoPromptStage,
  trackVideoStage,
  uploadImage,
  viewUrl,
  type OutputFile,
  type ProgressEvent,
} from "../../lib/comfy";
import { mergeSignature } from "../../lib/merge-video";
import { storyFrame } from "../../lib/scenario";
import { addChild, deleteSubtree, descendantIds, type StoryTree } from "../../lib/storyline";
import { cleanVideoPrompt } from "../../lib/video-prompt";
import { exportWalkthroughFile, parseWalkthroughFile } from "../../lib/walkthrough-file";
import {
  EMPTY_SCENE_TEXT,
  MAX_FILM_SECONDS,
  MAX_REFERENCES,
  MAX_SCENES,
  SECONDS_AXIS,
  blankScene,
  canGenerate,
  clipSeconds,
  displayTree,
  fallbackWalkthroughPrompt,
  finalFrame,
  formatClock,
  gapSeconds,
  inbetweenPrompt,
  newWalkthrough,
  nextScene,
  promptDraft,
  promptOf,
  pruneScenes,
  renderPrompt,
  route,
  routeClips,
  routeSeconds,
  sceneBlocker,
  sceneLabel,
  sceneOf,
  setMode,
  singleBlocker,
  singleClipSeconds,
  singleKey,
  transitionKey,
  uploadedFile,
  videoBlocker,
  videoStale,
  walkthroughVideoRequest,
  type ClipMode,
  type SceneData,
  type SceneMap,
  type SceneMode,
  type Upload,
} from "../../lib/walkthrough";
import { API_VIDEO_SECONDS } from "../../lib/whatifstreet-workflow";
import { FinalFilm } from "../scenario/final-film";
import { StorylineCanvas, type CanvasLabels } from "../storyline/storyline-canvas";
import { SceneCard } from "./scene-card";

const STEPS = [
  ["Add scenes on the canvas", "Each node is a scene. Use + to add the next one, drag to reorder, or drag a link handle to rewire. Branch to try another route."],
  ["Give each scene a view", "Upload a drawing and say whether it is a white-box view (rendered from your prompt and references) or an already-rendered one."],
  ["Make the walkthrough", "Add in-between scenes where a move is long, make a video between each pair, then combine the route you have selected."],
] as const;

const isAbort = (err: unknown) => err instanceof DOMException && err.name === "AbortError";
const errorText = (err: unknown) => (err instanceof ComfyError || err instanceof Error ? err.message : String(err));
const seed32 = () => Math.floor(Math.random() * 2 ** 31);
const NOOP = () => {};
const FRAME = storyFrame(0);

const LABELS_BASE: Omit<CanvasLabels, "node"> = {
  tick: formatClock,
  time: formatClock,
  axis: SECONDS_AXIS,
  caption: `Left to right = time in the film (0:00 to ${formatClock(MAX_FILM_SECONDS)}). The gap between two scenes is the length of the clip between them. The film follows the highlighted route.`,
  emptyText: EMPTY_SCENE_TEXT,
  emptyStrip: "Frames appear here once a scene has a rendered or uploaded image.",
  ripple: false,
};

type Job = { kind: "image" | "video" | "single" | "merge" | "upload" | "batch"; id?: string } | null;

/** The film signature for a route: its clips, plus a mark for each clip that is out of date. */
const routeSignature = (tree: StoryTree, scenes: SceneMap, nodes: ReturnType<typeof route>) =>
  `${mergeSignature(routeClips(scenes, nodes))}#${nodes.map((n) => (videoStale(tree, scenes, n.id) ? "x" : "")).join("")}`;

export function WalkthroughApp() {
  // "API models" setting: only changes the video model here (LTX on the server vs Seedance); images always use Nano Banana Pro.
  const [apiModels, setApiModels] = useState(false);
  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((s: { apiModels?: boolean }) => setApiModels(!!s.apiModels))
      .catch(() => {});
  }, []);

  const [tree, setTree] = useState<StoryTree>(newWalkthrough);
  const [scenes, setScenes] = useState<SceneMap>({});
  const [style, setStyle] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>("start");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fitKey, setFitKey] = useState(0);
  const [addCount, setAddCount] = useState(3);
  const [film, setFilm] = useState<{ file: OutputFile; signature: string } | null>(null);

  const [job, setJob] = useState<Job>(null);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const promptIdRef = useRef<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    const ping = () => checkServer(ctrl.signal).then((ok) => !ctrl.signal.aborted && setOnline(ok));
    ping();
    const t = setInterval(ping, 10_000);
    return () => {
      ctrl.abort();
      clearInterval(t);
    };
  }, []);
  useEffect(() => () => abortRef.current?.abort(), []);

  // Re-frame the canvas whenever scenes are added or removed (a lone scene is framed at a huge zoom otherwise).
  const count = Object.keys(tree).length;
  useEffect(() => setFitKey((k) => k + 1), [count]);

  const busy = !!job || online === false;
  const shown = useMemo(() => displayTree(tree, scenes, viewUrl), [tree, scenes]);
  const labels = useMemo<CanvasLabels>(
    () => ({
      ...LABELS_BASE,
      node: (n) => {
        const s = sceneOf(scenes, n.id);
        const kind = s.mode === "whitebox" ? "white-box" : s.mode === "rendered" ? "rendered" : "in-between";
        return `${sceneLabel(tree, scenes, n.id)} · ${kind}`;
      },
    }),
    [tree, scenes],
  );

  async function runJob<T>(next: NonNullable<Job>, work: (ctrl: AbortController, onProgress: (e: ProgressEvent) => void) => Promise<T>): Promise<T | undefined> {
    if (job) return undefined;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setJob(next);
    setError(null);
    setProgress({ percent: 0, message: "Starting…" });
    try {
      return await work(ctrl, (e) => setProgress((p) => ({ percent: Math.max(p?.percent ?? 0, e.percent), message: e.message })));
    } catch (err) {
      setError(isAbort(err) ? "Cancelled." : errorText(err));
      return undefined;
    } finally {
      promptIdRef.current = null;
      setJob(null);
      setProgress(null);
    }
  }

  function abort() {
    abortRef.current?.abort();
    if (promptIdRef.current) void cancelPrompt(promptIdRef.current);
  }

  const patchScene = (id: string, p: Partial<SceneData>) => setScenes((m) => ({ ...m, [id]: { ...sceneOf(m, id), ...p } }));
  const setText = (id: string, text: string) => setTree((t) => (t[id] ? { ...t, [id]: { ...t[id], text } } : t));

  // --- uploads: pictures go to ComfyUI as soon as they are picked, so every stage can load them by name ---
  const toUpload = async (file: File): Promise<Upload> => ({ file: uploadedFile((await uploadImage(file)).name), label: file.name });

  async function setDrawing(id: string, file: File) {
    const up = await runJob({ kind: "upload", id }, () => toUpload(file));
    // A new drawing invalidates the old render; clips made from it are flagged out of date by their frame signature.
    if (up) patchScene(id, { drawing: up, render: undefined });
  }

  async function addReferences(id: string, files: File[]) {
    const room = MAX_REFERENCES - sceneOf(scenes, id).references.length;
    const ups = await runJob({ kind: "upload", id }, async () => {
      const out: Upload[] = [];
      for (const f of files.slice(0, room)) out.push(await toUpload(f));
      return out;
    });
    if (ups) setScenes((m) => ({ ...m, [id]: { ...sceneOf(m, id), references: [...sceneOf(m, id).references, ...ups].slice(0, MAX_REFERENCES) } }));
  }

  // --- generation ---
  // One render, no job bookkeeping, so a single scene and a batch share it.
  async function renderScene(id: string, ctrl: AbortController, onProgress: (e: ProgressEvent) => void) {
    const node = tree[id];
    const scene = sceneOf(scenes, id);
    let imageNames: string[];
    let prompt: string;
    if (scene.mode === "inbetween") {
      const before = finalFrame(sceneOf(scenes, node.parentId!))!;
      const after = finalFrame(sceneOf(scenes, nextScene(tree, id)!.id))!;
      imageNames = [outputFileName(before), outputFileName(after)];
      prompt = inbetweenPrompt({ style, prompt: scene.imagePrompt });
    } else {
      imageNames = [outputFileName(scene.drawing!.file), ...scene.references.map((r) => outputFileName(r.file))];
      prompt = renderPrompt({ style, prompt: scene.imagePrompt, referenceCount: scene.references.length });
    }
    const clientId = crypto.randomUUID();
    const { promptId } = await queueWalkthroughImageStage({ imageNames, prompt, seed: seed32() }, clientId);
    promptIdRef.current = promptId;
    return { file: await trackApiImageStage(promptId, clientId, onProgress, ctrl.signal), prompt };
  }

  async function generateImage(id: string) {
    if (!tree[id] || !canGenerate(tree, scenes, id)) return;
    const made = await runJob({ kind: "image", id }, (ctrl, onProgress) => renderScene(id, ctrl, onProgress));
    if (made) patchScene(id, { render: { ...made, generatedAt: Date.now() } });
  }

  // White-box scenes that are ready to render (in-between scenes depend on neighbouring frames, so they stay one at a time).
  const batchIds = Object.keys(tree).filter((id) => sceneOf(scenes, id).mode === "whitebox" && canGenerate(tree, scenes, id));

  // Render every ready white-box scene in turn, each with its own drawing and the prompt and references it holds.
  async function generateAll() {
    const ids = batchIds;
    if (!ids.length) return;
    await runJob({ kind: "batch" }, async (ctrl, onProgress) => {
      for (let i = 0; i < ids.length; i++) {
        const lo = (i / ids.length) * 100;
        const hi = ((i + 1) / ids.length) * 100;
        const made = await renderScene(ids[i], ctrl, (e) =>
          onProgress({ percent: lo + (e.percent / 100) * (hi - lo), message: `Scene ${i + 1} of ${ids.length}: ${e.message}` }),
        );
        patchScene(ids[i], { render: { ...made, generatedAt: Date.now() } });
      }
    });
  }

  // A clip is a video made from a scene's frame(s), guided by the scene's animation prompt (its node text):
  //  - "flf2v": first-frame / last-frame, from the parent scene's frame to this one's, as long as the gap
  //    between the two on the timeline;
  //  - "single": this scene's frame alone, animated.
  // Gemini first writes the motion prompt from the frame(s) and the user's direction; if that step fails the
  // clip still runs on the user's own text plus a plain fallback.
  async function makeVideo(id: string, mode: ClipMode = "flf2v") {
    const node = tree[id];
    if (!node) return;
    const single = mode === "single";
    const from = single ? singleKey(scenes, id) : transitionKey(tree, scenes, id);
    if (!from || (!single && !node.parentId)) return;
    const last = finalFrame(sceneOf(scenes, id))!;
    const first = single ? null : finalFrame(sceneOf(scenes, node.parentId!))!;
    const motion = promptOf(node);
    const gap = Math.round(gapSeconds(tree, id));
    const seconds = single ? singleClipSeconds(tree, id, apiModels) : clipSeconds(gap, apiModels);
    const slice = (a: number, b: number, onProgress: (e: ProgressEvent) => void) => (e: ProgressEvent) =>
      onProgress({ percent: a + (e.percent / 100) * (b - a), message: e.message });

    const made = await runJob({ kind: single ? "single" : "video", id }, async (ctrl, onProgress) => {
      let prompt: string;
      let refineError: string | null = null;
      try {
        const clientId = crypto.randomUUID();
        const { promptId } = await queueWalkthroughPromptStage(
          {
            firstImage: first ? outputFileName(first) : null,
            lastImage: outputFileName(last),
            prompt: walkthroughVideoRequest({ motion, style, mode, seconds }),
            seed: seed32(),
            seconds,
          },
          clientId,
        );
        promptIdRef.current = promptId;
        prompt = cleanVideoPrompt(await trackVideoPromptStage(promptId, clientId, slice(0, 10, onProgress), ctrl.signal));
      } catch (err) {
        if (isAbort(err)) throw err;
        refineError = errorText(err);
        prompt = fallbackWalkthroughPrompt({ motion, mode });
      }
      const clientId = crypto.randomUUID();
      const seed = seed32();
      const lastName = outputFileName(last);
      const firstName = first ? outputFileName(first) : null;
      const queued = apiModels
        ? await queueApiVideoStage({ firstImage: firstName, lastImage: lastName, prompt, seed, duration: seconds }, clientId)
        : firstName
          ? await queueFlf2vStage({ firstImage: firstName, lastImage: lastName, prompt, seed, duration: seconds }, clientId)
          : await queueVideoStage({ imageName: lastName, motionPrompt: prompt, seed, duration: seconds }, clientId);
      promptIdRef.current = queued.promptId;
      const track = apiModels ? trackApiVideoStage : firstName ? trackFlf2vStage : trackVideoStage;
      const video = await track(queued.promptId, clientId, slice(10, 100, onProgress), ctrl.signal);
      return { video, prompt, refineError };
    });
    if (!made) return;
    patchScene(id, { video: made.video, videoMeta: { prompt: made.prompt, from, mode, gap } });
    if (made.refineError) setError(`Video made with a basic prompt — the prompt-writing step failed: ${made.refineError}`);
  }

  // --- the route the film follows, and the film ---
  const path = useMemo(() => route(tree, selectedId), [tree, selectedId]);
  const clips = routeClips(scenes, path);
  const signature = routeSignature(tree, scenes, path);
  const filmSeconds = routeSeconds(tree, scenes, path, apiModels);
  // The timeline's last scene, for the "x of 5:00" readout.
  const timelineEnd = Math.max(...Object.values(tree).map((n) => n.year));
  const routeNote = `Route: ${path.map((n) => sceneLabel(tree, scenes, n.id)).join(" → ")}`;

  async function makeFilm() {
    if (clips.length < 2) return;
    const sig = signature;
    const made = await runJob({ kind: "merge" }, async (ctrl, onProgress) => {
      const clientId = crypto.randomUUID();
      const { promptId } = await queueMergeStage(clips.map((c) => outputFileName(c.file)), clientId, "walkthrough/film");
      promptIdRef.current = promptId;
      return trackMergeStage(promptId, clientId, onProgress, ctrl.signal);
    });
    if (made) setFilm({ file: made, signature: sig });
  }

  // --- structure (the canvas handles dragging, linking and inserting on a link itself) ---
  function spawnChild(id: string, ppy?: number) {
    spawnChain(id, 1, ppy);
  }

  // Add `n` scenes one after another (each the child of the last), every one starting from its parent's
  // drawing, references and image prompt (not the render, clip or animation prompt: each move is its own),
  // so similar views need no set-up from scratch. Scenes stop at the end of the timeline.
  function spawnChain(id: string, n: number, ppy?: number) {
    const room = MAX_SCENES - count;
    if (room <= 0) {
      setError(`A walkthrough can have at most ${MAX_SCENES} scenes.`);
      return;
    }
    const total = Math.min(n, room);
    if (total < n) setError(`Added ${total}: a walkthrough can have at most ${MAX_SCENES} scenes.`);
    let nextTree = tree;
    const nextScenes = { ...scenes };
    let parentId = id;
    let last = id;
    let added = 0;
    for (let i = 0; i < total; i++) {
      const made = addChild(nextTree, parentId, ppy, SECONDS_AXIS);
      if (made.tree[made.id].year <= nextTree[parentId].year) break; // the parent is already at the end of the timeline
      const parentScene = sceneOf(nextScenes, parentId);
      nextTree = made.tree;
      if (parentScene.mode !== "inbetween") {
        nextScenes[made.id] = { ...blankScene(parentScene.mode), imagePrompt: parentScene.imagePrompt, drawing: parentScene.drawing, references: [...parentScene.references] };
      }
      parentId = last = made.id;
      added++;
    }
    if (added < total) setError(added ? `Added ${added}: the timeline ends at ${formatClock(MAX_FILM_SECONDS)}.` : `The timeline ends at ${formatClock(MAX_FILM_SECONDS)}: move this scene earlier to add another after it.`);
    if (!added) return;
    setTree(nextTree);
    setScenes(nextScenes);
    setSelectedId(last);
    setEditingId(null);
  }

  function removeNode(id: string) {
    const gone = descendantIds(tree, id);
    const media = gone.filter((g) => scenes[g]?.drawing || scenes[g]?.render || scenes[g]?.video).length;
    const what = gone.length === 1 ? "this scene" : `this scene and the ${gone.length - 1} after it`;
    if (media && !window.confirm(`Delete ${what}, including images and videos on ${media} of them?`)) return;
    const next = deleteSubtree(tree, id);
    const empty = Object.keys(next).length === 0;
    const kept = empty ? newWalkthrough() : next;
    setTree(kept);
    setScenes((m) => pruneScenes(kept, empty ? {} : m));
    if (selectedId && !kept[selectedId]) setSelectedId(empty ? "start" : null);
    setEditingId(null);
  }

  // --- walkthrough file: export the whole walkthrough as JSON, or load one back in ---
  const importRef = useRef<HTMLInputElement | null>(null);
  const hasWork = count > 1 || Object.keys(scenes).length > 0 || !!style.trim() || Object.values(tree).some((n) => n.text.trim());

  function exportWalkthrough() {
    const text = exportWalkthroughFile({ style, tree, scenes, film: film?.file ?? null });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    a.download = `walkthrough-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importWalkthrough(file: File) {
    try {
      const data = parseWalkthroughFile(await file.text());
      if (hasWork && !window.confirm("Replace the current walkthrough with the imported one?")) return;
      const root = Object.values(data.tree).find((n) => n.parentId === null)!;
      setTree(data.tree);
      setScenes(data.scenes);
      setStyle(data.style);
      setFilm(data.film ? { file: data.film, signature: routeSignature(data.tree, data.scenes, route(data.tree, root.id)) } : null);
      setSelectedId(root.id);
      setEditingId(null);
      setError(null);
      setFitKey((k) => k + 1);
    } catch (err) {
      setError(`Couldn't import that file: ${errorText(err)}`);
    }
  }

  const sel = selectedId ? tree[selectedId] : undefined;
  const selScene = sel ? sceneOf(scenes, sel.id) : null;
  const changeMode = (id: string, mode: SceneMode) => setScenes((m) => ({ ...m, [id]: setMode(sceneOf(m, id), mode) }));

  return (
    <main className="mx-auto w-[min(1120px,calc(100%-32px))] pb-16 pt-8">
      <header className="relative mb-6 mt-2 overflow-hidden rounded-2xl border-2 border-ink bg-field px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="plaque-label text-[11px] text-ink">Walkthrough · Interior Film</h2>
          <p className="plaque-label flex items-center gap-2 text-[11px] text-dim">
            <span className={`inline-block size-2.5 rounded-full border border-ink ${online ? "bg-accent" : online === false ? "bg-oxide" : "bg-line"}`} />
            {online ? "ComfyUI online" : online === false ? "ComfyUI offline" : "Checking…"}
          </p>
        </div>
        <p className="mt-2 max-w-[640px] text-sm leading-relaxed text-dim">
          Turn a set of interior drawings into one camera walk through the space: render white-box views, fill the gaps between scenes, and join the clips.
        </p>
      </header>

      <ol className="mb-6 grid gap-3 md:grid-cols-3" aria-label="How it works">
        {STEPS.map(([title, body], i) => (
          <li key={title} className="flex gap-3 rounded-2xl border-2 border-ink bg-field p-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-on-accent">{String(i + 1).padStart(2, "0")}</span>
            <span>
              <span className="plaque-label block text-[11px] text-ink">{title}</span>
              <span className="mt-1.5 block text-xs leading-relaxed text-dim">{body}</span>
            </span>
          </li>
        ))}
      </ol>

      <label className="mb-6 block rounded-2xl border-2 border-ink bg-field p-4">
        <span className="plaque-label mb-1.5 block text-[11px] text-ink">Design intent (optional, applies to every scene)</span>
        <textarea
          value={style}
          onChange={(e) => setStyle(e.target.value)}
          rows={2}
          disabled={!!job}
          placeholder="A quiet Japanese-Scandinavian townhouse: pale oak, lime plaster, brass details, soft north light."
          className="w-full rounded-xl border-2 border-ink bg-panel px-3 py-2 text-sm text-ink outline-none focus:border-accent disabled:opacity-60"
        />
      </label>

      {/* The storyline canvas: one node per scene */}
      <StorylineCanvas
        labels={labels}
        tree={shown}
        setTree={setTree}
        selectedId={selectedId}
        onSelect={setSelectedId}
        editingId={editingId}
        onEditing={setEditingId}
        onAddChild={spawnChild}
        onDelete={removeNode}
        onRipple={NOOP}
        rippleId={null}
        busy={busy}
        frame={FRAME}
        fitKey={fitKey}
        leftInset={0}
        inputs={null}
      />

      {/* Batch tools: add several scenes that inherit the selected one, and render all ready white-box scenes */}
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border-2 border-ink bg-field px-4 py-3">
        <span className="plaque-label text-[11px] text-ink">Batch</span>
        <input
          type="number"
          min={1}
          max={MAX_SCENES}
          value={addCount}
          onChange={(e) => setAddCount(Math.max(1, Math.min(MAX_SCENES, Math.floor(Number(e.target.value)) || 1)))}
          aria-label="Number of scenes to add"
          disabled={busy}
          className="w-16 rounded-xl border-2 border-ink bg-panel px-2 py-1 text-sm text-ink outline-none focus:border-accent disabled:opacity-60"
        />
        <button
          type="button"
          disabled={busy || !sel}
          onClick={() => sel && spawnChain(sel.id, addCount)}
          className="plaque-label chrome rounded-full border-2 border-ink px-3 py-1 text-[10px] text-ink disabled:opacity-50"
        >
          Add {addCount} scene{addCount === 1 ? "" : "s"} after selected
        </button>
        <button
          type="button"
          disabled={busy || !batchIds.length}
          onClick={() => void generateAll()}
          className="plaque-label chrome rounded-full border-2 border-ink px-3 py-1 text-[10px] text-ink disabled:opacity-50"
        >
          Render all ready white-box scenes ({batchIds.length})
        </button>
        <span className="mx-1 hidden h-5 w-px bg-line sm:inline-block" />
        <input
          ref={importRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void importWalkthrough(f);
          }}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => importRef.current?.click()}
          className="plaque-label chrome inline-flex items-center gap-1.5 rounded-full border-2 border-ink px-3 py-1 text-[10px] text-ink disabled:opacity-50"
        >
          <UploadIcon size={11} /> Import JSON
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={exportWalkthrough}
          className="plaque-label chrome inline-flex items-center gap-1.5 rounded-full border-2 border-ink px-3 py-1 text-[10px] text-ink disabled:opacity-50"
        >
          <Download size={11} /> Export JSON
        </button>
        <span className="ml-auto font-mono text-[11px] text-dim" title="Where the last scene sits on the timeline, and the running time of the clips made on the selected route">
          Timeline {formatClock(timelineEnd)} / {formatClock(MAX_FILM_SECONDS)} · route clips {formatClock(filmSeconds)}
        </span>
      </div>

      {/* Status: progress while a job runs, errors after */}
      {(job || error) && (
        <div className="mt-4 rounded-2xl border-2 border-ink bg-field px-4 py-3" role="status">
          {job ? (
            <div className="flex items-center gap-3">
              <LoaderCircle size={14} className="animate-spin text-accent" />
              <div className="h-2 flex-1 overflow-hidden rounded-full border border-ink bg-panel">
                <div className="h-full bg-accent transition-[width]" style={{ width: `${progress?.percent ?? 0}%` }} />
              </div>
              <span className="font-mono text-[11px] text-dim">{progress?.message}</span>
              {job.kind !== "upload" && (
                <button type="button" onClick={abort} className="plaque-label chrome inline-flex items-center gap-1 rounded-full border-2 border-ink px-3 py-1 text-[10px] text-ink">
                  <X size={11} /> Cancel
                </button>
              )}
            </div>
          ) : (
            <p className="text-xs text-oxide">{error}</p>
          )}
        </div>
      )}

      {/* The selected scene */}
      <div className="mt-6">
        {sel && selScene ? (
          <SceneCard
            key={sel.id}
            label={sceneLabel(tree, scenes, sel.id)}
            order={path.findIndex((n) => n.id === sel.id) + 1 || 1}
            scene={selScene}
            prompt={promptDraft(sel)}
            clipSeconds={sel.parentId ? clipSeconds(gapSeconds(tree, sel.id), apiModels) : null}
            gapSeconds={gapSeconds(tree, sel.id)}
            singleSeconds={singleClipSeconds(tree, sel.id, apiModels)}
            singleBlocker={singleBlocker(scenes, sel.id)}
            blocker={selScene.mode === "rendered" ? null : sceneBlocker(tree, scenes, sel.id)}
            videoBlocker={sel.parentId ? videoBlocker(tree, scenes, sel.id) : undefined}
            videoStale={videoStale(tree, scenes, sel.id)}
            busy={busy}
            working={job?.id === sel.id && (job.kind === "image" || job.kind === "video" || job.kind === "single") ? job.kind : null}
            onName={(name) => patchScene(sel.id, { name })}
            onPrompt={(text) => setText(sel.id, text)}
            onImagePrompt={(text) => patchScene(sel.id, { imagePrompt: text })}
            onMode={(m) => changeMode(sel.id, m)}
            onDrawing={(f) => void setDrawing(sel.id, f)}
            onReference={(f) => void addReferences(sel.id, f)}
            onRemoveReference={(n) => patchScene(sel.id, { references: selScene.references.filter((_, k) => k !== n) })}
            onRemove={() => removeNode(sel.id)}
            onGenerate={() => void generateImage(sel.id)}
            onVideo={() => void makeVideo(sel.id)}
            onSingleVideo={() => void makeVideo(sel.id, "single")}
          />
        ) : (
          <p className="rounded-2xl border-2 border-dashed border-ink bg-field p-6 text-center font-serif text-sm text-dim">
            Select a scene on the canvas to set its drawing, prompt and video. Use + on a scene to add the next one.
          </p>
        )}
      </div>

      <div className="mt-6">
        <FinalFilm
          unit="scene"
          clipCount={clips.length}
          film={film?.file ?? null}
          stale={!!film && film.signature !== signature}
          merging={job?.kind === "merge"}
          busy={!!job}
          offline={online === false}
          onMerge={makeFilm}
          downloadName="walkthrough-film.mp4"
          orderNote={routeNote}
        />
      </div>
    </main>
  );
}
