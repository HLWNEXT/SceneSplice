"use client";

import { type ButterflySelection } from "../../lib/butterfly";
import { type ClimateSelection } from "../../lib/climate";
import { INPUT_LABELS, offsetAt, type StoryFrame } from "../../lib/scenario";
import type { StoryNode } from "../../lib/storyline";
import { viewUrl } from "../../lib/comfy";
import { formatOffset } from "../../lib/timetravel";
import { ButterflySelect } from "../whatifstreet/butterfly-select";
import { ClimateSelect } from "../whatifstreet/climate-select";
import { StreetViewPicker, type StreetViewCaptureFn } from "../whatifstreet/street-view-picker";
import { TimeSlider } from "../whatifstreet/time-slider";
import type { Selection } from "./selection-bar";

type Props = {
  selection: Selection;
  open: boolean;
  disabled: boolean;
  beat: StoryNode | undefined;
  frame: StoryFrame;
  years: number | null;
  butterfly: ButterflySelection | null;
  climate: ClimateSelection;
  onCaptureReady: (fn: StreetViewCaptureFn | null) => void;
  onLocationChange: (label: string) => void;
  onYears: (years: number) => void;
  onButterfly: (v: ButterflySelection | null) => void;
  onClimate: (v: ClimateSelection) => void;
};

export function DetailPanel(p: Props) {
  const kind = p.selection?.type === "input" && p.open ? p.selection.kind : null;
  const showBeat = p.selection?.type === "beat" && !!p.beat;

  return (
    <section aria-label="Editor" className="plate-marks rounded-2xl border-2 border-ink bg-panel p-5">
      <p className="plaque-label mb-4 text-[11px] text-dim">
        {kind ? `Editing · ${INPUT_LABELS[kind]}` : showBeat ? `Preview · ${formatOffset(offsetAt(p.frame, p.beat!.year))}` : "Editor"}
      </p>

      {/* Always mounted, only hidden: unmounting the picker reports its capture as lost, which would
          wipe the location and anything generated from it. */}
      <div className={kind === "location" ? "rounded-2xl bg-stage p-4" : "hidden"}>
        <StreetViewPicker disabled={p.disabled} onCaptureReady={p.onCaptureReady} onLocationChange={p.onLocationChange} />
      </div>

      {kind === "time" && (
        <div className="max-w-[640px]">
          <TimeSlider years={p.years ?? 0} disabled={p.disabled} onChange={p.onYears} />
          <p className="mt-3 text-xs leading-relaxed text-dim">
            {p.years === null
              ? "Move the slider, or click TODAY, to set the time."
              : p.years < 0
                ? "The story starts then and runs forward to today."
                : p.years === 0
                  ? "Today looks ten years ahead from the street as it is now."
                  : "The story starts today and runs forward to this point."}
          </p>
        </div>
      )}

      {kind === "butterfly" && (
        <div className="max-w-[640px]">
          <ButterflySelect value={p.butterfly} disabled={p.disabled} onChange={p.onButterfly} />
        </div>
      )}

      {kind === "environment" && (
        <div className="max-w-[640px]">
          <ClimateSelect value={p.climate} disabled={p.disabled} onChange={p.onClimate} />
          <p className="mt-3 text-xs text-dim">Choose None if the weather shouldn&apos;t matter — that still counts as set.</p>
        </div>
      )}

      {showBeat && !kind && (
        <div className="grid gap-4 md:grid-cols-2">
          <figure>
            <div className="flex aspect-video items-center justify-center overflow-hidden rounded-xl border-2 border-ink bg-stage-well">
              {p.beat!.keyframe ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.beat!.keyframe.image} alt="Keyframe" className="size-full object-contain" />
              ) : (
                <p className="px-6 text-center font-serif text-sm text-stage-dim">No keyframe yet. Use “Generate keyframe” above.</p>
              )}
            </div>
            <figcaption className="plaque-label mt-1.5 text-[11px] text-dim">Keyframe</figcaption>
          </figure>
          <figure>
            <div className="flex aspect-video items-center justify-center overflow-hidden rounded-xl border-2 border-ink bg-stage-well">
              {p.beat!.video ? (
                <video src={viewUrl(p.beat!.video)} controls autoPlay loop className="size-full bg-black" />
              ) : (
                <p className="px-6 text-center font-serif text-sm text-stage-dim">
                  {p.beat!.keyframe ? "No video yet. Use “Make video” above." : "A video is made from the keyframe."}
                </p>
              )}
            </div>
            <figcaption className="plaque-label mt-1.5 flex items-center justify-between text-[11px] text-dim">
              <span>Video</span>
              {p.beat!.video && (
                <a href={viewUrl(p.beat!.video)} download="whatifstreet.mp4" className="text-accent hover:underline">
                  Download MP4
                </a>
              )}
            </figcaption>
          </figure>
        </div>
      )}

      {!kind && !showBeat && (
        <p className="font-serif text-sm leading-relaxed text-dim">
          Select a node on the canvas. Starting points open their editor here; story beats show their keyframe and video.
        </p>
      )}
    </section>
  );
}
