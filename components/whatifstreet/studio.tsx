"use client";

import { Download, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { butterflyPrompt, type ButterflySelection } from "../../lib/butterfly";
import { climatePrompt, type ClimateSelection } from "../../lib/climate";
import {
  ComfyError,
  cancelPrompt,
  checkServer,
  outputFileName,
  queueImageStage,
  queueVideoStage,
  trackImageStage,
  trackVideoStage,
  uploadImage,
  viewUrl,
  type OutputFile,
} from "../../lib/comfy";
import { timeHint } from "../../lib/timetravel";
import { buildGeminiPrompt } from "../../lib/whatifstreet-workflow";
import { ButterflySelect } from "./butterfly-select";
import { ClimateSelect } from "./climate-select";
import { StreetViewPicker, type StreetViewCaptureFn } from "./street-view-picker";
import { TimeSlider } from "./time-slider";
import { Terminal, type LogLine } from "../terminal";

type PreviewTab = "streetview" | "image" | "video";

export function WhatIfStreetStudio() {
  const [preview, setPreview] = useState<PreviewTab>("streetview");
  const captureRef = useRef<StreetViewCaptureFn | null>(null);
  const [streetViewReady, setStreetViewReady] = useState(false);

  const [years, setYears] = useState(0);
  const [butterfly, setButterfly] = useState<ButterflySelection | null>(null);
  const [climate, setClimate] = useState<ClimateSelection>(null);

  const [generatedImage, setGeneratedImage] = useState<OutputFile | null>(null);
  const [generatedVideo, setGeneratedVideo] = useState<OutputFile | null>(null);

  const [busy, setBusy] = useState(false);
  const [runningStage, setRunningStage] = useState<"image" | "video" | null>(null);
  const [percent, setPercent] = useState(0);
  const [lines, setLines] = useState<LogLine[]>([]);
  const [online, setOnline] = useState<boolean | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const promptIdRef = useRef<string | null>(null);
  const lineId = useRef(0);

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

  const onCaptureReady = useCallback((fn: StreetViewCaptureFn | null) => {
    captureRef.current = fn;
    setStreetViewReady(!!fn);
    // A new (or lost) street view invalidates anything generated from the previous one.
    setGeneratedImage(null);
    setGeneratedVideo(null);
  }, []);

  function withInvalidation<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setGeneratedImage(null);
      setGeneratedVideo(null);
    };
  }
  const changeYears = withInvalidation(setYears);
  const changeButterfly = withInvalidation(setButterfly);
  const changeClimate = withInvalidation(setClimate);

  function abort() {
    abortRef.current?.abort();
    if (promptIdRef.current) void cancelPrompt(promptIdRef.current);
  }

  const log = (text: string) =>
    setLines((l) => [...l, { id: lineId.current++, time: new Date().toLocaleTimeString("en-GB"), text }]);

  const butterflyReady = !!butterfly && (!("custom" in butterfly) || butterfly.custom.trim().length > 0);

  async function generateImage() {
    if (!captureRef.current || !butterflyReady || busy) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    setRunningStage("image");
    setPercent(0);
    setLines([]);
    setGeneratedVideo(null);
    try {
      log("Capturing Street View frame...");
      const file = await captureRef.current();
      log(`Uploading ${file.name}...`);
      const { name } = await uploadImage(file);
      const geminiPrompt = buildGeminiPrompt({
        timeHint: timeHint(years),
        butterflyPrompt: butterflyPrompt(butterfly),
        climatePrompt: climatePrompt(climate),
      });
      log(`Prompt for Gemini: ${geminiPrompt}`);
      const seed = Math.floor(Math.random() * 2 ** 32);
      const clientId = crypto.randomUUID();
      const { promptId } = await queueImageStage({ imageName: name, geminiPrompt, seed }, clientId);
      promptIdRef.current = promptId;
      log(`Queued prompt ${promptId.slice(0, 8)}`);
      let last = "";
      const output = await trackImageStage(
        promptId,
        clientId,
        (e) => {
          setPercent((p) => Math.max(p, e.percent));
          if (e.message !== last) log(e.message);
          last = e.message;
        },
        ctrl.signal,
      );
      setGeneratedImage(output);
      log("Image ready.");
      setPreview("image");
    } catch (err) {
      log(
        err instanceof DOMException && err.name === "AbortError"
          ? "Cancelled."
          : `ERROR: ${err instanceof ComfyError ? err.message : String(err)}`,
      );
    } finally {
      promptIdRef.current = null;
      setBusy(false);
      setRunningStage(null);
    }
  }

  async function generateVideo() {
    if (!generatedImage || busy) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    setRunningStage("video");
    setPercent(0);
    setLines([]);
    try {
      const motionPrompt = climatePrompt(climate) ?? "natural ambient motion, pedestrians and traffic moving naturally";
      log(`Motion prompt: ${motionPrompt}`);
      const seed = Math.floor(Math.random() * 2 ** 32);
      const clientId = crypto.randomUUID();
      const { promptId } = await queueVideoStage({ imageName: outputFileName(generatedImage), motionPrompt, seed }, clientId);
      promptIdRef.current = promptId;
      log(`Queued prompt ${promptId.slice(0, 8)}`);
      let last = "";
      const output = await trackVideoStage(
        promptId,
        clientId,
        (e) => {
          setPercent((p) => Math.max(p, e.percent));
          if (e.message !== last) log(e.message);
          last = e.message;
        },
        ctrl.signal,
      );
      setGeneratedVideo(output);
      log("Video ready.");
      setPreview("video");
    } catch (err) {
      log(
        err instanceof DOMException && err.name === "AbortError"
          ? "Cancelled."
          : `ERROR: ${err instanceof ComfyError ? err.message : String(err)}`,
      );
    } finally {
      promptIdRef.current = null;
      setBusy(false);
      setRunningStage(null);
    }
  }

  const previewTabs: { id: PreviewTab; label: string; enabled: boolean }[] = [
    { id: "streetview", label: "Street View", enabled: true },
    { id: "image", label: "Image", enabled: !!generatedImage },
    { id: "video", label: "Video", enabled: !!generatedVideo },
  ];

  return (
    <main className="mx-auto w-[min(1120px,calc(100%-32px))] pb-16 pt-8">
      <header className="my-8">
        <div className="flex items-center justify-between">
          <p className="plaque-label text-xs text-dim">Comfy · Time-Travel Studio</p>
          <p className="plaque-label flex items-center gap-2 text-xs text-dim">
            <span
              className={`inline-block size-2 rounded-full ${online ? "bg-sage" : online === false ? "bg-oxide" : "bg-dim"}`}
            />
            {online ? "Comfyui online" : online === false ? "Comfyui offline" : "Checking…"}
          </p>
        </div>
        <h1 className="my-3 font-display text-[clamp(52px,9vw,100px)] font-semibold italic leading-[0.95] tracking-[-0.02em] text-ink">
          WhatIfStreet
        </h1>
        <div className="mb-4 h-px w-24 bg-accent" />
        <p className="max-w-[620px] font-serif leading-relaxed text-dim">
          Pick a real street, dial in a point in the past or future, and see how a single global decision reshapes it.
        </p>
      </header>

      <section
        aria-label="WhatIfStreet studio"
        className="plate-marks grid min-h-[550px] overflow-hidden rounded-none border border-line bg-panel md:grid-cols-[340px_1fr]"
      >
        <aside className="flex flex-col gap-4 border-b border-line p-5 md:border-b-0 md:border-r">
          <fieldset className="grid gap-3 rounded-none border border-edge p-3.5">
            <legend className="plaque-label px-1.5 text-[11px] text-dim">01 · Time travel</legend>
            <TimeSlider years={years} disabled={busy} onChange={changeYears} />
          </fieldset>
          <fieldset className="grid gap-3 rounded-none border border-edge p-3.5">
            <legend className="plaque-label px-1.5 text-[11px] text-dim">02 · Butterfly action</legend>
            <ButterflySelect value={butterfly} disabled={busy} onChange={changeButterfly} />
          </fieldset>
          <fieldset className="grid gap-3 rounded-none border border-edge p-3.5">
            <legend className="plaque-label px-1.5 text-[11px] text-dim">03 · Weather / climate (optional)</legend>
            <ClimateSelect value={climate} disabled={busy} onChange={changeClimate} />
          </fieldset>
          <button
            type="button"
            onClick={generateImage}
            disabled={!streetViewReady || !butterflyReady || busy || online === false}
            className="plaque-label flex items-center justify-center gap-2 rounded-none border border-accent bg-accent px-3 py-3 text-on-accent disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Play size={16} fill="currentColor" />
            {runningStage === "image" ? "Imagining…" : generatedImage ? "Regenerate Image" : "Generate Image"}
          </button>
          {generatedImage && (
            <button
              type="button"
              onClick={generateVideo}
              disabled={busy || online === false}
              className="plaque-label flex items-center justify-center gap-2 rounded-none border border-accent bg-field px-3 py-2.5 text-accent hover:bg-panel disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Play size={16} fill="currentColor" />
              {runningStage === "video" ? "Animating…" : generatedVideo ? "Regenerate Video" : "Generate Video"}
            </button>
          )}
          {generatedVideo && (
            <a
              href={viewUrl(generatedVideo)}
              download="whatifstreet.mp4"
              className="inline-flex items-center justify-center gap-2 text-sm text-accent hover:underline"
            >
              <Download size={14} /> Download MP4
            </a>
          )}
          {!streetViewReady && (
            <p className="font-serif text-xs leading-relaxed text-dim">
              Search an address in the preview to load a Street View photo before generating.
            </p>
          )}
          {busy && (
            <button
              type="button"
              onClick={abort}
              className="plaque-label rounded-none border border-edge bg-field px-3 py-2.5 text-ink hover:bg-panel"
            >
              Abort
            </button>
          )}
        </aside>

        <section className="flex min-w-0 flex-col items-center justify-center gap-4 bg-stage p-5">
          <div role="tablist" aria-label="Preview" className="flex w-full max-w-[720px] gap-2">
            {previewTabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={preview === t.id}
                disabled={!t.enabled}
                onClick={() => setPreview(t.id)}
                className={`plaque-label rounded-none border px-3 py-1.5 text-[11px] disabled:cursor-not-allowed disabled:opacity-40 ${
                  preview === t.id
                    ? "border-accent bg-accent text-on-accent"
                    : "border-stage-line bg-stage-well text-stage-dim hover:border-accent hover:text-on-accent"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Always mounted (not conditionally, like the other two panels) — unmounting it would fire its
              cleanup effect, which reports the capture as lost and would wipe out a just-generated image. */}
          <div className={preview === "streetview" ? "contents" : "hidden"}>
            <StreetViewPicker disabled={busy} onCaptureReady={onCaptureReady} />
          </div>

          {preview === "image" && (
            <div className="w-full max-w-[720px]">
              <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-none border border-stage-line bg-stage-well">
                {generatedImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={viewUrl(generatedImage)} alt="Reimagined street" className="size-full object-contain" />
                ) : (
                  <p className="max-w-[380px] text-center font-serif leading-relaxed text-stage-dim">No image yet.</p>
                )}
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="plaque-label text-xs text-stage-dim">Output · Reimagined street</p>
                {generatedImage && (
                  <button
                    type="button"
                    onClick={generateVideo}
                    disabled={busy || online === false}
                    className="plaque-label flex items-center gap-1.5 rounded-none border border-accent bg-accent px-3 py-1.5 text-[11px] text-on-accent disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Play size={12} fill="currentColor" />
                    {runningStage === "video" ? "Animating…" : generatedVideo ? "Regenerate Video" : "Turn into Video"}
                  </button>
                )}
              </div>
            </div>
          )}

          {preview === "video" && (
            <div className="w-full max-w-[720px]">
              {generatedVideo ? (
                <video src={viewUrl(generatedVideo)} controls autoPlay loop className="aspect-video w-full rounded-none bg-black" />
              ) : (
                <div className="flex aspect-video w-full items-center justify-center rounded-none border border-stage-line bg-stage-well">
                  <p className="max-w-[380px] text-center font-serif leading-relaxed text-stage-dim">No video yet.</p>
                </div>
              )}
            </div>
          )}

          <div className="w-full max-w-[720px]">
            <Terminal lines={lines} percent={percent} busy={busy} />
          </div>
        </section>
      </section>
    </main>
  );
}
