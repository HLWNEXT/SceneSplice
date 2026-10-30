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

export function buildOverpassQuery(lat: number, lon: number, radius: number): string {
  return `[out:json][timeout:25];way["building"](around:${radius},${lat},${lon});out geom;`;
}

export function parseBuildingHeight(tags?: Record<string, string>): number {
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
  tags?: Record<string, string>;
  geometry?: LatLon[];
};

/** Turns an Overpass `out geom` response into buildings around `center`. Ways only (no multipolygon relations). */
export function parseOverpass(json: { elements?: OverpassWay[] }, center: LatLon): Building[] {
  const buildings: Building[] = [];
  for (const el of json.elements ?? []) {
    if (el.type !== "way" || !el.geometry) continue;
    const pts = el.geometry.map((p) => project(p, center));
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (first && last && first[0] === last[0] && first[1] === last[1]) pts.pop();
    if (pts.length < 3) continue;
    buildings.push({ id: el.id, footprint: pts, height: parseBuildingHeight(el.tags), isTarget: false });
  }

  const target =
    buildings.find((b) => contains(b.footprint, 0, 0)) ??
    buildings.reduce<Building | undefined>((best, b) => {
      const d = (x: Building) => {
        const cx = x.footprint.reduce((s, p) => s + p[0], 0) / x.footprint.length;
        const cy = x.footprint.reduce((s, p) => s + p[1], 0) / x.footprint.length;
        return Math.hypot(cx, cy);
      };
      return !best || d(b) < d(best) ? b : best;
    }, undefined);
  if (target) target.isTarget = true;
  return buildings;
}

export type GeoResult = { label: string; lat: number; lon: number };
