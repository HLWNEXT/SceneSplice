"use client";

import { Clapperboard, ImagePlus, LoaderCircle, Sparkles, Trash2, Video, X } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { viewUrl } from "../../lib/comfy";
import { MAX_REFERENCES, finalFrame, formatClock, type SceneData, type SceneMode, type Upload } from "../../lib/walkthrough";

const small =
  "plaque-label chrome inline-flex items-center gap-1.5 rounded-full border-2 border-ink px-3 py-1.5 text-[10px] text-ink disabled:cursor-not-allowed disabled:opacity-45";
const primary =
  "plaque-label inline-flex items-center gap-1.5 rounded-full border-2 border-ink bg-accent px-4 py-2 text-[11px] text-on-accent hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-45";
const field = "w-full rounded-xl border-2 border-ink bg-field px-3 py-2 text-sm text-ink outline-none focus:border-accent disabled:opacity-60";

const MODES: { id: SceneMode; label: string; hint: string }[] = [
  { id: "whitebox", label: "White-box view", hint: "A clay or massing view. We render it from your prompt and references." },
  { id: "rendered", label: "Rendered view", hint: "Already finished. Goes straight to video." },
  { id: "inbetween", label: "In-between", hint: "Generated from the scene before it and the scene after it, to give a long camera move an extra step." },
];

type Props = {
  /** Shown in the header and used as the name's placeholder. */
  label: string;
  /** Position of the scene on its route, for the badge. */
  order: number;
  scene: SceneData;
  /** The scene's animation prompt: the text of its node on the canvas. Empty when the node still has its placeholder. */
  prompt: string;
  /** Seconds between the scene before and this one on the timeline, and the clip length that will be asked for (null for the first scene). */
  gapSeconds: number;
  clipSeconds: number | null;
  /** Length of a single-frame clip of this scene. */
  singleSeconds: number;
  /** Why a single-frame clip can't be made yet, or null. */
  singleBlocker: string | null;
  /** Why the image can't be generated yet, or null. */
  blocker: string | null;
  /** Why the clip into this scene can't be made yet, or null. Undefined when there is no clip (first scene). */
  videoBlocker?: string | null;
  videoStale: boolean;
  busy: boolean;
  /** This scene's own job is running. */
  working: "image" | "video" | "single" | null;
  onName: (name: string) => void;
  onPrompt: (text: string) => void;
  onImagePrompt: (text: string) => void;
  onMode: (mode: SceneMode) => void;
  onDrawing: (file: File) => void;
  onReference: (files: File[]) => void;
  onRemoveReference: (i: number) => void;
  onRemove: () => void;
  onGenerate: () => void;
  onVideo: () => void;
  onSingleVideo: () => void;
};

function Picker({ label, multiple, disabled, onFiles }: { label: string; multiple?: boolean; disabled?: boolean; onFiles: (f: File[]) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        multiple={multiple}
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])].filter((f) => f.type.startsWith("image/"));
          e.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
      <button type="button" disabled={disabled} onClick={() => ref.current?.click()} className={small}>
        <ImagePlus size={12} /> {label}
      </button>
    </>
  );
}

/** Accepts images dropped from the desktop. Non-image files are ignored; without `multiple` only the first image is used. */
function DropZone({ disabled, multiple, onFiles, children }: { disabled?: boolean; multiple?: boolean; onFiles: (f: File[]) => void; children: ReactNode }) {
  const [over, setOver] = useState(false);
  const hasFiles = (e: React.DragEvent) => [...e.dataTransfer.types].includes("Files");
  return (
    <div
      onDragOver={(e) => {
        if (disabled || !hasFiles(e)) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => {
        // Ignore leave events fired when moving between the zone's own children.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (disabled) return;
        const images = [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"));
        if (images.length) onFiles(multiple ? images : images.slice(0, 1));
      }}
      className={`rounded-xl ${over ? "outline outline-2 outline-offset-2 outline-dashed outline-accent" : ""}`}
    >
      {children}
    </div>
  );
}

function Thumb({ upload, onRemove, disabled }: { upload: Upload; onRemove: () => void; disabled: boolean }) {
  return (
    <div className="relative size-16 overflow-hidden rounded-lg border-2 border-ink bg-field">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={viewUrl(upload.file)} alt={upload.label} title={upload.label} className="size-full object-cover" />
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label={`Remove ${upload.label}`}
        className="absolute right-0.5 top-0.5 rounded-full bg-ink p-0.5 text-field disabled:opacity-40"
      >
        <X size={10} />
      </button>
    </div>
  );
}

function Frame({ src, empty, alt }: { src: string | null; empty: string; alt: string }) {
  return (
    <div className="flex aspect-video items-center justify-center overflow-hidden rounded-xl border-2 border-ink bg-stage-well">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="size-full object-contain" />
      ) : (
        <p className="px-4 text-center font-serif text-xs text-stage-dim">{empty}</p>
      )}
    </div>
  );
}

export function SceneCard(p: Props) {
  const s = p.scene;
  const inbetween = s.mode === "inbetween";
  const frame = finalFrame(s);
  const off = p.busy;
  const hasClip = p.videoBlocker !== undefined;
  const single = s.videoMeta?.mode === "single";

  return (
    <article className="plate-marks rounded-2xl border-2 border-ink bg-panel p-5" aria-label={p.label}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-on-accent">
          {String(p.order).padStart(2, "0")}
        </span>
        <input
          value={s.name}
          onChange={(e) => p.onName(e.target.value)}
          placeholder={p.label}
          aria-label="Scene name"
          disabled={off}
          className="plaque-label min-w-0 flex-1 bg-transparent text-[12px] text-ink outline-none placeholder:text-dim"
        />
        <button type="button" onClick={p.onRemove} disabled={off} aria-label="Delete scene" title="Delete this scene and everything after it" className={small}>
          <Trash2 size={12} />
        </button>
      </div>

      <div role="radiogroup" aria-label="Scene type" className="flex flex-wrap gap-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={s.mode === m.id}
            title={m.hint}
            disabled={off}
            onClick={() => p.onMode(m.id)}
            className={`plaque-label rounded-full border-2 border-ink px-3 py-1.5 text-[10px] disabled:opacity-45 ${s.mode === m.id ? "bg-accent text-on-accent" : "chrome text-ink"}`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="mb-4 mt-2 text-xs leading-relaxed text-dim">{MODES.find((m) => m.id === s.mode)?.hint}</p>

      {/* The two viewers share a row: same label height, same frame size, same action row height */}
      <div className="grid gap-x-5 gap-y-2 md:grid-cols-2">
        <p className="plaque-label text-[10px] text-dim">{inbetween ? "Neighbouring scenes" : "Your drawing"}</p>
        <p className="plaque-label text-[10px] text-dim">{s.mode === "rendered" ? "Frame (your render)" : "Generated frame"}</p>

        <DropZone disabled={off || inbetween} onFiles={(f) => p.onDrawing(f[0])}>
          <Frame
            src={!inbetween && s.drawing ? viewUrl(s.drawing.file) : null}
            empty={inbetween ? "Made from the scenes on either side of this one" : s.drawing ? "" : "Drop a drawing here, or use Upload drawing"}
            alt={s.drawing?.label ?? "Drawing"}
          />
        </DropZone>
        <Frame
          src={frame ? viewUrl(frame) : null}
          empty={s.mode === "rendered" ? "Upload your rendered view" : "Nothing generated yet"}
          alt={`${p.label} frame`}
        />

        <div className="flex min-h-9 items-center justify-between gap-2">
          {!inbetween && (
            <>
              <span className="truncate font-serif text-xs text-dim">{s.drawing?.label ?? ""}</span>
              <Picker label={s.drawing ? "Replace drawing" : "Upload drawing"} disabled={off} onFiles={(f) => p.onDrawing(f[0])} />
            </>
          )}
        </div>
        <div className="flex min-h-9 flex-wrap items-center gap-3">
          {s.mode !== "rendered" ? (
            <>
              <button type="button" onClick={p.onGenerate} disabled={off || !!p.blocker} title={p.blocker ?? undefined} className={primary}>
                {p.working === "image" ? <LoaderCircle size={13} className="animate-spin" /> : <Sparkles size={13} />}
                {p.working === "image" ? "Generating…" : s.render ? "Generate again" : "Generate image"}
              </button>
              {p.blocker && <span className="text-xs text-dim">{p.blocker}</span>}
            </>
          ) : (
            <span className="text-xs text-dim">Used as is — no generation needed.</span>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <div className="space-y-3">
          {s.mode === "whitebox" && (
            <DropZone multiple disabled={off || s.references.length >= MAX_REFERENCES} onFiles={p.onReference}>
              <p className="plaque-label mb-1.5 text-[10px] text-dim">Reference images ({s.references.length}/{MAX_REFERENCES}) · drop images here</p>
              <div className="flex flex-wrap items-center gap-2">
                {s.references.map((r, i) => (
                  <Thumb key={`${r.file.filename}-${i}`} upload={r} disabled={off} onRemove={() => p.onRemoveReference(i)} />
                ))}
                {s.references.length < MAX_REFERENCES && <Picker label="Add references" multiple disabled={off} onFiles={p.onReference} />}
              </div>
            </DropZone>
          )}

          {s.mode !== "rendered" && (
            <label className="block">
              <span className="plaque-label mb-1.5 block text-[10px] text-dim">
                {s.mode === "whitebox" ? "Image prompt: what to render" : "What this frame shows (optional)"}
              </span>
              <textarea
                value={s.imagePrompt}
                onChange={(e) => p.onImagePrompt(e.target.value)}
                rows={3}
                disabled={off}
                placeholder={
                  s.mode === "whitebox"
                    ? "Warm oak floor, lime-plaster walls, deep green velvet sofa, late-afternoon light through the east window…"
                    : "The stair landing, seen from halfway up."
                }
                className={field}
              />
            </label>
          )}

          <label className="block">
            <span className="plaque-label mb-1.5 block text-[10px] text-dim">Animation prompt: camera motion, what to animate, and how (also the node's text)</span>
            <textarea
              value={p.prompt}
              onChange={(e) => p.onPrompt(e.target.value)}
              rows={4}
              disabled={off}
              placeholder="Slow dolly forward toward the east window while drifting slightly right. The sheer curtain stirs in a light breeze and dust floats through the sunbeam."
              className={field}
            />
            <span className="mt-1 block text-xs leading-relaxed text-dim">
              Describes how this scene's still image is brought to life. It guides the clip that arrives here and the single-frame clip below. Leave it empty to let the model choose.
            </span>
          </label>
        </div>

        <div>
          <p className="plaque-label mb-1.5 text-[10px] text-dim">
            {s.video ? (single ? "Video animated from this frame alone" : "Video from the scene before") : "Video"}
          </p>
          <div className="flex aspect-video items-center justify-center overflow-hidden rounded-xl border-2 border-ink bg-stage-well">
            {s.video ? (
              <video key={viewUrl(s.video)} src={viewUrl(s.video)} controls className="size-full bg-black" />
            ) : (
              <p className="px-4 text-center font-serif text-xs text-stage-dim">No clip yet</p>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {hasClip && (
              <button type="button" onClick={p.onVideo} disabled={off || !!p.videoBlocker} title={p.videoBlocker ?? undefined} className={primary}>
                {p.working === "video" ? <LoaderCircle size={13} className="animate-spin" /> : <Video size={13} />}
                {p.working === "video" ? "Making video…" : s.video && !single ? "Make video again" : `Make video (${p.clipSeconds} s)`}
              </button>
            )}
            <button type="button" onClick={p.onSingleVideo} disabled={off || !!p.singleBlocker} title={p.singleBlocker ?? undefined} className={hasClip ? small : primary}>
              {p.working === "single" ? <LoaderCircle size={13} className="animate-spin" /> : <Clapperboard size={13} />}
              {p.working === "single" ? "Animating…" : s.video && single ? "Animate again" : `Animate this frame (${p.singleSeconds} s)`}
            </button>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-dim">
            {hasClip && p.clipSeconds !== null
              ? `Make video runs from the scene before to this one over the ${formatClock(p.gapSeconds)} between them${p.clipSeconds !== Math.round(p.gapSeconds) ? `, limited to ${p.clipSeconds} s by the video model` : ""}. Animate this frame uses this scene's frame alone, replacing that clip.`
              : "Animate this frame turns this scene's frame alone into a short clip. Add a scene after it to make a video that travels between them."}
          </p>
          {hasClip && p.videoBlocker && <p className="mt-1 text-xs text-dim">{p.videoBlocker}</p>}
          {!p.videoBlocker && p.videoStale && <p className="mt-1 text-xs text-oxide">Out of date — a frame or the timeline gap changed. Make it again.</p>}
          {s.videoMeta && <p className="mt-2 text-xs leading-relaxed text-dim">Video prompt: {s.videoMeta.prompt}</p>}
        </div>
      </div>
    </article>
  );
}
