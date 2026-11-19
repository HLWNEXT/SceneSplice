"use client";

import { Download, Film, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { viewUrl, type OutputFile } from "../../lib/comfy";

type Props = {
  /** Beats that currently have a video. */
  clipCount: number;
  film: OutputFile | null;
  /** The clips changed since the film was made. */
  stale: boolean;
  merging: boolean;
  busy: boolean;
  offline: boolean;
  onMerge: () => void;
  /** What a clip belongs to in the copy: "beat" (default) or "scene". */
  unit?: "beat" | "scene";
  /** Name of the downloaded file. */
  downloadName?: string;
  /** Replaces the caption under the video. */
  orderNote?: string;
  /** The individual clips, in film order. When given, a button saves each one as its own file. */
  clips?: { file: OutputFile; name: string }[];
};

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Saves each clip as its own file, one after another (browsers drop downloads fired all at once). */
async function downloadClips(clips: { file: OutputFile; name: string }[], onDone: (n: number) => void) {
  for (let i = 0; i < clips.length; i++) {
    const res = await fetch(viewUrl(clips[i].file));
    if (!res.ok) throw new Error(`Could not fetch clip ${i + 1} (${res.status})`);
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `${String(i + 1).padStart(2, "0")}-${clips[i].name.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "clip"}.mp4`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    onDone(i + 1);
    await pause(400);
  }
}

const button =
  "plaque-label inline-flex items-center gap-1.5 rounded-full border-2 border-ink bg-accent px-4 py-2 text-[11px] text-on-accent hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-45";

export function FinalFilm(p: Props) {
  const unit = p.unit ?? "beat";
  const canMerge = p.clipCount >= 2 && !p.busy && !p.offline;
  const [saving, setSaving] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const clips = p.clips ?? [];
  async function saveAll() {
    setSaveError(null);
    setSaving(0);
    try {
      await downloadClips(clips, setSaving);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setSaving(null);
    }
  }
  return (
    <section aria-label="Final film" className="plate-marks rounded-2xl border-2 border-ink bg-panel p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="plaque-label text-[11px] text-dim">Final film · {p.clipCount} {p.clipCount === 1 ? "clip" : "clips"} ready</p>
        <div className="flex flex-wrap items-center gap-2">
        {p.clips && (
          <button
            type="button"
            onClick={() => void saveAll()}
            disabled={clips.length === 0 || saving !== null || p.offline}
            title={clips.length === 0 ? "Make a video first" : "Save every clip as its own MP4, before combining"}
            className={button}
          >
            {saving !== null ? <LoaderCircle size={13} className="animate-spin" /> : <Download size={13} />}
            {saving !== null ? `Saving ${saving}/${clips.length}…` : `Download clips (${clips.length})`}
          </button>
        )}
        <button
          type="button"
          onClick={p.onMerge}
          disabled={!canMerge}
          title={p.clipCount < 2 ? `Make at least two ${unit} videos first` : unit === "beat" ? "Join every beat's video, earliest first" : "Join every scene's video, in order"}
          className={button}
        >
          {p.merging ? <LoaderCircle size={13} className="animate-spin" /> : <Film size={13} />}
          {p.merging ? "Combining…" : p.film ? "Combine again" : "Combine all videos"}
        </button>
        </div>
      </div>

      {saveError && <p className="mb-2 text-xs text-oxide">{saveError}</p>}
      <div className="flex aspect-video items-center justify-center overflow-hidden rounded-xl border-2 border-ink bg-stage-well">
        {p.film ? (
          <video key={viewUrl(p.film)} src={viewUrl(p.film)} controls className="size-full bg-black" />
        ) : (
          <p className="px-6 text-center font-serif text-sm text-stage-dim">
            {p.clipCount < 2
              ? `Make a video for at least two ${unit === "beat" ? "story beats" : "scenes"}, then combine them into one film here.`
              : unit === "beat"
                ? "Combine your beat videos into one film, earliest moment first."
                : "Combine your scene videos into one film, in scene order."}
          </p>
        )}
      </div>

      <div className="plaque-label mt-1.5 flex items-center justify-between text-[11px] text-dim">
        <span>{p.film && p.stale ? "Out of date — the clips changed. Combine again." : (p.orderNote ?? "Clips play in story order (by year)")}</span>
        {p.film && (
          <a href={viewUrl(p.film)} download={p.downloadName ?? "whatifstreet-film.mp4"} className="text-accent hover:underline">
            Download MP4
          </a>
        )}
      </div>
    </section>
  );
}
