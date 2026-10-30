// OpenStreetMap helpers: Overpass query, building parsing, projection to local meters.

export type LatLon = { lat: number; lon: number };
export type Building = {
  id: number;
  /** Footprint polygon in meters relative to the search centre: [east, south]. */
  footprint: [number, number][];
  height: number;
  isTarget: boolean;
};

export const DEFAULT_HEIGHT = 10;
export const METERS_PER_LEVEL = 3;

export type Road = { id: number; width: number; points: [number, number][] };
export type Tree = { x: number; z: number };
export type Green = { id: number; footprint: [number, number][] };
export type Scenery = { roads: Road[]; trees: Tree[]; greens: Green[] };

const TREE_SPACING = 12;
const MAX_TREES = 400;

const ROAD_WIDTHS: Record<string, number> = {
  motorway: 14, trunk: 14, primary: 12, secondary: 10, tertiary: 9, unclassified: 7, residential: 7,
  living_street: 6, service: 4, pedestrian: 5, footway: 2, path: 2,
};

export function buildOverpassQuery(lat: number, lon: number, radius: number): string {
  const around = `(around:${radius},${lat},${lon})`;
  const highways = Object.keys(ROAD_WIDTHS).join("|");
  return (
    `[out:json][timeout:25];(way["building"]${around};way["building:part"]${around};` +
    `way["highway"~"^(${highways})$"]${around};node["natural"="tree"]${around};` +
    `way["leisure"~"^(park|garden)$"]${around};way["natural"="wood"]${around};way["landuse"="forest"]${around};);out geom;`
  );
}

export function parseBuildingHeight(tags?: Record<string, string | undefined>): number {
  const h = parseFloat(tags?.height ?? "");
  if (Number.isFinite(h) && h > 0) return h;
  const levels = parseFloat(tags?.["building:levels"] ?? "");
  if (Number.isFinite(levels) && levels > 0) return levels * METERS_PER_LEVEL;
  return DEFAULT_HEIGHT;
}

function project(p: LatLon, c: LatLon): [number, number] {
  const east = (p.lon - c.lon) * 111_320 * Math.cos((c.lat * Math.PI) / 180);
  const south = -(p.lat - c.lat) * 110_540;
  return [east, south];
}

function contains(poly: [number, number][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

type OverpassWay = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string | undefined>;
  geometry?: LatLon[];
};

function footprintOf(el: OverpassWay, center: LatLon): [number, number][] | null {
  if (el.type !== "way" || !el.geometry) return null;
  const pts = el.geometry.map((p) => project(p, center));
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (first && last && first[0] === last[0] && first[1] === last[1]) pts.pop();
  return pts.length >= 3 ? pts : null;
}

function centroid(poly: [number, number][]): [number, number] {
  return [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];
}

/**
 * Turns an Overpass `out geom` response into buildings around `center`. Ways only (no multipolygon relations).
 * Outlines that contain `building:part` shapes are replaced by those parts, which carry the real heights of towers.
 */
export function parseOverpass(json: { elements?: OverpassWay[] }, center: LatLon): Building[] {
  const outlines: Building[] = [];
  const parts: Building[] = [];
  for (const el of json.elements ?? []) {
    const isPart = !!el.tags?.["building:part"] && !el.tags?.building;
    if (!el.tags?.building && !isPart) continue;
    const footprint = footprintOf(el, center);
    if (!footprint) continue;
    (isPart ? parts : outlines).push({ id: el.id, footprint, height: parseBuildingHeight(el.tags), isTarget: false });
  }

  const partsIn = (o: Building) => parts.filter((p) => contains(o.footprint, ...centroid(p.footprint)));
  const orphanParts = parts.filter((p) => !outlines.some((o) => contains(o.footprint, ...centroid(p.footprint))));
  const candidates = [...outlines, ...orphanParts];

  const target =
    candidates.find((b) => contains(b.footprint, 0, 0)) ??
    candidates.reduce<Building | undefined>((best, b) => {
      const d = (x: Building) => Math.hypot(...centroid(x.footprint));
      return !best || d(b) < d(best) ? b : best;
    }, undefined);

  const out: Building[] = [];
  for (const o of candidates) {
    const inner = outlines.includes(o) ? partsIn(o) : [];
    if (inner.length === 0) out.push({ ...o, isTarget: o === target });
    else for (const p of inner) out.push({ ...p, isTarget: o === target });
  }
  return out;
}

/** Roads (ways tagged highway) and individual trees (nodes tagged natural=tree) around `center`. */
export function parseScenery(json: { elements?: OverpassWay[] }, center: LatLon): Scenery {
  const roads: Road[] = [];
  const trees: Tree[] = [];
  const greens: Green[] = [];
  for (const el of json.elements ?? []) {
    const t = el.tags;
    if (t && !t.building && !t.highway && (t.leisure === "park" || t.leisure === "garden" || t.natural === "wood" || t.landuse === "forest")) {
      const footprint = footprintOf(el, center);
      if (footprint) greens.push({ id: el.id, footprint });
    } else if (el.type === "way" && el.geometry && el.tags?.highway && el.geometry.length >= 2) {
      const width = ROAD_WIDTHS[el.tags.highway];
      if (width) roads.push({ id: el.id, width, points: el.geometry.map((p) => project(p, center)) });
    } else if (el.type === "node" && el.tags?.natural === "tree" && el.lat !== undefined && el.lon !== undefined) {
      const [x, z] = project({ lat: el.lat, lon: el.lon }, center);
      trees.push({ x, z });
    }
  }
  // Mapped parks and woods get trees on a jittered grid so they read as green space, capped to keep the scene light.
  const jitter = (a: number, b: number) => (Math.abs(Math.sin(a * 12.9898 + b * 78.233) * 43758.5453) % 1) * (TREE_SPACING / 2);
  for (const g of greens) {
    const xs = g.footprint.map((p) => p[0]);
    const zs = g.footprint.map((p) => p[1]);
    for (let x = Math.min(...xs); x <= Math.max(...xs) && trees.length < MAX_TREES; x += TREE_SPACING) {
      for (let z = Math.min(...zs); z <= Math.max(...zs) && trees.length < MAX_TREES; z += TREE_SPACING) {
        const tx = x + jitter(x, z);
        const tz = z + jitter(z, x);
        if (contains(g.footprint, tx, tz)) trees.push({ x: tx, z: tz });
      }
    }
  }
  return { roads, trees, greens };
}

export type GeoResult = { label: string; lat: number; lon: number };
