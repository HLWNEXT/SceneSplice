"use client";

import { Download, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ATMOSPHERES } from "../lib/atmosphere";
import { ComfyError, cancelPrompt, checkServer, queuePrompt, trackProgress, uploadImage, viewUrl } from "../lib/comfy";
import { yearsToPrompt } from "../lib/decay";
import { AtmosphereSelect } from "./atmosphere-select";
import { ChronoSlider } from "./chrono-slider";
import { ImageDropzone } from "./image-dropzone";
import { MapPicker, type CaptureFn } from "./map-picker";
import { Terminal, type LogLine } from "./terminal";

export function Studio() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [years, setYears] = useState(100);
  const [atmosphereId, setAtmosphereId] = useState(ATMOSPHERES[0].id);
  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState(0);
  const [lines, setLines] = useState<LogLine[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const promptIdRef = useRef<string | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const lineId = useRef(0);
  const [source, setSource] = useState<"upload" | "map">("upload");
  const captureRef = useRef<CaptureFn | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const canRun = source === "upload" ? !!file : mapReady;
  const onCaptureReady = useCallback((fn: CaptureFn | null) => {
    captureRef.current = fn;
    setMapReady(!!fn);
  }, []);

  useEffect(() => {
    if (!file) return setPreviewUrl(null);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => () => abortRef.current?.abort(), []);

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

  function abort() {
    abortRef.current?.abort();
    if (promptIdRef.current) void cancelPrompt(promptIdRef.current);
  }

  const log = (text: string) =>
    setLines((l) => [...l, { id: lineId.current++, time: new Date().toLocaleTimeString("en-GB"), text }]);

  async function simulate() {
    if (!canRun || busy) return;
    const atmosphere = ATMOSPHERES.find((a) => a.id === atmosphereId)!;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    setPercent(0);
    setVideoUrl(null);
    setLines([]);
    try {
      let inputFile = file;
      if (source === "map") {
        log("Capturing white-box view...");
        const shot = await captureRef.current!();
        inputFile = shot.image;
      }
      log(`Uploading ${inputFile!.name}...`);
      const { name } = await uploadImage(inputFile!);
      log(`Input staged as ${name}`);
      const decayPrompt = yearsToPrompt(years);
      const seed = Math.floor(Math.random() * 2 ** 32);
      log(`T+${years.toLocaleString("en-US")}yr seed ${seed} → ${decayPrompt}`);
      const clientId = crypto.randomUUID();
      const { promptId } = await queuePrompt(
        { mode: source, imageName: name, decayPrompt, atmospherePrompt: atmosphere.prompt, seed },
        clientId,
      );
      promptIdRef.current = promptId;
      log(`Queued prompt ${promptId.slice(0, 8)}`);
      let last = "";
      const output = await trackProgress(
        promptId,
        clientId,
        (e) => {
          setPercent((p) => Math.max(p, e.percent));
          if (e.message !== last) log(e.message);
          last = e.message;
        },
        ctrl.signal,
      );
      setVideoUrl(viewUrl(output));
      log("Result ready.");
    } catch (err) {
      log(
        err instanceof DOMException && err.name === "AbortError"
          ? "Cancelled."
          : `ERROR: ${err instanceof ComfyError ? err.message : String(err)}`,
      );
    } finally {
      promptIdRef.current = null;
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-[min(1120px,calc(100%-32px))] pb-16 pt-8">
      <header className="my-8">
        <div className="flex items-center justify-between">
          <p className="plaque-label text-xs text-dim">Comfy · Entropy Studio</p>
          <p className="plaque-label flex items-center gap-2 text-xs text-dim">
            <span
              className={`inline-block size-2 rounded-full ${online ? "bg-sage" : online === false ? "bg-oxide" : "bg-dim"}`}
            />
            {online ? "Comfyui online" : online === false ? "Comfyui offline" : "Checking…"}
          </p>
        </div>
        <h1 className="my-3 font-display text-[clamp(52px,9vw,100px)] font-semibold italic leading-[0.95] tracking-[-0.02em] text-ink">
          As-Ruined
        </h1>
        <div className="mb-4 h-px w-24 bg-accent" />
        <p className="max-w-[620px] font-serif leading-relaxed text-dim">
          Upload a pristine architectural render, scrub forward through time, and simulate how the space decays.
        </p>
      </header>

      <section
        aria-label="Decay studio"
        className="plate-marks grid min-h-[550px] overflow-hidden rounded-none border border-line bg-panel md:grid-cols-[340px_1fr]"
      >
        <aside className="flex flex-col gap-4 border-b border-line p-5 md:border-b-0 md:border-r">
          <div className="grid gap-2 font-serif text-[13px] text-ink">
            <span className="plaque-label text-dim">01 · As-built source</span>
            <div role="radiogroup" aria-label="Source" className="grid grid-cols-2 gap-2">
              {([["upload", "Upload render"], ["map", "Place on map"]] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={source === id}
                  disabled={busy}
                  onClick={() => setSource(id)}
                  className={`rounded-none border px-3 py-2 font-serif text-[13px] font-semibold disabled:opacity-45 ${
                    source === id
                      ? "border-accent bg-accent text-on-accent"
                      : "border-edge bg-field text-ink hover:bg-panel"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {source === "upload" ? (
              <ImageDropzone file={file} previewUrl={previewUrl} disabled={busy} onFile={setFile} />
            ) : (
              <p className="text-xs leading-relaxed text-dim">
                Search an address in the preview, orbit the white-box model to frame a view, then simulate.
              </p>
            )}
          </div>
          <fieldset className="grid gap-3 rounded-none border border-edge p-3.5">
            <legend className="plaque-label px-1.5 text-[11px] text-dim">02 · Time elapsed</legend>
            <ChronoSlider years={years} disabled={busy} onChange={setYears} />
          </fieldset>
          <fieldset className="grid gap-3 rounded-none border border-edge p-3.5">
            <legend className="plaque-label px-1.5 text-[11px] text-dim">03 · Atmosphere</legend>
            <AtmosphereSelect value={atmosphereId} disabled={busy} onChange={setAtmosphereId} />
          </fieldset>
          <button
            type="button"
            onClick={simulate}
            disabled={!canRun || busy || online === false}
            className="plaque-label flex items-center justify-center gap-2 rounded-none border border-accent bg-accent px-3 py-3 text-on-accent disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Play size={16} fill="currentColor" />
            {busy ? "Simulating…" : "Simulate Decay"}
          </button>
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

        <section aria-label="Preview" className="flex min-w-0 flex-col items-center justify-center gap-4 bg-stage p-5">
          {source === "map" && (
            <div className={videoUrl ? "hidden" : "contents"}>
              <MapPicker disabled={busy} onCaptureReady={onCaptureReady} />
            </div>
          )}
          {videoUrl ? (
            <div className="w-full max-w-[720px]">
              <video src={videoUrl} controls autoPlay loop className="aspect-video w-full rounded-none bg-black" />
              <a
                href={videoUrl}
                download="as-ruined.mp4"
                className="mt-3 inline-flex items-center gap-2 text-sm text-accent hover:underline"
              >
                <Download size={14} /> Download MP4
              </a>
              {source === "map" && (
                <button type="button" onClick={() => setVideoUrl(null)} className="ml-4 text-sm text-stage-dim hover:text-on-accent">
                  Back to map
                </button>
              )}
            </div>
          ) : source === "map" ? null : (
            <div className="flex aspect-video w-full max-w-[720px] items-center justify-center overflow-hidden rounded-none border border-stage-line bg-stage-well">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="As-built render" className="size-full object-contain" />
              ) : (
                <p className="max-w-[380px] text-center font-serif leading-relaxed text-stage-dim">
                  Upload a render to begin. The simulated ruin plays here.
                </p>
              )}
            </div>
          )}
          <p className="plaque-label text-xs text-stage-dim">
            {videoUrl ? "Output · As-ruined" : source === "map" ? "" : previewUrl ? "Input · As-built" : "No media"}
          </p>
          <div className="w-full max-w-[720px]">
            <Terminal lines={lines} percent={percent} busy={busy} />
          </div>
        </section>
      </section>
    </main>
  );
}
