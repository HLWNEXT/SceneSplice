"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { butterflyPrompt as toButterflyPrompt, type ButterflySelection } from "../../lib/butterfly";
import { climatePrompt as toClimatePrompt, type ClimateSelection } from "../../lib/climate";
import {
  ComfyError,
  cancelPrompt,
  checkServer,
  outputFileName,
  queueImageStage,
  queueStoryStage,
  queueVideoStage,
  trackImageStage,
  trackStoryStage,
  trackVideoStage,
  uploadImage,
  viewUrl,
  type ProgressEvent,
} from "../../lib/comfy";
import {
  INPUT_KINDS,
  describeButterfly,
  describeClimate,
  offsetAt,
  parseStory,
  storyFrame,
  storyPrompt,
  type InputKind,
} from "../../lib/scenario";
import { addChild, deleteSubtree, fromJson, keyframeSource, type StoryTree } from "../../lib/storyline";
import { formatOffset, timeHint } from "../../lib/timetravel";
import { buildGeminiPrompt } from "../../lib/whatifstreet-workflow";
import { StorylineCanvas } from "../storyline/storyline-canvas";
import type { StreetViewCaptureFn } from "../whatifstreet/street-view-picker";
import { DetailPanel } from "./detail-panel";
import { InputNodes } from "./input-nodes";
import { SelectionBar, type JobState, type Selection } from "./selection-bar";

const STEPS = [
  ["Set four starting points", "Click each node on the canvas: a street, a moment in time, a butterfly event and the weather."],
  ["Make your story", "When all four are set, one button writes a branching storyline of how that street changes."],
  ["Bring it to life", "Pick any moment on the canvas to generate its image from your Street View photo, then animate it."],
] as const;

const isAbort = (err: unknown) => err instanceof DOMException && err.name === "AbortError";
const errorText = (err: unknown) => (err instanceof ComfyError || err instanceof Error ? err.message : String(err));

export function ScenarioApp() {
  // --- the four starting inputs ---
  const captureRef = useRef<StreetViewCaptureFn | null>(null);
  const uploadedRef = useRef<{ fn: StreetViewCaptureFn; name: string } | null>(null);
  const [streetViewReady, setStreetViewReady] = useState(false);
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  const [years, setYears] = useState<number | null>(null);
  const [butterfly, setButterfly] = useState<ButterflySelection | null>(null);
  const [climate, setClimate] = useState<ClimateSelection>(null);
  const [climateSet, setClimateSet] = useState(false);

  // --- the story ---
  const [tree, setTree] = useState<StoryTree>({});
  const [frame, setFrame] = useState(() => storyFrame(0));
  const [stale, setStale] = useState(false);
  const [fitKey, setFitKey] = useState(0);
  const [selection, setSelection] = useState<Selection>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // --- one ComfyUI job at a time ---
  const [job, setJob] = useState<JobState>(null);
  const [progress, setProgress] = useState<{ percent: number; message: string } | null>(null);
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

  const hasStory = Object.keys(tree).length > 0;
  const butterflyReady = !!butterfly && (!("custom" in butterfly) || butterfly.custom.trim().length > 0);
  const ready: Record<InputKind, boolean> = {
    location: streetViewReady,
    time: years !== null,
    butterfly: butterflyReady,
    environment: climateSet,
  };
  const readyCount = INPUT_KINDS.filter((k) => ready[k]).length;
  const summaries: Record<InputKind, string | null> = {
    location: streetViewReady ? (locationLabel?.split(",").slice(0, 2).join(",") ?? "Street View photo") : null,
    time: years !== null ? formatOffset(years) : null,
    butterfly: butterflyReady ? describeButterfly(butterfly) : null,
    environment: climateSet ? describeClimate(climate) : null,
  };

  const selectedBeat = selection?.type === "beat" ? tree[selection.id] : undefined;

  // Changing a starting point after a story exists leaves it on screen but flags it as out of date.
  const onCaptureReady = useCallback((fn: StreetViewCaptureFn | null) => {
    captureRef.current = fn;
    setStreetViewReady(!!fn);
    if (fn) setStale(true);
  }, []);
  const onLocationChange = useCallback((label: string) => setLocationLabel(label), []);
  const changeYears = (v: number) => (setYears(v), setStale(true));
  const changeButterfly = (v: ButterflySelection | null) => (setButterfly(v), setStale(true));
  const changeClimate = (v: ClimateSelection) => (setClimate(v), setClimateSet(true), setStale(true));

  const selectInput = (kind: InputKind) => {
    setSelection({ type: "input", kind });
    setPanelOpen(true);
    setEditingId(null);
  };
  const selectBeat = useCallback((id: string | null) => {
    setSelection(id ? { type: "beat", id } : null);
    setPanelOpen(false);
  }, []);

  // --- job plumbing ---
  async function runJob<T>(kind: NonNullable<JobState>["kind"], id: string | undefined, work: (ctrl: AbortController, onProgress: (e: ProgressEvent) => void) => Promise<T>): Promise<T | undefined> {
    if (job) return undefined;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setJob({ kind, id });
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

  const prompts = () => ({
    butterflyPrompt: toButterflyPrompt(butterfly),
    climatePrompt: toClimatePrompt(climate),
  });

  async function makeStory() {
    if (readyCount < 4 || years === null) return;
    const f = storyFrame(years);
    const { butterflyPrompt, climatePrompt } = prompts();
    const story = await runJob("story", undefined, async (ctrl, onProgress) => {
      const prompt = storyPrompt({
        locationLabel: locationLabel ?? "an unnamed street",
        years,
        butterflyPrompt: butterflyPrompt ?? "",
        climatePrompt,
      });
      const clientId = crypto.randomUUID();
      const { promptId } = await queueStoryStage({ prompt, seed: Math.floor(Math.random() * 2 ** 31) }, clientId);
      promptIdRef.current = promptId;
      return parseStory(await trackStoryStage(promptId, clientId, onProgress, ctrl.signal), f.horizon);
    });
    if (!story) return;
    setTree(fromJson(story));
    setFrame(f);
    setStale(false);
    setSelection(null);
    setPanelOpen(false);
    setEditingId(null);
    setFitKey((k) => k + 1);
  }

  const patch = (id: string, p: Partial<StoryTree[string]>) => setTree((t) => (t[id] ? { ...t, [id]: { ...t[id], ...p } } : t));

  // Keyframes chain: each beat edits its nearest ancestor's keyframe; the first edits the Street View photo.
  async function generateKeyframe(id: string) {
    const node = tree[id];
    if (!node) return;
    const source = keyframeSource(tree, id);
    if (!source && !captureRef.current) {
      setError("The Street View photo is gone — set the location again.");
      return;
    }
    const { butterflyPrompt, climatePrompt } = prompts();
    const done = await runJob("keyframe", id, async (ctrl, onProgress) => {
      let imageName: string;
      if (source) {
        imageName = outputFileName(source);
      } else {
        const fn = captureRef.current!;
        if (uploadedRef.current?.fn !== fn) uploadedRef.current = { fn, name: (await uploadImage(await fn())).name };
        imageName = uploadedRef.current.name;
      }
      const prompt = buildGeminiPrompt({
        timeHint: timeHint(offsetAt(frame, node.year)),
        butterflyPrompt,
        climatePrompt,
        eventHint: node.text,
      });
      const clientId = crypto.randomUUID();
      const { promptId } = await queueImageStage({ imageName, geminiPrompt: prompt, seed: Math.floor(Math.random() * 2 ** 32) }, clientId);
      promptIdRef.current = promptId;
      const file = await trackImageStage(promptId, clientId, onProgress, ctrl.signal);
      return { prompt, file };
    });
    if (done) patch(id, { keyframe: { prompt: done.prompt, image: viewUrl(done.file), file: done.file, generatedAt: Date.now() }, video: undefined });
  }

  async function makeVideo(id: string) {
    const file = tree[id]?.keyframe?.file;
    if (!file) return;
    const { climatePrompt } = prompts();
    const video = await runJob("video", id, async (ctrl, onProgress) => {
      const motionPrompt = climatePrompt ?? "natural ambient motion, pedestrians and traffic moving naturally";
      const clientId = crypto.randomUUID();
      const { promptId } = await queueVideoStage(
        { imageName: outputFileName(file), motionPrompt, seed: Math.floor(Math.random() * 2 ** 32) },
        clientId,
      );
      promptIdRef.current = promptId;
      return trackVideoStage(promptId, clientId, onProgress, ctrl.signal);
    });
    if (video) patch(id, { video });
  }

  function spawnChild(id: string) {
    const { tree: next, id: childId } = addChild(tree, id);
    setTree(next);
    setSelection({ type: "beat", id: childId });
    setPanelOpen(false);
    setEditingId(childId);
  }

  function removeBeat(id: string) {
    if (tree[id]?.parentId === null && !window.confirm("Delete the first beat and the entire storyline?")) return;
    const next = deleteSubtree(tree, id);
    setTree(next);
    if (selection?.type === "beat" && !next[selection.id]) setSelection(null);
  }

  const inputNodes = useMemo(
    () => (
      <InputNodes
        summaries={summaries}
        selected={selection?.type === "input" ? selection.kind : null}
        onSelect={selectInput}
        docked={hasStory}
      />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [summaries.location, summaries.time, summaries.butterfly, summaries.environment, selection, hasStory],
  );

  return (
    <main className="mx-auto w-[min(1120px,calc(100%-32px))] pb-16 pt-8">
      {/* 1 · Project header */}
      <header className="my-8">
        <div className="flex items-center justify-between">
          <p className="plaque-label text-xs text-dim">Comfy · Location Scenario Simulator</p>
          <p className="plaque-label flex items-center gap-2 text-xs text-dim">
            <span className={`inline-block size-2 rounded-full ${online ? "bg-sage" : online === false ? "bg-oxide" : "bg-dim"}`} />
            {online ? "Comfyui online" : online === false ? "Comfyui offline" : "Checking…"}
          </p>
        </div>
        <h1 className="my-3 font-display text-[clamp(52px,9vw,100px)] font-semibold italic leading-[0.95] tracking-[-0.02em] text-ink">
          WhatIfStreet
        </h1>
        <div className="mb-4 h-px w-24 bg-accent" />
        <p className="max-w-[620px] font-serif leading-relaxed text-dim">
          Pick a real street, a moment in the past or future, and one world-changing event. Watch how the street unfolds.
        </p>
      </header>

      {/* 2 · Instructions */}
      <ol className="mb-6 grid gap-3 md:grid-cols-3" aria-label="How it works">
        {STEPS.map(([title, body], i) => (
          <li key={title} className="flex gap-3 border border-edge bg-field p-4">
            <span className="font-display text-3xl font-semibold italic leading-none text-accent">{i + 1}</span>
            <span>
              <span className="plaque-label block text-[11px] text-ink">{title}</span>
              <span className="mt-1 block font-serif text-sm leading-snug text-dim">{body}</span>
            </span>
          </li>
        ))}
      </ol>

      {/* 3 · Storyline canvas, with the four input nodes */}
      <StorylineCanvas
        tree={tree}
        setTree={setTree}
        selectedId={selection?.type === "beat" ? selection.id : null}
        onSelect={(id) => (id ? selectBeat(id) : (setSelection(null), setPanelOpen(false)))}
        editingId={editingId}
        onEditing={setEditingId}
        onAddChild={spawnChild}
        onDelete={removeBeat}
        frame={frame}
        fitKey={fitKey}
        leftInset={hasStory ? 176 : 0}
        inputs={inputNodes}
      />

      {/* 4 · Status bar */}
      <div className="mt-3">
        <SelectionBar
          selection={selection}
          beat={selectedBeat}
          frame={frame}
          summaries={summaries}
          readyCount={readyCount}
          hasStory={hasStory}
          stale={stale && hasStory}
          job={job}
          progress={progress}
          error={error}
          online={online}
          panelOpen={panelOpen}
          onTogglePanel={() => setPanelOpen((o) => !o)}
          onMakeStory={makeStory}
          onAbort={abort}
          onEditText={() => selection?.type === "beat" && setEditingId(selection.id)}
          onGenerateKeyframe={() => selection?.type === "beat" && generateKeyframe(selection.id)}
          onMakeVideo={() => selection?.type === "beat" && makeVideo(selection.id)}
          onAddChild={() => selection?.type === "beat" && spawnChild(selection.id)}
          onDelete={() => selection?.type === "beat" && removeBeat(selection.id)}
        />
      </div>

      {/* 5 · Detail panel */}
      <div className="mt-3">
        <DetailPanel
          selection={selection}
          open={panelOpen}
          disabled={!!job}
          beat={selectedBeat}
          frame={frame}
          years={years}
          butterfly={butterfly}
          climate={climate}
          onCaptureReady={onCaptureReady}
          onLocationChange={onLocationChange}
          onYears={changeYears}
          onButterfly={changeButterfly}
          onClimate={changeClimate}
        />
      </div>
    </main>
  );
}
