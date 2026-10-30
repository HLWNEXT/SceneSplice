"use client";

import { Download, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ATMOSPHERES } from "../lib/atmosphere";
import { fetchResult, queuePrompt, trackProgress, uploadImage } from "../lib/comfy";
import { yearsToPrompt } from "../lib/decay";
import { AtmosphereSelect } from "./atmosphere-select";
import { ChronoSlider } from "./chrono-slider";
import { ImageDropzone } from "./image-dropzone";
import { Terminal, type LogLine } from "./terminal";

function Panel({ title, index, children }: { title: string; index: string; children: React.ReactNode }) {
  return (
    <section className="border border-line bg-panel">
      <header className="flex items-center justify-between border-b border-line px-4 py-2 text-[10px] uppercase tracking-widest text-dim">
        <span>{title}</span>
        <span>{index}</span>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

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
  const lineId = useRef(0);

  useEffect(() => {
    if (!file) return setPreviewUrl(null);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => () => abortRef.current?.abort(), []);

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
      log(`T+${years.toLocaleString("en-US")}yr → ${decayPrompt}`);
      const { promptId } = await queuePrompt({
        imageName: name,
        years,
        decayPrompt,
        atmospherePrompt: atmosphere.prompt,
      });
      log(`Queued prompt ${promptId.slice(0, 8)}`);
      await trackProgress(
        promptId,
        (e) => {
          setPercent(e.percent);
          log(e.message);
        },
        ctrl.signal,
      );
      setVideoUrl(await fetchResult(promptId));
      log("Result ready.");
    } catch (err) {
      log(err instanceof DOMException && err.name === "AbortError" ? "Cancelled." : `ERROR: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-4 p-4 md:p-6">
      <header className="flex items-end justify-between border-b border-line pb-4">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-tight">
            As-Ruined<span className="text-accent">_</span>
          </h1>
          <p className="text-[10px] uppercase tracking-widest text-dim">Entropy Studio · Architectural decay simulator</p>
        </div>
        <div className="text-[10px] uppercase tracking-widest text-dim">v0.1 · mock backend</div>
      </header>

      <main className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Panel title="01 · As-built input" index="IMG">
            <ImageDropzone file={file} previewUrl={previewUrl} disabled={busy} onFile={setFile} />
          </Panel>
          <Panel title="02 · Chrono-slider" index="T">
            <ChronoSlider years={years} disabled={busy} onChange={setYears} />
          </Panel>
          <Panel title="03 · Atmospheric conditions" index="ATM">
            <AtmosphereSelect value={atmosphereId} disabled={busy} onChange={setAtmosphereId} />
          </Panel>
          <button
            type="button"
            onClick={simulate}
            disabled={!file || busy}
            className="flex items-center justify-center gap-3 bg-accent px-6 py-4 text-sm font-bold uppercase tracking-widest text-black transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Play size={16} fill="currentColor" />
            {busy ? "Simulating..." : "Simulate Decay"}
          </button>
          {busy && (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="border border-line py-2 text-xs uppercase tracking-widest text-dim hover:border-white hover:text-white"
            >
              Abort
            </button>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Panel title="04 · Playback console" index="MP4">
            {videoUrl ? (
              <div>
                <video src={videoUrl} controls autoPlay loop className="aspect-video w-full bg-black" />
                <a
                  href={videoUrl}
                  download="as-ruined.mp4"
                  className="mt-3 inline-flex items-center gap-2 text-xs uppercase text-dim hover:text-accent"
                >
                  <Download size={14} /> Download MP4
                </a>
              </div>
            ) : (
              <div className="flex aspect-video items-center justify-center border border-dashed border-line text-xs uppercase tracking-widest text-dim">
                No output
              </div>
            )}
          </Panel>
          <Panel title="05 · Process log" index="TTY">
            <Terminal lines={lines} percent={percent} busy={busy} />
          </Panel>
        </div>
      </main>
    </div>
  );
}
