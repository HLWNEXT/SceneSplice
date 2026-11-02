"use client";

import { Clapperboard, ImagePlus, LoaderCircle, PencilLine, Plus, Square, Trash2, Wand2 } from "lucide-react";
import type { ReactNode } from "react";
import { INPUT_LABELS, offsetAt, type InputKind, type StoryFrame } from "../../lib/scenario";
import type { StoryNode } from "../../lib/storyline";
import { formatOffset } from "../../lib/timetravel";

export type Selection = { type: "input"; kind: InputKind } | { type: "beat"; id: string } | null;
export type JobState = { kind: "story" | "keyframe" | "video"; id?: string } | null;

type Props = {
  selection: Selection;
  beat: StoryNode | undefined;
  frame: StoryFrame;
  summaries: Record<InputKind, string | null>;
  readyCount: number;
  hasStory: boolean;
  stale: boolean;
  job: JobState;
  progress: { percent: number; message: string } | null;
  error: string | null;
  online: boolean | null;
  panelOpen: boolean;
  onTogglePanel: () => void;
  onMakeStory: () => void;
  onAbort: () => void;
  onEditText: () => void;
  onGenerateKeyframe: () => void;
  onMakeVideo: () => void;
  onAddChild: () => void;
  onDelete: () => void;
};

const action =
  "plaque-label inline-flex items-center gap-1.5 rounded-none border px-3 py-2 text-[11px] disabled:cursor-not-allowed disabled:opacity-45";
const quiet = `${action} border-edge bg-field text-ink hover:bg-panel`;
const strong = `${action} border-accent bg-accent text-on-accent`;

function Spin({ on, children }: { on: boolean; children: ReactNode }) {
  return on ? <LoaderCircle size={13} className="animate-spin" /> : <>{children}</>;
}

export function SelectionBar(p: Props) {
  const busy = !!p.job;
  const allReady = p.readyCount === 4;
  const offline = p.online === false;
  const showBig = allReady && (!p.hasStory || p.stale || !p.selection);

  let title: string | null = null;
  let detail: string | null = null;
  if (p.selection?.type === "input") {
    title = INPUT_LABELS[p.selection.kind];
    detail = p.summaries[p.selection.kind] ?? "Not set yet";
  } else if (p.selection?.type === "beat" && p.beat) {
    title = `Story beat · ${formatOffset(offsetAt(p.frame, p.beat.year))}`;
    detail = p.beat.text;
  }

  return (
    <section aria-label="Selection" className="plate-marks border border-line bg-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="plaque-label text-[11px] text-dim">{title ? `Selected · ${title}` : "Nothing selected"}</p>
          <p className="mt-1 line-clamp-2 font-serif text-sm leading-snug text-ink">
            {detail ?? (p.hasStory ? "Click a node on the canvas to edit it or generate its image." : "Click a node above to set it up.")}
          </p>
        </div>

        {p.selection?.type === "input" && (
          <button type="button" onClick={p.onTogglePanel} className={quiet}>
            <PencilLine size={13} /> {p.panelOpen ? "Hide editor" : "Edit"}
          </button>
        )}

        {p.selection?.type === "beat" && p.beat && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={p.onEditText} disabled={busy} className={quiet}>
              <PencilLine size={13} /> Edit text
            </button>
            <button type="button" onClick={p.onGenerateKeyframe} disabled={busy || offline} className={strong}>
              <Spin on={p.job?.kind === "keyframe" && p.job.id === p.beat.id}>
                <ImagePlus size={13} />
              </Spin>
              {p.beat.keyframe ? "Regenerate keyframe" : "Generate keyframe"}
            </button>
            <button
              type="button"
              onClick={p.onMakeVideo}
              disabled={busy || offline || !p.beat.keyframe}
              title={p.beat.keyframe ? "Animate this keyframe" : "Generate a keyframe first"}
              className={quiet}
            >
              <Spin on={p.job?.kind === "video" && p.job.id === p.beat.id}>
                <Clapperboard size={13} />
              </Spin>
              {p.beat.video ? "Regenerate video" : "Make video"}
            </button>
            <button type="button" onClick={p.onAddChild} disabled={busy} className={quiet}>
              <Plus size={13} /> Add next beat
            </button>
            <button type="button" onClick={p.onDelete} disabled={busy} className={quiet}>
              <Trash2 size={13} /> Delete
            </button>
          </div>
        )}
      </div>

      {showBig && (
        <div className="mt-4 border-t border-edge pt-4">
          <button type="button" onClick={p.onMakeStory} disabled={busy || offline} className={`${strong} w-full justify-center py-4 text-sm`}>
            <Spin on={p.job?.kind === "story"}>
              <Wand2 size={17} />
            </Spin>
            {p.job?.kind === "story" ? "Writing your story…" : p.hasStory ? "Remake your story" : "Make your story"}
          </button>
          {p.hasStory && p.stale && !busy && (
            <p className="mt-2 text-center font-serif text-xs italic text-dim">
              Your starting points changed. Remaking replaces the storyline and its images.
            </p>
          )}
        </div>
      )}

      {!allReady && !p.hasStory && (
        <p className="mt-3 font-serif text-xs italic text-dim">
          {p.readyCount} of 4 starting points set. Fill in location, time, butterfly event and environment to make your story.
        </p>
      )}
      {offline && <p className="mt-3 font-serif text-xs text-oxide">ComfyUI is offline — check the server in Settings (gear icon).</p>}

      {(busy || p.progress) && (
        <div className="mt-3 flex items-center gap-3">
          <div className="h-1.5 flex-1 bg-field">
            <div className="h-full bg-accent transition-[width]" style={{ width: `${busy ? (p.progress?.percent ?? 0) : 0}%` }} />
          </div>
          <span className="font-mono text-[11px] text-dim">{p.progress?.message}</span>
          {busy && (
            <button type="button" onClick={p.onAbort} className={quiet}>
              <Square size={11} fill="currentColor" /> Abort
            </button>
          )}
        </div>
      )}
      {p.error && !busy && (
        <p role="alert" className="mt-3 font-mono text-xs text-oxide">
          {p.error}
        </p>
      )}
    </section>
  );
}
