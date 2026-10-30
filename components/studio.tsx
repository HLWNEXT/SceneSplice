"use client";

import { Download, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ATMOSPHERES } from "../lib/atmosphere";
import { ComfyError, cancelPrompt, checkServer, queuePrompt, trackProgress, uploadImage, viewUrl } from "../lib/comfy";
import { yearsToPrompt } from "../lib/decay";
import { AtmosphereSelect } from "./atmosphere-select";
import { ChronoSlider } from "./chrono-slider";
import { ImageDropzone } from "./image-dropzone";
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
    if (!file || busy) return;
    const atmosphere = ATMOSPHERES.find((a) => a.id === atmosphereId)!;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    setPercent(0);
    setVideoUrl(null);
    setLines([]);
    try {
      log(`Uploading ${file.name}...`);
      const { name } = await uploadImage(file);
      log(`Input staged as ${name}`);
      const decayPrompt = yearsToPrompt(years);
      const seed = Math.floor(Math.random() * 2 ** 32);
      log(`T+${years.toLocaleString("en-US")}yr seed ${seed} → ${decayPrompt}`);
      const clientId = crypto.randomUUID();
      const { promptId } = await queuePrompt(
        { imageName: name, decayPrompt, atmospherePrompt: atmosphere.prompt, seed },
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
          <p className="font-mono text-xs tracking-[0.08em] text-dim">COMFY · ENTROPY STUDIO</p>
          <p className="flex items-center gap-2 font-mono text-xs tracking-[0.08em] text-dim">
            <span
              className={`inline-block size-2 rounded-full ${online ? "bg-emerald-400" : online === false ? "bg-red-400" : "bg-dim"}`}
            />
            {online ? "COMFYUI ONLINE" : online === false ? "COMFYUI OFFLINE" : "CHECKING..."}
          </p>
        </div>
        <h1 className="my-3 text-[clamp(48px,8vw,92px)] font-bold leading-[0.95] tracking-[-0.06em]">As-Ruined</h1>
        <p className="max-w-[620px] leading-relaxed text-[#bbb]">
          Upload a pristine architectural render, scrub forward through time, and simulate how the space decays.
        </p>
      </header>

      <section
        aria-label="Decay studio"
        className="grid min-h-[550px] overflow-hidden rounded-2xl border border-line bg-panel md:grid-cols-[340px_1fr]"
      >
        <aside className="flex flex-col gap-4 border-b border-line p-5 md:border-b-0 md:border-r">
          <div className="grid gap-2 text-[13px] text-[#d4d4d8]">
            <span>01 · As-built render</span>
            <ImageDropzone file={file} previewUrl={previewUrl} disabled={busy} onFile={setFile} />
          </div>
          <fieldset className="grid gap-3 rounded-[10px] border border-edge p-3.5">
            <legend className="px-1.5 text-[13px] text-[#d4d4d8]">02 · Time elapsed</legend>
            <ChronoSlider years={years} disabled={busy} onChange={setYears} />
          </fieldset>
          <fieldset className="grid gap-3 rounded-[10px] border border-edge p-3.5">
            <legend className="px-1.5 text-[13px] text-[#d4d4d8]">03 · Atmosphere</legend>
            <AtmosphereSelect value={atmosphereId} disabled={busy} onChange={setAtmosphereId} />
          </fieldset>
          <button
            type="button"
            onClick={simulate}
            disabled={!file || busy || online === false}
            className="flex items-center justify-center gap-2 rounded-lg border border-accent bg-accent px-3 py-3 font-semibold text-on-accent disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Play size={16} fill="currentColor" />
            {busy ? "Simulating…" : "Simulate Decay"}
          </button>
          {busy && (
            <button
              type="button"
              onClick={abort}
              className="rounded-lg border border-[#595b64] bg-[#292a30] px-3 py-2.5 font-semibold hover:bg-[#33343b]"
            >
              Abort
            </button>
          )}
        </aside>

        <section aria-label="Preview" className="flex min-w-0 flex-col items-center justify-center gap-4 bg-void p-5">
          {videoUrl ? (
            <div className="w-full max-w-[720px]">
              <video src={videoUrl} controls autoPlay loop className="aspect-video w-full rounded-lg bg-black" />
              <a
                href={videoUrl}
                download="as-ruined.mp4"
                className="mt-3 inline-flex items-center gap-2 text-sm text-accent hover:underline"
              >
                <Download size={14} /> Download MP4
              </a>
            </div>
          ) : (
            <div className="flex aspect-video w-full max-w-[720px] items-center justify-center overflow-hidden rounded-lg bg-[#241325]">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="As-built render" className="size-full object-contain" />
              ) : (
                <p className="max-w-[380px] text-center leading-relaxed text-dim">
                  Upload a render to begin. The simulated ruin plays here.
                </p>
              )}
            </div>
          )}
          <p className="font-mono text-xs tracking-[0.08em] text-dim">
            {videoUrl ? "OUTPUT · AS-RUINED" : previewUrl ? "INPUT · AS-BUILT" : "NO MEDIA"}
          </p>
          <div className="w-full max-w-[720px]">
            <Terminal lines={lines} percent={percent} busy={busy} />
          </div>
        </section>
      </section>
    </main>
  );
}
