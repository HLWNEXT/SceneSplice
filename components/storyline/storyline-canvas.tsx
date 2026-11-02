"use client";

import {
  Clapperboard,
  Copy,
  ImagePlus,
  LoaderCircle,
  Maximize,
  Plus,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AXIS_TICKS,
  MOCK_LLM_STORY,
  MOCK_STORY,
  MOCK_SUBJECT,
  NODE_H,
  NODE_W,
  addChild,
  buildPrompt,
  clampYear,
  deleteSubtree,
  formatYear,
  fromJson,
  isLeaf,
  pathToRoot,
  placeholderImage,
  planVideo,
  toJson,
  xToYear,
  yearToX,
  type RenderPlan,
  type StoryTree,
} from "../../lib/storyline";

type View = { x: number; y: number; k: number };
type Status = { kind: "info" | "error"; text: string } | null;
type Job = { phase: "running" | "done"; plan: RenderPlan; done: number; output?: string };

const MIN_K = 0.2;
const MAX_K = 2;
const THUMB_W = 116;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- Mocked backends -------------------------------------------------------------------------
// Swap these two for real calls (LLM provider; ComfyUI /prompt + /history polling) when wiring up.

async function mockLlmStoryline(subject: string) {
  console.info("[LLM mock] POST /v1/messages", { task: "branching ruin storyline", subject });
  await sleep(1400);
  return MOCK_LLM_STORY;
}

async function mockComfyKeyframe(prompt: string, year: number) {
  console.info("[ComfyUI mock] POST /prompt", { workflow: "flux3_keyframe", prompt, year });
  await sleep(900 + Math.random() * 700);
  return placeholderImage(prompt, year);
}

async function mockLtxRender(plan: RenderPlan, onSegment: (done: number) => void) {
  console.info("[LTX mock] POST /prompt", {
    workflow: "ltx_video_flf2v",
    segments: plan.segments.map((s) => ({ from: s.from.year, to: s.to.year, seconds: s.seconds })),
  });
  for (let i = 0; i < plan.segments.length; i++) {
    await sleep(700);
    onSegment(i + 1);
  }
  return `mock://ltx/${plan.leafId}.mp4`;
}

// --- Component -------------------------------------------------------------------------------

export function StorylineCanvas() {
  const [tree, setTree] = useState<StoryTree>(() => fromJson(MOCK_STORY));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [subject, setSubject] = useState(MOCK_SUBJECT);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [writing, setWriting] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [status, setStatus] = useState<Status>(null);

  const vpRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ sx: number; sy: number; vx: number; vy: number } | null>(null);
  const dragRef = useRef<{ id: string; cx: number; cy: number; wx: number; wy: number } | null>(null);

  const nodes = useMemo(() => Object.values(tree), [tree]);
  const selected = selectedId ? tree[selectedId] : undefined;
  const hotPath = useMemo(
    () => new Set(selectedId && tree[selectedId] ? pathToRoot(tree, selectedId).map((n) => n.id) : []),
    [tree, selectedId],
  );

  const fit = useCallback((t: StoryTree) => {
    const el = vpRef.current;
    const all = Object.values(t);
    if (!el || !all.length) return;
    const minX = Math.min(...all.map((n) => yearToX(n.year))) - NODE_W / 2;
    const maxX = Math.max(...all.map((n) => yearToX(n.year))) + NODE_W / 2;
    const minY = Math.min(...all.map((n) => n.y));
    const maxY = Math.max(...all.map((n) => n.y)) + NODE_H;
    const pad = 56;
    const k = Math.min(
      1,
      Math.max(MIN_K, Math.min((el.clientWidth - pad * 2) / (maxX - minX), (el.clientHeight - pad * 2) / (maxY - minY))),
    );
    setView({
      k,
      x: (el.clientWidth - (maxX - minX) * k) / 2 - minX * k,
      y: (el.clientHeight - (maxY - minY) * k) / 2 - minY * k,
    });
  }, []);

  useLayoutEffect(() => fit(tree), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Wheel zoom must be a non-passive native listener so it can preventDefault page scroll.
  useEffect(() => {
    const el = vpRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      setView((v) => {
        const k = Math.min(MAX_K, Math.max(MIN_K, v.k * Math.exp(-e.deltaY * 0.0015)));
        const s = k / v.k;
        return { k, x: mx - (mx - v.x) * s, y: my - (my - v.y) * s };
      });
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
    setSelectedId(null);
    setEditingId(null);
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
    dragRef.current = { id, cx: e.clientX, cy: e.clientY, wx: yearToX(n.year), wy: n.y };
    e.currentTarget.setPointerCapture(e.pointerId);
    setSelectedId(id);
    setDraggingId(id);
  };
  const onGripMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const year = xToYear(d.wx + (e.clientX - d.cx) / view.k);
    const y = d.wy + (e.clientY - d.cy) / view.k;
    setTree((t) => (t[d.id] ? { ...t, [d.id]: { ...t[d.id], year: clampYear(t, d.id, year), y } } : t));
  };
  const onGripUp = () => {
    dragRef.current = null;
    setDraggingId(null);
  };

  // -- actions --
  const spawnChild = (id: string) => {
    const { tree: next, id: childId } = addChild(tree, id);
    setTree(next);
    setSelectedId(childId);
    setEditingId(childId);
  };

  const remove = (id: string) => {
    const n = tree[id];
    if (n.parentId === null && !window.confirm("Delete the root beat and the entire storyline?")) return;
    const next = deleteSubtree(tree, id);
    setTree(next);
    if (selectedId && !next[selectedId]) setSelectedId(null);
    setJob(null);
  };

  const generateKeyframe = async (id: string) => {
    if (busy.has(id)) return;
    const prompt = buildPrompt(tree, id, subject);
    const year = tree[id].year;
    setBusy((b) => new Set(b).add(id));
    setStatus({ kind: "info", text: `Queued on ComfyUI: ${prompt}` });
    try {
      const image = await mockComfyKeyframe(prompt, year);
      patch(id, { keyframe: { prompt, image, generatedAt: Date.now() } });
      setStatus({ kind: "info", text: `Keyframe ready for ${formatYear(year)}.` });
    } finally {
      setBusy((b) => {
        const n = new Set(b);
        n.delete(id);
        return n;
      });
    }
  };

  const generateStoryline = async () => {
    setWriting(true);
    setStatus({ kind: "info", text: "Asking the LLM for a branching storyline…" });
    try {
      const next = fromJson(await mockLlmStoryline(subject));
      setTree(next);
      setSelectedId(null);
      setJob(null);
      requestAnimationFrame(() => fit(next));
      setStatus({ kind: "info", text: `Storyline generated: ${Object.keys(next).length} beats.` });
    } finally {
      setWriting(false);
    }
  };

  const renderPath = async () => {
    if (!selected || !isLeaf(tree, selected.id)) return;
    const plan = planVideo(tree, selected.id);
    if (plan.missing.length) {
      setStatus({
        kind: "error",
        text: `Generate keyframes first: ${plan.missing.map((n) => formatYear(n.year)).join(", ")}.`,
      });
      return;
    }
    if (!plan.segments.length) {
      setStatus({ kind: "error", text: "A path needs at least two keyframes." });
      return;
    }
    setStatus(null);
    setJob({ phase: "running", plan, done: 0 });
    const output = await mockLtxRender(plan, (done) => setJob({ phase: "running", plan, done }));
    setJob({ phase: "done", plan, done: plan.segments.length, output });
  };

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(toJson(tree), null, 2));
      setStatus({ kind: "info", text: "Storyline JSON copied to clipboard." });
    } catch {
      setStatus({ kind: "error", text: "Clipboard unavailable." });
    }
  };

  // -- derived screen-space bits for the timeline + keyframe strip --
  const sx = (year: number) => view.x + view.k * yearToX(year);
  const minorTicks = useMemo(() => {
    const out: number[] = [];
    for (let e = 0; e < 5; e++) for (let d = 2; d <= 9; d++) out.push(d * 10 ** e);
    return out;
  }, []);
  const keyed = nodes.filter((n) => n.keyframe);
  const canRender = !!selected && isLeaf(tree, selected.id) && job?.phase !== "running";

  const btn =
    "inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs font-medium tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <section
      className="mx-auto my-4 flex h-[calc(100vh-110px)] min-h-[620px] w-[min(1480px,calc(100%-32px))] flex-col overflow-hidden border border-stage-line bg-stage font-serif text-void"
      aria-label="Storyline canvas"
    >
      {/* Toolbar */}
      <header className="flex flex-wrap items-center gap-2 border-b border-stage-line bg-stage-well px-3 py-2">
        <h2 className="plaque-label mr-2 text-xs text-stage-oxide">Storyline</h2>
        <label className="flex items-center gap-2 text-xs text-stage-dim">
          Subject
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-64 border border-stage-line bg-stage px-2 py-1 text-sm text-void outline-none focus:border-stage-oxide"
          />
        </label>
        <button
          type="button"
          onClick={generateStoryline}
          disabled={writing}
          className={`${btn} border-stage-oxide bg-stage-oxide text-stage hover:brightness-110`}
        >
          {writing ? <LoaderCircle size={14} className="animate-spin" /> : <Wand2 size={14} />}
          Generate Storyline
        </button>
        <button
          type="button"
          onClick={renderPath}
          disabled={!canRender}
          title={canRender ? "Trace this end state back to the root and render it" : "Select a leaf (end-state) node first"}
          className={`${btn} border-stage-oxide text-stage-oxide hover:bg-stage-oxide/15`}
        >
          <Clapperboard size={14} />
          Render Video Path
        </button>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={copyJson} className={`${btn} border-stage-line text-stage-dim hover:text-void`}>
            <Copy size={13} /> JSON
          </button>
          <button type="button" onClick={() => fit(tree)} className={`${btn} border-stage-line text-stage-dim hover:text-void`}>
            <Maximize size={13} /> Fit
          </button>
        </div>
      </header>

      {/* Canvas */}
      <div
        ref={vpRef}
        className="relative min-h-0 flex-1 touch-none select-none overflow-hidden bg-stage-well"
        style={{
          cursor: panRef.current ? "grabbing" : "grab",
          backgroundImage: "radial-gradient(rgba(179,161,120,0.16) 1px, transparent 1px)",
          backgroundSize: `${24 * view.k}px ${24 * view.k}px`,
          backgroundPosition: `${view.x}px ${view.y}px`,
        }}
        onPointerDown={onCanvasDown}
        onPointerMove={onCanvasMove}
        onPointerUp={onCanvasUp}
        onPointerCancel={onCanvasUp}
      >
        {/* Decade guides, tied to the timeline below */}
        {AXIS_TICKS.map((t) => (
          <div
            key={t}
            className="pointer-events-none absolute inset-y-0 w-px bg-stage-line/50"
            style={{ left: sx(t) }}
          />
        ))}

        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}
        >
          <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1">
            {nodes
              .filter((n) => n.parentId && tree[n.parentId])
              .map((n) => {
                const p = tree[n.parentId!];
                const x1 = yearToX(p.year) + NODE_W / 2;
                const y1 = p.y + NODE_H / 2;
                const x2 = yearToX(n.year) - NODE_W / 2;
                const y2 = n.y + NODE_H / 2;
                const c = Math.max(60, Math.abs(x2 - x1) / 2);
                const hot = hotPath.has(n.id);
                return (
                  <path
                    key={n.id}
                    d={`M${x1} ${y1} C${x1 + c} ${y1} ${x2 - c} ${y2} ${x2} ${y2}`}
                    fill="none"
                    stroke={hot ? "#d98a5e" : "#4a3620"}
                    strokeWidth={hot ? 3 : 2}
                  />
                );
              })}
          </svg>

          {nodes.map((n) => {
            const leaf = isLeaf(tree, n.id);
            const sel = n.id === selectedId;
            const working = busy.has(n.id);
            return (
              <div
                key={n.id}
                data-ui
                onPointerDown={() => setSelectedId(n.id)}
                className={`absolute flex cursor-default flex-col border bg-stage text-void shadow-[0_6px_18px_rgba(0,0,0,0.45)] ${
                  sel ? "border-stage-oxide ring-1 ring-stage-oxide" : hotPath.has(n.id) ? "border-stage-oxide/60" : "border-stage-line"
                }`}
                style={{ left: yearToX(n.year) - NODE_W / 2, top: n.y, width: NODE_W, height: NODE_H, zIndex: draggingId === n.id ? 20 : sel ? 10 : 1 }}
              >
                {/* Grip / header: drag left-right to change when this happens */}
                <div
                  className="flex cursor-grab items-center justify-between border-b border-stage-line bg-stage-well px-2 py-1 active:cursor-grabbing"
                  onPointerDown={(e) => onGripDown(e, n.id)}
                  onPointerMove={onGripMove}
                  onPointerUp={onGripUp}
                  onPointerCancel={onGripUp}
                  title="Drag horizontally to change the year"
                >
                  <span className="plaque-label text-[10px] text-stage-oxide">
                    {formatYear(n.year)}
                    {leaf && <span className="ml-2 text-stage-dim">· end</span>}
                  </span>
                  <button
                    type="button"
                    aria-label="Delete beat and its descendants"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => remove(n.id)}
                    className="p-0.5 text-stage-dim hover:text-stage-oxide"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                <div className="min-h-0 flex-1 px-2.5 py-2">
                  {editingId === n.id ? (
                    <textarea
                      autoFocus
                      defaultValue={n.text}
                      onBlur={(e) => {
                        patch(n.id, { text: e.target.value.trim() || n.text });
                        setEditingId(null);
                      }}
                      onKeyDown={(e) => e.key === "Escape" && (e.target as HTMLElement).blur()}
                      className="h-full w-full resize-none border border-stage-line bg-stage-well p-1 text-[13px] leading-snug text-void outline-none focus:border-stage-oxide"
                    />
                  ) : (
                    <p
                      onClick={() => setEditingId(n.id)}
                      className="h-full cursor-text overflow-y-auto text-[13px] leading-snug"
                      title="Click to edit"
                    >
                      {n.text}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  disabled={working}
                  onClick={() => generateKeyframe(n.id)}
                  className="m-2 mt-0 inline-flex items-center justify-center gap-1.5 border border-stage-line py-1 text-[11px] tracking-wide text-stage-dim hover:border-stage-oxide hover:text-stage-oxide disabled:opacity-60"
                >
                  {working ? <LoaderCircle size={12} className="animate-spin" /> : <ImagePlus size={12} />}
                  {working ? "Generating…" : n.keyframe ? "Regenerate Keyframe" : "Generate Keyframe"}
                </button>

                {/* Edge "+" spawns a child */}
                <button
                  type="button"
                  aria-label="Add child beat"
                  onClick={() => spawnChild(n.id)}
                  className="absolute -right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-stage-oxide bg-stage text-stage-oxide hover:bg-stage-oxide hover:text-stage"
                >
                  <Plus size={14} />
                </button>
                {n.parentId && (
                  <span className="pointer-events-none absolute -left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-stage-line bg-stage" />
                )}
              </div>
            );
          })}
        </div>

        {status && (
          <div
            data-ui
            className={`absolute bottom-3 left-3 max-w-[60%] border bg-stage/95 px-3 py-1.5 text-xs ${
              status.kind === "error" ? "border-oxide text-stage-oxide" : "border-stage-line text-stage-dim"
            }`}
          >
            {status.text}
          </div>
        )}

        {job && (
          <div data-ui className="absolute bottom-3 right-3 w-80 border border-stage-oxide bg-stage/95 p-3 text-xs">
            <div className="mb-2 flex items-center justify-between">
              <span className="plaque-label text-stage-oxide">LTX Video · mock</span>
              <button type="button" aria-label="Close" onClick={() => setJob(null)} className="text-stage-dim hover:text-void">
                <X size={14} />
              </button>
            </div>
            <ol className="max-h-40 space-y-1 overflow-y-auto">
              {job.plan.segments.map((s, i) => (
                <li key={i} className="flex items-center gap-2">
                  <img src={s.fromImage} alt="" className="h-6 w-10 object-cover" />
                  <span className="text-stage-dim">→</span>
                  <img src={s.toImage} alt="" className="h-6 w-10 object-cover" />
                  <span className="flex-1 truncate">
                    {s.from.year.toLocaleString()} → {s.to.year.toLocaleString()} yr · {s.seconds}s
                  </span>
                  <span className={i < job.done ? "text-sage" : "text-stage-dim"}>{i < job.done ? "✓" : "…"}</span>
                </li>
              ))}
            </ol>
            <div className="mt-2 text-stage-dim">
              {job.phase === "running"
                ? `Rendering segment ${Math.min(job.done + 1, job.plan.segments.length)} of ${job.plan.segments.length}…`
                : `Done · ${job.plan.segments.reduce((a, s) => a + s.seconds, 0)}s · ${job.output}`}
            </div>
          </div>
        )}
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
              onClick={() => setSelectedId(n.id)}
              title={n.keyframe!.prompt}
              className={`absolute bottom-0 flex flex-col items-center ${n.id === selectedId ? "z-10" : ""}`}
              style={{ left: sx(n.year) - THUMB_W / 2, width: THUMB_W }}
            >
              <img
                src={n.keyframe!.image}
                alt={`Keyframe ${formatYear(n.year)}`}
                className={`h-[60px] w-full border object-cover ${n.id === selectedId ? "border-stage-oxide" : "border-stage-line"}`}
              />
              <span className="text-[10px] leading-4 text-stage-dim">{formatYear(n.year)}</span>
            </button>
          ))}
      </div>

      {/* Timeline axis */}
      <div className="relative h-9 shrink-0 overflow-hidden border-t border-stage-line bg-stage-well">
        <div className="absolute inset-x-0 top-0 h-px bg-edge" />
        {minorTicks.map((t) => (
          <div key={t} className="absolute top-0 h-1.5 w-px bg-stage-line" style={{ left: sx(t) }} />
        ))}
        {AXIS_TICKS.map((t) => (
          <div key={t} className="absolute top-0 flex flex-col items-start" style={{ left: sx(t) }}>
            <div className="h-3 w-px bg-stage-dim" />
            <span className="plaque-label -translate-x-1/2 pt-0.5 text-[10px] text-stage-dim">{formatYear(t)}</span>
          </div>
        ))}
        {nodes.map((n) => (
          <div
            key={n.id}
            className={`absolute top-[-3px] h-1.5 w-1.5 -translate-x-1/2 rounded-full ${
              n.id === selectedId ? "bg-stage-oxide" : "bg-stage-dim"
            }`}
            style={{ left: sx(n.year) }}
          />
        ))}
        {draggingId && tree[draggingId] && (
          <span
            className="absolute bottom-0.5 -translate-x-1/2 bg-stage-oxide px-1.5 text-[10px] font-medium text-stage"
            style={{ left: sx(tree[draggingId].year) }}
          >
            {formatYear(tree[draggingId].year)}
          </span>
        )}
      </div>
    </section>
  );
}
