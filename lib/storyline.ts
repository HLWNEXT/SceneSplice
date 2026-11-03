// Storyline model: a tree of story beats. A beat's X position on the canvas is a pure function of
// its `year` and the current time scale (pixels per year), so dragging horizontally edits time.
// The time scale is independent of node size: zooming the timeline spreads beats apart without
// resizing them, and resizing nodes never changes the time span. `year` may be fractional
// (snapped to whole months or coarser), so beats can sit closer together than a year.

// Structural match for comfy.ts's OutputFile (kept local so this module stays free of JSON imports).
export type ComfyFile = { filename: string; subfolder: string; type: string };

// `image` is what the UI shows; `file` is the ComfyUI output it came from (absent for mock renders).
export type Keyframe = { prompt: string; image: string; generatedAt: number; file?: ComfyFile };

export type StoryNode = {
  id: string;
  parentId: string | null;
  text: string;
  year: number;
  y: number; // world-space vertical position (free; only X is bound to time)
  keyframe?: Keyframe;
  /** LTX clip animated from this beat's keyframe. */
  video?: ComfyFile;
  /** How the clip was made: the prompt LTX animated from, and whether it ran first-frame to last-frame. */
  videoMeta?: { prompt: string; mode: "flf2v" | "single" };
  /** Keyframe 0: the original Street View photo every storyline grows from. Not editable, draggable or deletable. */
  origin?: boolean;
};

export type StoryTree = Record<string, StoryNode>;

// Nested form: what an LLM returns and what we export. Easy to JSON.stringify/parse.
export type StoryJson = { text: string; year: number; children?: StoryJson[] };

export const NODE_W = 230;
export const NODE_H = 158;
export const ROW_H = NODE_H + 36;
export const MAX_YEAR = 100_000;

/** Time scale: horizontal pixels per year. Independent of node size. */
export const MIN_PX_PER_YEAR = 0.2;
export const MAX_PX_PER_YEAR = 6000;
export const DEFAULT_PX_PER_YEAR = 80;
export const clampScale = (ppy: number) => Math.min(MAX_PX_PER_YEAR, Math.max(MIN_PX_PER_YEAR, ppy));

export const yearToX = (year: number, ppy: number) => Math.max(0, year) * ppy;
export const xToYear = (x: number, ppy: number) => Math.max(0, x) / ppy;

// [major step, minor step] in years. The axis picks the smallest major step that leaves room for a label.
const TICK_STEPS: readonly (readonly [number, number | null])[] = [
  [1 / 12, null],
  [1 / 4, 1 / 12],
  [1 / 2, 1 / 12],
  [1, 1 / 12],
  [2, 1],
  [5, 1],
  [10, 2],
  [20, 5],
  [50, 10],
  [100, 20],
  [200, 50],
  [500, 100],
  [1_000, 200],
  [2_000, 500],
  [5_000, 1_000],
  [10_000, 2_000],
  [20_000, 5_000],
  [50_000, 10_000],
  [100_000, 20_000],
];
const MIN_LABEL_PX = 96;
const MIN_MINOR_PX = 10;
const SNAP_PX = 12;

/** Major/minor tick years covering [from, to] for the given time scale. */
export function axisTicks(ppy: number, from: number, to: number): { major: number[]; minor: number[] } {
  const [step, minorStep] = TICK_STEPS.find(([s]) => s * ppy >= MIN_LABEL_PX) ?? TICK_STEPS[TICK_STEPS.length - 1];
  const gen = (s: number) => {
    const out: number[] = [];
    for (let i = Math.max(0, Math.ceil(from / s - 1e-9)); i * s <= to && out.length < 600; i++) out.push(i * s);
    return out;
  };
  const isMajor = (t: number) => Math.abs(t / step - Math.round(t / step)) < 1e-6;
  return {
    major: gen(step),
    minor: minorStep && minorStep * ppy >= MIN_MINOR_PX ? gen(minorStep).filter((t) => !isMajor(t)) : [],
  };
}

// Dragging snaps to the finest grid step that is at least SNAP_PX wide, so zooming in unlocks finer
// time (quarters, then months). Without a scale it snaps to whole months.
export function snapStep(ppy?: number): number {
  if (!ppy) return 1 / 12;
  const steps = TICK_STEPS.flatMap(([s, m]) => (m ? [m, s] : [s]));
  return steps.find((s) => s * ppy >= SNAP_PX) ?? 100_000;
}

export function roundYear(year: number, ppy?: number): number {
  const step = snapStep(ppy);
  return Math.min(MAX_YEAR, Math.max(0, Math.round(year / step) * step));
}

const monthsOf = (years: number) => Math.round(years * 12);

/** "Year 8", "Month 6", "Year 1, month 3". */
export function formatYear(year: number): string {
  const months = monthsOf(year);
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (m === 0) return `Year ${y.toLocaleString("en-US")}`;
  return y === 0 ? `Month ${m}` : `Year ${y.toLocaleString("en-US")}, month ${m}`;
}

/** Compact axis label: "0", "3 mo", "1 yr", "1 yr 6 mo", "1,000 yr". */
export function tickLabel(year: number): string {
  const months = monthsOf(year);
  if (months === 0) return "0";
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y ? `${y.toLocaleString("en-US")} yr` : "", m ? `${m} mo` : ""].filter(Boolean).join(" ");
}

export const childrenOf = (tree: StoryTree, id: string | null): StoryNode[] =>
  Object.values(tree)
    .filter((n) => n.parentId === id)
    .sort((a, b) => a.y - b.y);

export const isLeaf = (tree: StoryTree, id: string) => childrenOf(tree, id).length === 0;

export function descendantIds(tree: StoryTree, id: string): string[] {
  const out: string[] = [];
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    out.push(cur);
    for (const c of childrenOf(tree, cur)) stack.push(c.id);
  }
  return out;
}

// Root -> node, inclusive.
export function pathToRoot(tree: StoryTree, id: string): StoryNode[] {
  const path: StoryNode[] = [];
  const seen = new Set<string>();
  let cur: StoryNode | undefined = tree[id];
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    path.unshift(cur);
    cur = cur.parentId ? tree[cur.parentId] : undefined;
  }
  return path;
}

// Deleting a node removes its whole subtree so no orphans are left behind.
export function deleteSubtree(tree: StoryTree, id: string): StoryTree {
  const gone = new Set(descendantIds(tree, id));
  return Object.fromEntries(Object.entries(tree).filter(([k]) => !gone.has(k)));
}

// A beat may not happen before its parent or after any child.
export function clampYear(tree: StoryTree, id: string, year: number, ppy?: number): number {
  const node = tree[id];
  const lo = node?.parentId ? (tree[node.parentId]?.year ?? 0) : 0;
  const kids = childrenOf(tree, id);
  const hi = kids.length ? Math.min(...kids.map((k) => k.year)) : MAX_YEAR;
  return Math.min(hi, Math.max(lo, roundYear(year, ppy)));
}

let seq = 0;
export const newId = () => `n${Date.now().toString(36)}${(seq++).toString(36)}`;

// New child sits a year after its parent and below any existing siblings. `ppy` is only used to
// judge on-screen overlap when picking a free row.
export function addChild(
  tree: StoryTree,
  parentId: string,
  ppy = DEFAULT_PX_PER_YEAR,
): { tree: StoryTree; id: string } {
  const parent = tree[parentId];
  const kids = childrenOf(tree, parentId);
  const childYear = Math.min(MAX_YEAR, parent.year + 1);
  const lowest = kids.length ? Math.max(...kids.map((k) => k.y)) + ROW_H : parent.y;
  // Walk down in whole rows until no existing beat overlaps the new one on screen.
  const taken = (y: number) =>
    Object.values(tree).some(
      (n) => Math.abs(yearToX(n.year, ppy) - yearToX(childYear, ppy)) < NODE_W + 12 && Math.abs(n.y - y) < ROW_H - 1,
    );
  let y = lowest;
  while (taken(y)) y += ROW_H;
  const id = newId();
  const node: StoryNode = {
    id,
    parentId,
    text: "New story beat — describe what happens here.",
    year: childYear,
    y,
  };
  return { tree: { ...tree, [id]: node }, id };
}

// Nested JSON -> flat tree with auto layout: leaves take consecutive rows, parents center on children.
export const ORIGIN_ID = "origin";
/** Horizontal gap, in px at full node size, between keyframe 0 and the first beat. */
export const ORIGIN_GAP = 56;

/**
 * Puts the original photo in front of a storyline as keyframe 0: a locked node the story's first beat
 * hangs from, so every keyframe and video chain starts from the real street.
 */
export function attachOrigin(tree: StoryTree, photo: Keyframe, text: string): StoryTree {
  const root = Object.values(tree).find((n) => n.parentId === null);
  if (!root) return tree;
  return {
    [ORIGIN_ID]: { id: ORIGIN_ID, parentId: null, text, year: root.year, y: root.y, keyframe: photo, origin: true },
    ...tree,
    [root.id]: { ...root, parentId: ORIGIN_ID },
  };
}

export function fromJson(root: StoryJson): StoryTree {
  const tree: StoryTree = {};
  let row = 0;
  const walk = (j: StoryJson, parentId: string | null): number => {
    const id = newId();
    const kids = (j.children ?? []).map((c) => walk(c, id));
    const y = kids.length ? (Math.min(...kids) + Math.max(...kids)) / 2 : row++ * ROW_H;
    tree[id] = { id, parentId, text: j.text, year: roundYear(j.year), y };
    return y;
  };
  walk(root, null);
  return tree;
}

export function toJson(tree: StoryTree, id?: string): StoryJson | null {
  const rootNode = id ? tree[id] : childrenOf(tree, null)[0];
  if (!rootNode) return null;
  const build = (n: StoryNode): StoryJson => {
    const kids = childrenOf(tree, n.id).map(build);
    return { text: n.text, year: n.year, ...(kids.length ? { children: kids } : {}) };
  };
  return build(rootNode);
}

export function buildPrompt(tree: StoryTree, id: string, subject: string): string {
  const path = pathToRoot(tree, id);
  const node = tree[id];
  const history = path
    .slice(0, -1)
    .map((n) => `${formatYear(n.year)}: ${n.text}`)
    .join(" ");
  return [
    `Edit THIS photograph of ${subject}: keep the building, camera position and framing unchanged, and show how it looks ${formatYear(node.year)} after completion.`,
    `Event: ${node.text}`,
    history && `Preceding history: ${history}`,
    "Same camera position, overcast light, photoreal, progressive material decay and overgrowth.",
  ]
    .filter(Boolean)
    .join(" ");
}

// Deterministic placeholder "render": a stylised facade whose decay grows with log(year).
// Stands in for the FLUX output until the real ComfyUI call is wired up.
export function placeholderImage(seedText: string, year: number): string {
  let h = 2166136261;
  for (const ch of seedText) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) % 1000) / 1000;
  const decay = Math.min(1, Math.log10(1 + year) / 4);
  const hue = Math.round(35 + decay * 70);
  const sat = Math.round(45 - decay * 15);
  let bars = "";
  const cols = 7;
  for (let i = 0; i < cols; i++) {
    const missing = rnd() < decay * 0.7;
    const top = 40 + Math.round(rnd() * decay * 70);
    if (missing) continue;
    bars += `<rect x="${10 + i * 22}" y="${top}" width="16" height="${100 - top}" fill="hsl(${hue},${sat}%,${28 - decay * 8}%)"/>`;
  }
  let green = "";
  for (let i = 0; i < Math.round(decay * 18); i++) {
    green += `<circle cx="${Math.round(rnd() * 170)}" cy="${60 + Math.round(rnd() * 40)}" r="${3 + Math.round(rnd() * 6)}" fill="hsl(${95 + Math.round(rnd() * 25)},40%,${22 + Math.round(rnd() * 10)}%)"/>`;
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 170 100">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue},20%,${70 - decay * 25}%)"/><stop offset="1" stop-color="hsl(${hue},25%,${40 - decay * 15}%)"/></linearGradient></defs>` +
    `<rect width="170" height="100" fill="url(#g)"/>${bars}${green}` +
    `<rect y="92" width="170" height="8" fill="hsl(${hue},20%,12%)"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// The image a node's keyframe should be edited from: the nearest ancestor's generated keyframe,
// or null when none exists yet (the caller then falls back to the user's base photo).
export function keyframeSource(tree: StoryTree, id: string): ComfyFile | null {
  return previousKeyframeNode(tree, id)?.keyframe?.file ?? null;
}

// The nearest ancestor that has a real (ComfyUI-rendered) keyframe: the "previous keyframe" a video
// starts from, and the source image a keyframe is edited from.
export function previousKeyframeNode(tree: StoryTree, id: string): StoryNode | null {
  const ancestors = pathToRoot(tree, id).slice(0, -1).reverse();
  return ancestors.find((n) => n.keyframe?.file) ?? null;
}

export type RenderPlan = {
  leafId: string;
  segments: { from: StoryNode; to: StoryNode; fromImage: string; toImage: string; seconds: number }[];
  missing: StoryNode[];
};

// Walks leaf -> root, reports beats that still need keyframes, and pairs consecutive keyframes
// into LTX first-frame/last-frame segments (longer time jumps get longer clips, log-scaled).
export function planVideo(tree: StoryTree, leafId: string): RenderPlan {
  const path = pathToRoot(tree, leafId);
  const missing = path.filter((n) => !n.keyframe);
  const keyed = path.filter((n) => n.keyframe);
  const segments = keyed.slice(1).map((to, i) => {
    const from = keyed[i];
    const span = Math.log10(1 + to.year) - Math.log10(1 + from.year);
    return {
      from,
      to,
      fromImage: from.keyframe!.image,
      toImage: to.keyframe!.image,
      seconds: Math.max(2, Math.round(2 + span * 3)),
    };
  });
  return { leafId, segments, missing };
}

export const MOCK_SUBJECT = "a 1970s brutalist public library";

export const MOCK_STORY: StoryJson = {
  year: 0,
  text: "The library opens: raw concrete, glass curtain wall, full occupancy.",
  children: [
    {
      year: 8,
      text: "Maintenance budgets are cut; the roof membrane begins to leak.",
      children: [
        {
          year: 30,
          text: "The atrium roof fails and rain pours into the reading rooms.",
          children: [
            {
              year: 100,
              text: "Pioneer vegetation colonises the atrium; roots lift the floor slabs.",
              children: [
                {
                  year: 300,
                  text: "Trees break through the upper floors; ivy swallows the facade.",
                  children: [
                    {
                      year: 3000,
                      text: "Soil buries the lower storeys: a wooded hill ribbed with concrete.",
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          year: 30,
          text: "Rising seas flood the ground floor; salt water eats the columns.",
          children: [
            {
              year: 120,
              text: "A tidal marsh forms inside; the building becomes an island.",
              children: [
                {
                  year: 1000,
                  text: "Mineral crust coats the walls; only the tallest columns stand.",
                  children: [
                    { year: 10000, text: "A single column rises from open shallows." },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      year: 15,
      text: "Volunteers patch the roof and reoccupy the lower floors.",
      children: [
        {
          year: 200,
          text: "A market hall grows inside the shell, with timber infill.",
          children: [
            { year: 2000, text: "A timber village wraps the weathered concrete shell." },
          ],
        },
      ],
    },
  ],
};

// What "Generate Storyline" returns: a different branching future for the same building.
export const MOCK_LLM_STORY: StoryJson = {
  year: 0,
  text: "Opening day: the library anchors a thriving civic quarter.",
  children: [
    {
      year: 12,
      text: "A wildfire in the adjacent park scorches the east facade.",
      children: [
        {
          year: 60,
          text: "The scarred wing is abandoned and sealed with plywood.",
          children: [
            {
              year: 400,
              text: "Pigeons, moss and graffiti turn the wing into a vertical ecosystem.",
              children: [{ year: 5000, text: "The wing collapses into a gravel garden of wildflowers." }],
            },
          ],
        },
      ],
    },
    {
      year: 25,
      text: "The city converts the library into a data centre, hiding the windows.",
      children: [
        {
          year: 150,
          text: "The servers go dark; copper thieves strip the building.",
          children: [{ year: 1500, text: "A hollow shell hosts nesting falcons above a dry courtyard." }],
        },
        {
          year: 90,
          text: "Geothermal retrofit keeps it alive as a heat exchanger.",
          children: [{ year: 800, text: "Geothermal pipes outlast the walls, steaming through the ruin." }],
        },
      ],
    },
  ],
};
