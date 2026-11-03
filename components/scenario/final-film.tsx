"use client";

import { Film, LoaderCircle } from "lucide-react";
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
};

const button =
  "plaque-label inline-flex items-center gap-1.5 rounded-full border-2 border-ink bg-accent px-4 py-2 text-[11px] text-on-accent hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-45";

export function FinalFilm(p: Props) {
  const canMerge = p.clipCount >= 2 && !p.busy && !p.offline;
  return (
    <section aria-label="Final film" className="plate-marks rounded-2xl border-2 border-ink bg-panel p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="plaque-label text-[11px] text-dim">Final film · {p.clipCount} {p.clipCount === 1 ? "clip" : "clips"} ready</p>
        <button
          type="button"
          onClick={p.onMerge}
          disabled={!canMerge}
          title={p.clipCount < 2 ? "Make at least two beat videos first" : "Join every beat's video, earliest first"}
          className={button}
        >
          {p.merging ? <LoaderCircle size={13} className="animate-spin" /> : <Film size={13} />}
          {p.merging ? "Combining…" : p.film ? "Combine again" : "Combine all videos"}
        </button>
      </div>

      <div className="flex aspect-video items-center justify-center overflow-hidden rounded-xl border-2 border-ink bg-stage-well">
        {p.film ? (
          <video key={viewUrl(p.film)} src={viewUrl(p.film)} controls className="size-full bg-black" />
        ) : (
          <p className="px-6 text-center font-serif text-sm text-stage-dim">
            {p.clipCount < 2
              ? "Make a video for at least two story beats, then combine them into one film here."
              : "Combine your beat videos into one film, earliest moment first."}
          </p>
        )}
      </div>

      <div className="plaque-label mt-1.5 flex items-center justify-between text-[11px] text-dim">
        <span>{p.film && p.stale ? "Out of date — the clips changed. Combine again." : "Clips play in story order (by year)"}</span>
        {p.film && (
          <a href={viewUrl(p.film)} download="whatifstreet-film.mp4" className="text-accent hover:underline">
            Download MP4
          </a>
        )}
      </div>
    </section>
  );
}
