"use client";

import { Maximize, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { frameCaption, offsetAt, type StoryFrame } from "../../lib/scenario";
import {
  DEFAULT_PX_PER_YEAR,
  NODE_H,
  NODE_W,
  ORIGIN_GAP,
  axisTicks,
  clampScale,
  clampYear,
  formatYear,
  isLeaf,
  pathToRoot,
  tickLabel,
  xToYear,
  yearToX,
  type StoryTree,
} from "../../lib/storyline";
import { formatOffset } from "../../lib/timetravel";

// Two independent zooms: `ppy` is the time scale (horizontal px per year, changed by the wheel) and
// `ns` is the node size (nodes and row spacing, changed by the slider or Ctrl+wheel). Changing one
// never moves or resizes anything the other controls.
type View = { x: number; y: number; ppy: number; ns: number };

const MIN_NS = 0.5;
const MAX_NS = 1.6;
const THUMB_W = 116;
const EMPTY_BEAT_TEXT = "Untitled beat — click to describe what happens.";
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

type Props = {
  tree: StoryTree;
  setTree: Dispatch<SetStateAction<StoryTree>>;
  /** Beat selection. null clears every selection, including an input node's. */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  editingId: string | null;
  onEditing: (id: string | null) => void;
  onAddChild: (id: string, ppy: number) => void;
  onDelete: (id: string) => void;
  frame: StoryFrame;
  /** Bump to re-frame the whole tree (after a new story is made). */
  fitKey: number;
  /** Pixels reserved on the left for the docked input nodes. */
  leftInset: number;
  /** The four input nodes, drawn over the canvas. */
  inputs: ReactNode;
};

export function StorylineCanvas({
  tree,
  setTree,
  selectedId,
  onSelect,
  editingId,
  onEditing,
  onAddChild,
  onDelete,
  frame,
  fitKey,
  leftInset,
  inputs,
}: Props) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, ppy: DEFAULT_PX_PER_YEAR, ns: 1 });
  const [vpW, setVpW] = useState(1200);

  const vpRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ sx: number; sy: number; vx: number; vy: number } | null>(null);
  const dragRef = useRef<{ id: string; cx: number; cy: number; wx: number; wy: number } | null>(null);

  const nodes = useMemo(() => Object.values(tree), [tree]);
  const hotPath = useMemo(
    () => new Set(selectedId && tree[selectedId] ? pathToRoot(tree, selectedId).map((n) => n.id) : []),
    [tree, selectedId],
  );

  const fit = useCallback(
    (t: StoryTree) => {
      const el = vpRef.current;
      const all = Object.values(t);
      if (!el || !all.length) return;
      const years = all.map((n) => n.year);
      const minYear = Math.min(...years);
      const span = Math.max(Math.max(...years) - minYear, 1);
      const minY = Math.min(...all.map((n) => n.y));
      const maxY = Math.max(...all.map((n) => n.y)) + NODE_H;
      const pad = 40;
      const availW = el.clientWidth - leftInset;
      const ns = clamp((el.clientHeight - pad * 2) / (maxY - minY), 0.55, 1);
      // Keyframe 0 sits one node (plus a gap) to the left of the story's first beat.
      const extra = all.some((n) => n.origin) ? (NODE_W + ORIGIN_GAP) * ns : 0;
      const ppy = clampScale((availW - pad * 2 - NODE_W * ns - extra) / span);
      const contentW = span * ppy + NODE_W * ns + extra;
      setView({
        ns,
        ppy,
        x: leftInset + (availW - contentW) / 2 + (NODE_W * ns) / 2 + extra - minYear * ppy,
        y: (el.clientHeight - (maxY - minY) * ns) / 2 - minY * ns,
      });
    },
    [leftInset],
  );

  useLayoutEffect(() => fit(tree), [fitKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track the viewport width so the axis knows how many ticks to draw.
  useEffect(() => {
    const el = vpRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setVpW(el.clientWidth));
    ro.observe(el);
    setVpW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Node size, anchored at screen-Y `my` so the rows under that point stay put.
  const setNodeScale = useCallback((ns: number, my: number) => {
    setView((v) => {
      const next = clamp(ns, MIN_NS, MAX_NS);
      return { ...v, ns: next, y: my - (my - v.y) * (next / v.ns) };
    });
  }, []);

  // Wheel = time scale (anchored on the cursor's date); Ctrl/Cmd+wheel = node size. Must be a
  // non-passive native listener so it can preventDefault page scroll / browser zoom.
  useEffect(() => {
    const el = vpRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const f = Math.exp(-e.deltaY * 0.0015);
      if (e.ctrlKey || e.metaKey) {
        setView((v) => {
          const ns = clamp(v.ns * f, MIN_NS, MAX_NS);
          return { ...v, ns, y: my - (my - v.y) * (ns / v.ns) };
        });
      } else {
        setView((v) => {
          const ppy = clampScale(v.ppy * f);
          return { ...v, ppy, x: mx - (mx - v.x) * (ppy / v.ppy) };
        });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const patch = (id: string, p: Partial<StoryTree[string]>) =>
    setTree((t) => (t[id] ? { ...t, [id]: { ...t[id], ...p } } : t));

  // -- canvas pan --
  const isUi = (target: EventTarget) => (target as HTMLElement).closest("[data-ui]") !== null;
  const onCanvasDown = (e: React.PointerEvent) => {
    if (isUi(e.target) || e.button !== 0) return;
    panRef.current = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
    e.currentTarget.setPointerCapture(e.pointerId);
    onSelect(null);
    onEditing(null);
  };
  const onCanvasMove = (e: React.PointerEvent) => {
    const p = panRef.current;
    if (p) setView((v) => ({ ...v, x: p.vx + e.clientX - p.sx, y: p.vy + e.clientY - p.sy }));
  };
  const onCanvasUp = () => {
    panRef.current = null;
  };

  // -- node drag: X is time, Y is free --
  const onGripDown = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return;
    const n = tree[id];
    if (n.origin) return onSelect(id);
    dragRef.current = { id, cx: e.clientX, cy: e.clientY, wx: yearToX(n.year, view.ppy), wy: n.y };
    e.currentTarget.setPointerCapture(e.pointerId);
    onSelect(id);
    setDraggingId(id);
  };
  const onGripMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const year = xToYear(d.wx + (e.clientX - d.cx), view.ppy);
    const y = d.wy + (e.clientY - d.cy) / view.ns;
    setTree((t) => (t[d.id] ? { ...t, [d.id]: { ...t[d.id], year: clampYear(t, d.id, year, view.ppy), y } } : t));
  };
  const onGripUp = () => {
    dragRef.current = null;
    setDraggingId(null);
  };

  // -- derived screen-space bits for the timeline + keyframe strip --
  const sx = (year: number) => view.x + yearToX(year, view.ppy);
  const ticks = useMemo(
    () => axisTicks(view.ppy, -view.x / view.ppy, (vpW - view.x) / view.ppy),
    [view.ppy, view.x, vpW],
  );
  const keyed = nodes.filter((n) => n.keyframe);
  const nodeW = NODE_W * view.ns;
  const nodeH = NODE_H * view.ns;
  // Keyframe 0 shares year 0 with the first beat, so it is drawn one node to the left of it.
  const xOf = (n: StoryTree[string]) => yearToX(n.year, view.ppy) - (n.origin ? nodeW + ORIGIN_GAP * view.ns : 0);

  return (
    <section
      className="scanlines flex h-[560px] flex-col overflow-hidden rounded-3xl border-2 border-ink bg-stage text-void"
      aria-label="Storyline canvas"
    >
      <div
        ref={vpRef}
        className="relative min-h-0 flex-1 touch-none select-none overflow-hidden bg-stage-well"
        style={{
          cursor: panRef.current ? "grabbing" : "grab",
          backgroundImage: "radial-gradient(rgba(169,169,176,0.2) 1px, transparent 1px)",
          backgroundSize: `${24 * view.ns}px ${24 * view.ns}px`,
          backgroundPosition: `${view.x}px ${view.y}px`,
        }}
        onPointerDown={onCanvasDown}
        onPointerMove={onCanvasMove}
        onPointerUp={onCanvasUp}
        onPointerCancel={onCanvasUp}
      >
        {nodes.length > 0 &&
          ticks.major.map((t) => (
            <div key={t} className="pointer-events-none absolute inset-y-0 w-px bg-stage-line/50" style={{ left: sx(t) }} />
          ))}

        {/* The world layer only translates: sizes are applied per node so time never scales them. */}
        <div className="absolute left-0 top-0" style={{ transform: `translate(${view.x}px, ${view.y}px)` }}>
          <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1">
            {nodes
              .filter((n) => n.parentId && tree[n.parentId])
              .map((n) => {
                const p = tree[n.parentId!];
                const x1 = xOf(p) + nodeW / 2;
                const y1 = p.y * view.ns + nodeH / 2;
                const x2 = xOf(n) - nodeW / 2;
                const y2 = n.y * view.ns + nodeH / 2;
                const c = Math.max(60, Math.abs(x2 - x1) / 2);
                const hot = hotPath.has(n.id);
                return (
                  <path
                    key={n.id}
                    d={`M${x1} ${y1} C${x1 + c} ${y1} ${x2 - c} ${y2} ${x2} ${y2}`}
                    fill="none"
                    stroke={hot ? "#5b83ff" : "#4a4a52"}
                    strokeWidth={hot ? 3 : 2}
                  />
                );
              })}
          </svg>

          {nodes.map((n) => {
            const leaf = isLeaf(tree, n.id);
            const sel = n.id === selectedId;
            return (
              <div
                key={n.id}
                data-ui
                onPointerDown={() => onSelect(n.id)}
                className="absolute"
                style={{
                  left: xOf(n) - nodeW / 2,
                  top: n.y * view.ns,
                  width: nodeW,
                  height: nodeH,
                  zIndex: draggingId === n.id ? 20 : sel ? 10 : 1,
                }}
              >
                <div
                  className={`absolute left-0 top-0 flex origin-top-left cursor-default flex-col rounded-xl border bg-stage text-void shadow-[0_6px_18px_rgba(0,0,0,0.55)] ${
                    sel ? "glow border-stage-oxide" : hotPath.has(n.id) ? "border-stage-oxide/60" : "border-stage-line"
                  }`}
                  style={{ width: NODE_W, height: NODE_H, transform: `scale(${view.ns})` }}
                >
                  {/* Grip / header: drag left-right to change when this happens */}
                  <div
                    className="flex cursor-grab items-center justify-between gap-2 rounded-t-xl border-b border-stage-line bg-stage-well px-2.5 py-1 active:cursor-grabbing"
                    onPointerDown={(e) => onGripDown(e, n.id)}
                    onPointerMove={onGripMove}
                    onPointerUp={onGripUp}
                    onPointerCancel={onGripUp}
                    title="Drag horizontally to change when this happens"
                  >
                    <span className="plaque-label min-w-0 truncate text-[10px] text-stage-oxide">
                      {n.origin ? "Keyframe 0 · original" : formatOffset(offsetAt(frame, n.year))}
                      {leaf && <span className="ml-2 text-stage-dim">· end</span>}
                    </span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {n.keyframe && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={n.keyframe.image} alt="" className="h-4 w-7 rounded-sm border border-stage-line object-cover" title="Has a keyframe" />
                      )}
                      {!n.origin && (
                      <button
                        type="button"
                        aria-label="Delete beat and its descendants"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => onDelete(n.id)}
                        className="p-0.5 text-stage-dim hover:text-stage-oxide"
                      >
                        <Trash2 size={13} />
                      </button>
                      )}
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 px-2.5 py-2">
                    {n.origin ? (
                      <p className="h-full overflow-y-auto text-[13px] leading-snug text-stage-dim">{n.text}</p>
                    ) : editingId === n.id ? (
                      <textarea
                        autoFocus
                        value={n.text}
                        // Saved as you type: clicking the canvas background unmounts this textarea
                        // before the browser fires blur, so blur can't be the only commit point.
                        onChange={(e) => patch(n.id, { text: e.target.value })}
                        onBlur={(e) => {
                          if (!e.target.value.trim()) patch(n.id, { text: EMPTY_BEAT_TEXT });
                          onEditing(null);
                        }}
                        onKeyDown={(e) => e.key === "Escape" && (e.target as HTMLElement).blur()}
                        className="h-full w-full resize-none border border-stage-line bg-stage-well p-1 text-[13px] leading-snug text-void outline-none focus:border-stage-oxide"
                      />
                    ) : (
                      <p onClick={() => onEditing(n.id)} className="h-full cursor-text overflow-y-auto text-[13px] leading-snug" title="Click to edit">
                        {n.text || EMPTY_BEAT_TEXT}
                      </p>
                    )}
                  </div>

                  {/* Edge "+" spawns a child */}
                  {!n.origin && (
                  <button
                    type="button"
                    aria-label="Add child beat"
                    onClick={() => onAddChild(n.id, view.ppy)}
                    className="absolute -right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-stage-oxide bg-stage text-stage-oxide hover:bg-accent hover:text-on-accent"
                  >
                    <Plus size={14} />
                  </button>
                  )}
                  {n.parentId && (
                    <span className="pointer-events-none absolute -left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-stage-line bg-stage" />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {nodes.length > 0 && (
          <div className="absolute right-3 top-2 flex flex-col items-end gap-1.5">
            <p className="plaque-label pointer-events-none text-[10px] text-stage-dim">{frameCaption(frame)}</p>
            <div data-ui className="flex items-center gap-2">
              <label className="plaque-label flex items-center gap-1.5 rounded-full border border-stage-line bg-stage px-2.5 py-1 text-[10px] text-stage-dim">
                Node size
                <input
                  type="range"
                  min={MIN_NS}
                  max={MAX_NS}
                  step={0.05}
                  value={view.ns}
                  aria-label="Node size"
                  onChange={(e) => setNodeScale(Number(e.target.value), (vpRef.current?.clientHeight ?? 0) / 2)}
                  className="h-1 w-20 accent-[var(--color-accent)]"
                />
              </label>
              <button
                type="button"
                onClick={() => fit(tree)}
                className="plaque-label inline-flex items-center gap-1.5 rounded-full border border-stage-line bg-stage px-2.5 py-1 text-[10px] text-stage-dim hover:border-stage-oxide hover:text-void"
              >
                <Maximize size={11} /> Fit
              </button>
            </div>
            <p className="plaque-label pointer-events-none text-[9px] text-stage-dim/80">Scroll: time scale · Ctrl+scroll: node size</p>
          </div>
        )}

        {inputs}
      </div>

      {/* Keyframe strip, aligned to the same X scale as the timeline */}
      <div className="relative h-[92px] shrink-0 overflow-hidden border-t border-stage-line bg-stage">
        <span className="plaque-label absolute left-2 top-1 text-[10px] text-stage-dim">Keyframes</span>
        {keyed.length === 0 && (
          <span className="absolute inset-0 flex items-center justify-center text-xs text-stage-dim">
            Generated keyframes appear here, aligned to their year.
          </span>
        )}
        {[...keyed]
          .sort((a, b) => Number(a.id === selectedId) - Number(b.id === selectedId))
          .map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => onSelect(n.id)}
              title={n.keyframe!.prompt}
              className={`absolute bottom-0 flex flex-col items-center ${n.id === selectedId ? "z-10" : ""}`}
              style={{ left: sx(n.year) - THUMB_W / 2, width: THUMB_W }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={n.keyframe!.image}
                alt={`Keyframe ${formatYear(n.year)}`}
                className={`h-[60px] w-full rounded-md border object-cover ${n.id === selectedId ? "border-stage-oxide" : "border-stage-line"}`}
              />
              <span className="text-[10px] leading-4 text-stage-dim">{formatYear(n.year)}</span>
            </button>
          ))}
      </div>

      {/* Timeline axis */}
      <div className="relative h-9 shrink-0 overflow-hidden border-t border-stage-line bg-stage-well">
        <div className="absolute inset-x-0 top-0 h-px bg-edge" />
        {nodes.length > 0 &&
          ticks.minor.map((t) => <div key={t} className="absolute top-0 h-1.5 w-px bg-stage-line" style={{ left: sx(t) }} />)}
        {nodes.length > 0 &&
          ticks.major.map((t) => (
            <div key={t} className="absolute top-0 flex flex-col items-start" style={{ left: sx(t) }}>
              <div className="h-3 w-px bg-stage-dim" />
              <span className="plaque-label -translate-x-1/2 whitespace-nowrap pt-0.5 text-[10px] text-stage-dim">{tickLabel(t)}</span>
            </div>
          ))}
        {nodes.map((n) => (
          <div
            key={n.id}
            className={`absolute top-[-3px] h-1.5 w-1.5 -translate-x-1/2 rounded-full ${n.id === selectedId ? "bg-stage-oxide" : "bg-stage-dim"}`}
            style={{ left: sx(n.year) }}
          />
        ))}
        {draggingId && tree[draggingId] && (
          <span
            className="absolute bottom-0.5 -translate-x-1/2 whitespace-nowrap rounded-full bg-accent px-2 text-[10px] font-bold text-on-accent"
            style={{ left: sx(tree[draggingId].year) }}
          >
            {formatYear(tree[draggingId].year)}
          </span>
        )}
      </div>
    </section>
  );
}
