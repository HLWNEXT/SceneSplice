// Storyline model: a tree of story beats. A beat's X position on the canvas is a pure function of
// its `year`, so dragging horizontally edits time. The log scale gives each decade equal width
// (same spirit as lib/decay.ts), which is what makes Year 10 / 100 / 10,000 sit on one axis.

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
};

export type StoryTree = Record<string, StoryNode>;

// Nested form: what an LLM returns and what we export. Easy to JSON.stringify/parse.
export type StoryJson = { text: string; year: number; children?: StoryJson[] };

export const NODE_W = 230;
export const NODE_H = 158;
export const ROW_H = NODE_H + 36;
export const PX_PER_DECADE = 520;
export const MAX_YEAR = 100_000;

export const AXIS_TICKS: readonly number[] = [0, 1, 10, 100, 1_000, 10_000, 100_000];

export const yearToX = (year: number) => Math.log10(1 + Math.max(0, year)) * PX_PER_DECADE;
export const xToYear = (x: number) => 10 ** (Math.max(0, x) / PX_PER_DECADE) - 1;

// Round to 2 significant figures so dragged values read as "340" not "338.17".
export function roundYear(year: number): number {
  if (year < 10) return Math.max(0, Math.round(year));
  const mag = 10 ** (Math.floor(Math.log10(year)) - 1);
  return Math.min(MAX_YEAR, Math.round(year / mag) * mag);
}

export function formatYear(year: number): string {
  return `Year ${year.toLocaleString("en-US")}`;
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
export function clampYear(tree: StoryTree, id: string, year: number): number {
  const node = tree[id];
  const lo = node?.parentId ? (tree[node.parentId]?.year ?? 0) : 0;
  const kids = childrenOf(tree, id);
  const hi = kids.length ? Math.min(...kids.map((k) => k.year)) : MAX_YEAR;
  return Math.min(hi, Math.max(lo, roundYear(year)));
}

let seq = 0;
export const newId = () => `n${Date.now().toString(36)}${(seq++).toString(36)}`;

// New child sits one decade-ish later and below any existing siblings.
export function addChild(tree: StoryTree, parentId: string): { tree: StoryTree; id: string } {
  const parent = tree[parentId];
  const kids = childrenOf(tree, parentId);
  const nextTick = AXIS_TICKS.find((t) => t > parent.year) ?? MAX_YEAR;
  const year = Math.min(
    nextTick,
    roundYear(Math.max(parent.year * 3, parent.year + 5)),
  );
  const childYear = Math.min(MAX_YEAR, Math.max(year, parent.year));
  const lowest = kids.length ? Math.max(...kids.map((k) => k.y)) + ROW_H : parent.y;
  // Walk down in whole rows until no existing beat overlaps the new one on screen.
  const taken = (y: number) =>
    Object.values(tree).some(
      (n) => Math.abs(yearToX(n.year) - yearToX(childYear)) < NODE_W + 12 && Math.abs(n.y - y) < ROW_H - 1,
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
  const ancestors = pathToRoot(tree, id).slice(0, -1).reverse();
  return ancestors.find((n) => n.keyframe?.file)?.keyframe?.file ?? null;
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
